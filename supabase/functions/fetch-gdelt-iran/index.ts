import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// GDELT Doc 2.0 API — docs: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
const GDELT_QUERY = encodeURIComponent(
  '(iran OR iranian OR tehran) AND (strike OR attack OR missile OR "United States" OR US OR american)'
)
const GDELT_URL = `https://api.gdeltproject.org/api/v2/doc/doc?query=${GDELT_QUERY}&mode=artlist&maxrecords=75&format=json&sort=datedesc`

const STRIKE_RE    = /\b(strike|missile|attack|drone|bomb|airstrike|shelling|explosion)\b/i
const CASUALTY_RE  = /\b(killed|dead|wounded|casualt|injured)\b/i
const DIPLOMACY_RE = /\b(talks|negotiat|ceasefire|meeting|deal|sanction|diplomat)\b/i

function classify(text: string): { category: string; severity: number } {
  if (CASUALTY_RE.test(text))  return { category: 'casualty',  severity: 5 }
  if (STRIKE_RE.test(text))    return { category: 'strike',    severity: 4 }
  if (DIPLOMACY_RE.test(text)) return { category: 'diplomacy', severity: 2 }
  return { category: 'other', severity: 1 }
}

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// GDELT SEENDATE format: "YYYYMMDDTHHMMSSZ"
function parseGdeltDate(s: string | undefined): string {
  if (!s || s.length < 15) return new Date().toISOString()
  const iso = `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(9,11)}:${s.slice(11,13)}:${s.slice(13,15)}Z`
  const d = new Date(iso)
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const errors: Array<{ step: string; error: string }> = []
  let articles: any[] = []

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    const res = await fetch(GDELT_URL, {
      signal: controller.signal,
      headers: { 'User-Agent': 'luot247-iran-dashboard/1.0' },
    })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`GDELT HTTP ${res.status}`)
    const json = await res.json()
    articles = Array.isArray(json.articles) ? json.articles : []
  } catch (e) {
    errors.push({ step: 'gdelt_fetch', error: String(e) })
  }

  const rows = await Promise.all(articles.map(async (a: any) => {
    const url = a.url ?? ''
    const title = String(a.title ?? '').trim()
    if (!url || !title) return null
    const { category, severity } = classify(`${title} ${a.sourcecountry ?? ''}`)
    return {
      external_id: await sha256(url),
      source: 'gdelt',
      source_name: a.domain ?? 'GDELT',
      title,
      description: null,
      url,
      author: null,
      image_url: a.socialimage ?? null,
      published_at: parseGdeltDate(a.seendate),
      category,
      severity,
      location_name: a.sourcecountry ?? null,
      raw: a,
    }
  }))

  const validRows = rows.filter((r): r is NonNullable<typeof r> => r !== null)

  let inserted = 0
  if (validRows.length > 0) {
    const { data, error } = await supabase
      .from('news_iran')
      .upsert(validRows, { onConflict: 'external_id', ignoreDuplicates: true })
      .select('id')
    if (error) errors.push({ step: 'db_upsert', error: error.message })
    else inserted = data?.length ?? 0
  }

  return new Response(
    JSON.stringify({ ok: true, scanned: articles.length, inserted, errors }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
