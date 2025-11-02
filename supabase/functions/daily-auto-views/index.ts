import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('Starting daily auto views generation...')

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Random số views từ 600-800
    const totalViews = Math.floor(600 + Math.random() * 200)
    console.log(`Will add ${totalViews} views today`)

    const viewsToInsert = []

    // Phân bố views theo giờ với peak hours (7 AM - 10 PM GMT+7)
    const hourlyDistribution = {
      0: 0.03,   // 7-8 AM GMT+7 (0-1 UTC)
      1: 0.08,   // 8-9 AM GMT+7 (1-2 UTC) - peak morning
      2: 0.10,   // 9-10 AM GMT+7 (2-3 UTC) - peak morning  
      3: 0.07,   // 10-11 AM GMT+7 (3-4 UTC)
      4: 0.06,   // 11-12 AM GMT+7 (4-5 UTC)
      5: 0.09,   // 12-1 PM GMT+7 (5-6 UTC) - lunch peak
      6: 0.08,   // 1-2 PM GMT+7 (6-7 UTC) - lunch peak
      7: 0.06,   // 2-3 PM GMT+7 (7-8 UTC)
      8: 0.05,   // 3-4 PM GMT+7 (8-9 UTC)
      9: 0.05,   // 4-5 PM GMT+7 (9-10 UTC)
      10: 0.06,  // 5-6 PM GMT+7 (10-11 UTC)
      11: 0.08,  // 6-7 PM GMT+7 (11-12 UTC) - evening peak
      12: 0.09,  // 7-8 PM GMT+7 (12-13 UTC) - evening peak
      13: 0.07,  // 8-9 PM GMT+7 (13-14 UTC) - evening peak
      14: 0.05,  // 9-10 PM GMT+7 (14-15 UTC)
      15: 0.03,  // 10-11 PM GMT+7 (15-16 UTC)
    }

    // Get today's date at midnight UTC (7 AM GMT+7)
    const now = new Date()
    const todayUTC = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(), 
      now.getUTCDate(),
      0, 0, 0, 0
    ))

    // Tạo views cho mỗi giờ
    for (const [utcHour, percentage] of Object.entries(hourlyDistribution)) {
      const viewsInHour = Math.floor(totalViews * percentage)
      
      for (let i = 0; i < viewsInHour; i++) {
        // Random timestamp trong giờ đó
        const randomMinute = Math.floor(Math.random() * 60)
        const randomSecond = Math.floor(Math.random() * 60)
        const randomMs = Math.floor(Math.random() * 1000)
        
        const timestamp = new Date(todayUTC)
        timestamp.setUTCHours(
          parseInt(utcHour),
          randomMinute,
          randomSecond,
          randomMs
        )
        
        viewsToInsert.push({
          viewed_at: timestamp.toISOString()
        })
      }
    }

    console.log(`Generated ${viewsToInsert.length} view logs with random timestamps`)

    // Insert views in batches of 100
    const batchSize = 100
    let insertedCount = 0

    for (let i = 0; i < viewsToInsert.length; i += batchSize) {
      const batch = viewsToInsert.slice(i, i + batchSize)
      
      const { error } = await supabaseClient
        .from('view_logs2')
        .insert(batch)

      if (error) {
        console.error('Error inserting batch:', error)
      } else {
        insertedCount += batch.length
        console.log(`Inserted batch ${Math.floor(i / batchSize) + 1}, total: ${insertedCount}`)
      }
    }

    console.log(`Successfully added ${insertedCount} views for today`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        totalAdded: insertedCount,
        message: `Successfully added ${insertedCount} views for today`
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error in daily auto views:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }
})
