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

    // Get current time in Vietnam (GMT+7)
    const now = new Date()
    const vietnamOffset = 7 * 60 // GMT+7 in minutes
    const localTime = new Date(now.getTime() + vietnamOffset * 60 * 1000)
    
    // Today at 7 AM GMT+7
    const today7AM = new Date(localTime)
    today7AM.setUTCHours(0, 0, 0, 0) // Reset to midnight UTC (7 AM GMT+7)
    
    // Today at 11 PM GMT+7 (end of day)
    const today11PM = new Date(today7AM)
    today11PM.setUTCHours(16, 0, 0, 0) // 16:00 UTC = 23:00 GMT+7

    const viewsToInsert = []

    // Phân bố views theo giờ với peak hours
    const hourlyDistribution = {
      7: 0.03,  // 7-8 AM: 3%
      8: 0.08,  // 8-9 AM: 8% (peak morning)
      9: 0.10,  // 9-10 AM: 10% (peak morning)
      10: 0.07, // 10-11 AM: 7%
      11: 0.06, // 11-12 AM: 6%
      12: 0.09, // 12-1 PM: 9% (lunch peak)
      13: 0.08, // 1-2 PM: 8% (lunch peak)
      14: 0.06, // 2-3 PM: 6%
      15: 0.05, // 3-4 PM: 5%
      16: 0.05, // 4-5 PM: 5%
      17: 0.06, // 5-6 PM: 6%
      18: 0.08, // 6-7 PM: 8% (evening peak)
      19: 0.09, // 7-8 PM: 9% (evening peak)
      20: 0.07, // 8-9 PM: 7% (evening peak)
      21: 0.05, // 9-10 PM: 5%
      22: 0.03, // 10-11 PM: 3%
    }

    // Tạo views cho mỗi giờ
    for (const [hour, percentage] of Object.entries(hourlyDistribution)) {
      const viewsInHour = Math.floor(totalViews * percentage)
      
      for (let i = 0; i < viewsInHour; i++) {
        // Random timestamp trong giờ đó
        const randomMinute = Math.floor(Math.random() * 60)
        const randomSecond = Math.floor(Math.random() * 60)
        
        const timestamp = new Date(today7AM)
        timestamp.setUTCHours(
          parseInt(hour) - 7, // Convert GMT+7 to UTC
          randomMinute,
          randomSecond,
          0
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
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }
})
