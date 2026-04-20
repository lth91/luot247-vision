import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Cửa sổ gom: 2 bài trong cùng 30 phút cùng category → 1 event
const WINDOW_MINUTES = 30

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Lấy tin quan trọng 24h gần nhất
  const { data: news, error: newsErr } = await supabase
    .from('news_iran')
    .select('id, title, description, category, severity, published_at, location_name, lat, lng')
    .gte('published_at', since)
    .gte('severity', 3)
    .order('published_at', { ascending: false })
    .limit(200)

  if (newsErr) {
    return new Response(
      JSON.stringify({ ok: false, error: newsErr.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Gom bucket theo (category, window_start)
  const buckets = new Map<string, any>()
  for (const n of news ?? []) {
    const t = new Date(n.published_at).getTime()
    const windowStart = Math.floor(t / (WINDOW_MINUTES * 60 * 1000)) * (WINDOW_MINUTES * 60 * 1000)
    const key = `${n.category}_${windowStart}`
    const existing = buckets.get(key)
    if (!existing || n.severity > existing.severity) {
      buckets.set(key, {
        occurred_at: new Date(windowStart).toISOString(),
        title: n.title,
        summary: n.description,
        event_type: n.category,
        severity: n.severity,
        location_name: n.location_name,
        lat: n.lat,
        lng: n.lng,
        source_news_id: n.id,
      })
    }
  }

  const events = Array.from(buckets.values())

  // Clear events > 48h để giữ bảng gọn
  await supabase
    .from('iran_events')
    .delete()
    .lt('occurred_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())

  let inserted = 0
  if (events.length > 0) {
    const { data, error } = await supabase
      .from('iran_events')
      .insert(events)
      .select('id')
    if (error) {
      return new Response(
        JSON.stringify({ ok: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    inserted = data?.length ?? 0
  }

  // Cập nhật iran_stats counters từ news 24h
  const recent24h = (news ?? [])
  const strikes = recent24h.filter(n => n.category === 'strike').length
  const casualties = recent24h.filter(n => n.category === 'casualty').length
  const diplomacy = recent24h.filter(n => n.category === 'diplomacy').length

  await Promise.all([
    supabase.from('iran_stats').update({ stat_value: strikes,    updated_at: new Date().toISOString() }).eq('stat_key', 'strikes_total'),
    supabase.from('iran_stats').update({ stat_value: casualties, updated_at: new Date().toISOString() }).eq('stat_key', 'casualties_reported'),
    supabase.from('iran_stats').update({ stat_value: diplomacy,  updated_at: new Date().toISOString() }).eq('stat_key', 'diplomacy_events'),
  ])

  return new Response(
    JSON.stringify({ ok: true, news_scanned: news?.length ?? 0, events_inserted: inserted, strikes, casualties, diplomacy }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
