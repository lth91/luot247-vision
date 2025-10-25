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

    // Parse CSV to JSON with proper CSV parsing
    const lines = csvText.split('\n').filter(line => line.trim())
    if (lines.length < 2) {
      throw new Error('Sheet must have at least a header row and one data row')
    }

    // Parse CSV properly handling quoted fields
    function parseCSVLine(line: string): string[] {
      const result: string[] = []
      let current = ''
      let inQuotes = false
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"'
            i++
          } else {
            inQuotes = !inQuotes
          }
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      result.push(current.trim())
      return result
    }

    const headers = parseCSVLine(lines[0])
    console.log('Headers:', headers)

    const newsItems: NewsItem[] = []
    
    // Valid category values
    const validCategories = ['chinh-tri', 'kinh-te', 'xa-hoi', 'the-thao', 'giai-tri', 'cong-nghe', 'khac']
    
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i])
      
      // If only one column (likely just content), use it as title
      if (headers.length === 1 || values.length === 1) {
        const content = values[0] || ''
        if (content) {
          newsItems.push({
            title: content,
            description: '',
            category: 'khac',
            url: '',
          })
        }
      } else {
        // Multiple columns - map them
        const category = values[2] || 'khac'
        const item: NewsItem = {
          title: values[0] || '',
          description: values[1] || '',
          category: validCategories.includes(category) ? category : 'khac',
          url: values[3] || '',
        }

        if (item.title) {
          newsItems.push(item)
        }
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

    // If action is 'import', insert into database with delay
    if (action === 'import') {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      )

      // Get authorization header to extract user info
      const authHeader = req.headers.get('authorization')
      let userEmail = 'unknown'
      let userId = null

      if (authHeader) {
        const token = authHeader.replace('Bearer ', '')
        const { data: { user } } = await supabaseClient.auth.getUser(token)
        if (user) {
          userEmail = user.email || 'unknown'
          userId = user.id
        }
      }

      console.log('Starting import with delay for', newsItems.length, 'items')

      // Insert items one by one with 5 second delay
      let successCount = 0
      
      for (const item of newsItems) {
        const { error } = await supabaseClient
          .from('news')
          .insert([item])

        if (!error) {
          successCount++
          console.log(`Imported item ${successCount}/${newsItems.length}`)
        } else {
          console.error('Error importing item:', error)
        }

        // Wait 5 seconds before next item (except for the last one)
        if (successCount < newsItems.length) {
          await new Promise(resolve => setTimeout(resolve, 5000))
        }
      }

      // Log import history
      if (userId) {
        await supabaseClient
          .from('import_history')
          .insert({
            user_id: userId,
            user_email: userEmail,
            news_count: successCount,
            sheet_url: sheetUrl
          })
      }

      console.log('Successfully imported:', successCount, 'items')

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Đã import thành công ${successCount} tin tức`,
          count: successCount
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
