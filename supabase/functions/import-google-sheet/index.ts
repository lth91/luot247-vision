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

    // Parser CSV chuẩn RFC-4180: xử lý TOÀN VĂN BẢN, tôn trọng dấu ngoặc kép.
    // Phẩy/xuống dòng bên trong cell có quote là ký tự thường, KHÔNG tách cột/dòng.
    // (Bug cũ: csvText.split('\n') tách dòng trước khi xử lý quote → cell nhiều
    //  dòng Alt+Enter bị vỡ thành nhiều fragment, kéo theo domino tách phẩy
    //  thập phân tiếng Việt như "0,39%". Gây 25 tin → 47 fragment.)
    function parseCSV(text: string): string[][] {
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1) // bỏ BOM
      const rows: string[][] = []
      let row: string[] = []
      let cur = ''
      let inQuotes = false
      const n = text.length
      let i = 0
      while (i < n) {
        const c = text[i]
        if (inQuotes) {
          if (c === '"') {
            if (text[i + 1] === '"') { cur += '"'; i += 2; continue } // "" → "
            inQuotes = false; i++; continue
          }
          cur += c; i++; continue
        }
        if (c === '"') { inQuotes = true; i++; continue }
        if (c === ',') { row.push(cur); cur = ''; i++; continue }
        if (c === '\r') { i++; continue } // bỏ CR, ngắt dòng theo \n
        if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; i++; continue }
        cur += c; i++
      }
      row.push(cur)
      rows.push(row)
      // bỏ dòng rỗng hoàn toàn + trim từng cell
      return rows
        .filter((r) => r.some((cell) => cell.trim() !== ''))
        .map((r) => r.map((cell) => cell.trim()))
    }

    const allRows = parseCSV(csvText)
    if (allRows.length < 2) {
      throw new Error('Sheet must have at least a header row and one data row')
    }

    const headers = allRows[0]
    console.log('Headers:', headers)

    const newsItems: NewsItem[] = []
    
    // Valid category values
    const validCategories = ['chinh-tri', 'kinh-te', 'xa-hoi', 'the-thao', 'giai-tri', 'cong-nghe', 'khac']
    
    for (let i = 1; i < allRows.length; i++) {
      const values = allRows[i]

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

      console.log('Starting import for', newsItems.length, 'items')

      // Insert items with is_approved=false to require moderator approval
      let successCount = 0
      
      for (const item of newsItems) {
        const { error } = await supabaseClient
          .from('news')
          .insert([{
            ...item,
            is_approved: false  // News requires moderator approval
          }])

        if (!error) {
          successCount++
          console.log(`Imported item ${successCount}/${newsItems.length}`)
        } else {
          console.error('Error importing item:', error)
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
