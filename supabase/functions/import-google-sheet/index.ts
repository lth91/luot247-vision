import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface NewsItem {
  title: string
  description?: string
  category?: string
  url?: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { sheetUrl, action } = await req.json()
    
    console.log('Processing sheet URL:', sheetUrl)
    console.log('Action:', action)

    // Extract spreadsheet ID and gid from URL
    const spreadsheetIdMatch = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)
    const gidMatch = sheetUrl.match(/[#&]gid=([0-9]+)/)
    
    if (!spreadsheetIdMatch) {
      throw new Error('Invalid Google Sheets URL')
    }

    const spreadsheetId = spreadsheetIdMatch[1]
    const gid = gidMatch ? gidMatch[1] : '0'

    // Construct CSV export URL
    const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`
    
    console.log('Fetching CSV from:', csvUrl)

    // Fetch CSV data
    const csvResponse = await fetch(csvUrl)
    if (!csvResponse.ok) {
      throw new Error('Failed to fetch Google Sheet. Make sure the sheet is publicly accessible.')
    }

    const csvText = await csvResponse.text()
    console.log('CSV data fetched, length:', csvText.length)

    // Parse CSV to JSON
    const lines = csvText.split('\n').filter(line => line.trim())
    if (lines.length < 2) {
      throw new Error('Sheet must have at least a header row and one data row')
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
    console.log('Headers:', headers)

    const newsItems: NewsItem[] = []
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      
      const item: NewsItem = {
        title: values[0] || '',
        description: values[1] || '',
        category: values[2] || 'khac',
        url: values[3] || '',
      }

      if (item.title) {
        newsItems.push(item)
      }
    }

    console.log('Parsed news items:', newsItems.length)

    // If action is 'preview', just return the data
    if (action === 'preview') {
      return new Response(
        JSON.stringify({ success: true, data: newsItems, count: newsItems.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // If action is 'import', insert into database
    if (action === 'import') {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      )

      const { data, error } = await supabaseClient
        .from('news')
        .insert(newsItems)
        .select()

      if (error) {
        console.error('Database error:', error)
        throw new Error(`Failed to import data: ${error.message}`)
      }

      console.log('Successfully imported:', data?.length, 'items')

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Đã import thành công ${data?.length} tin tức`,
          count: data?.length 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    throw new Error('Invalid action. Use "preview" or "import"')

  } catch (error) {
    console.error('Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'An error occurred'
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
