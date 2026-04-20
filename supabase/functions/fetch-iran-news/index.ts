import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.0'
import { XMLParser } from 'https://esm.sh/fast-xml-parser@4.3.6'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RssSource {
  key: string
  name: string
  url: string
}

const SOURCES: RssSource[] = [
  { key: 'reuters',   name: 'Reuters',    url: 'https://www.reutersagency.com/feed/?best-topics=political-general&post_type=best' },
  { key: 'ap',        name: 'AP News',    url: 'https://apnews.com/hub/iran.rss' },
  { key: 'bbc',       name: 'BBC News',   url: 'https://feeds.bbci.co.uk/news/world/middle_east/rss.xml' },
  { key: 'cnn',       name: 'CNN',        url: 'http://rss.cnn.com/rss/edition_meast.rss' },
  { key: 'aljazeera', name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
]

const IRAN_KEYWORDS = /\b(iran|iranian|tehran|hormuz|persian gulf|houthi|hezbollah|irgc|khamenei|pezeshkian|mossad|idf|us strike|american strike|natanz|fordow|bushehr|isfahan)\b/i

const STRIKE_RE      = /\b(strike|missile|attack|drone|bomb|airstrike|shelling|explosion|launched)\b/i
const CASUALTY_RE    = /\b(killed|dead|wounded|casualt|injured|death toll)\b/i
const DIPLOMACY_RE   = /\b(talks|negotiat|ceasefire|meeting|deal|sanction|un security|diplomat)\b/i
const STATEMENT_RE   = /\b(said|says|warn|threat|statement|announc|address)\b/i

function classify(text: string): { category: string; severity: number } {
  if (CASUALTY_RE.test(text))  return { category: 'casualty',   severity: 5 }
  if (STRIKE_RE.test(text))    return { category: 'strike',     severity: 4 }
  if (DIPLOMACY_RE.test(text)) return { category: 'diplomacy',  severity: 2 }
  if (STATEMENT_RE.test(text)) return { category: 'statement',  severity: 1 }
  return { category: 'other', severity: 0 }
}

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

function extractImage(item: any): string | null {
  if (item['media:content']?.['@_url']) return item['media:content']['@_url']
  if (item['media:thumbnail']?.['@_url']) return item['media:thumbnail']['@_url']
  if (item.enclosure?.['@_url']) return item.enclosure['@_url']
  const desc = item.description ?? ''
  const m = String(desc).match(/<img[^>]+src=["']([^"']+)["']/i)
  return m ? m[1] : null
}

async function fetchSource(src: RssSource) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(src.url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'luot247-iran-dashboard/1.0 (+https://luot247.com/iran)' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const xml = await res.text()
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })
    const parsed = parser.parse(xml)
    const channel = parsed?.rss?.channel ?? parsed?.feed
    const raw = channel?.item ?? channel?.entry ?? []
    const items = Array.isArray(raw) ? raw : [raw]
    return items.map((it: any) => {
      const link = it.link?.['@_href'] ?? it.link ?? it.guid ?? ''
      const url = typeof link === 'string' ? link : String(link)
      const title = stripHtml(String(it.title ?? ''))
      const description = stripHtml(String(it.description ?? it.summary ?? it['content:encoded'] ?? ''))
      const pub = it.pubDate ?? it.published ?? it.updated ?? new Date().toISOString()
      return {
        source: src.key,
        source_name: src.name,
        url,
        title,
        description: description.slice(0, 1000),
        published_at: new Date(pub).toISOString(),
        author: it['dc:creator'] ?? it.author?.name ?? it.author ?? null,
        image_url: extractImage(it),
      }
    }).filter(it => it.url && it.title)
  } finally {
    clearTimeout(timeout)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const results = await Promise.allSettled(SOURCES.map(fetchSource))
  const errors: Array<{ source: string; error: string }> = []
  const candidates: any[] = []

  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      candidates.push(...r.value)
    } else {
      errors.push({ source: SOURCES[i].key, error: String(r.reason) })
    }
  })

  const filtered = candidates.filter(it =>
    IRAN_KEYWORDS.test(`${it.title} ${it.description}`)
  )

  const rows = await Promise.all(filtered.map(async (it) => {
    const external_id = await sha256(it.url)
    const { category, severity } = classify(`${it.title} ${it.description}`)
    return { ...it, external_id, category, severity }
  }))

  let inserted = 0
  if (rows.length > 0) {
    const { data, error } = await supabase
      .from('news_iran')
      .upsert(rows, { onConflict: 'external_id', ignoreDuplicates: true })
      .select('id')
    if (error) {
      errors.push({ source: 'db_upsert', error: error.message })
    } else {
      inserted = data?.length ?? 0
    }
  }

  await supabase.from('iran_stats')
    .update({ stat_value: Math.floor(Date.now() / 1000), updated_at: new Date().toISOString() })
    .eq('stat_key', 'last_update_unix')

  return new Response(
    JSON.stringify({
      ok: true,
      scanned: candidates.length,
      matched: filtered.length,
      inserted,
      errors,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
