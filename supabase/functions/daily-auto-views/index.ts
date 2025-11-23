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
    console.log('Starting 30-minute auto views generation...')

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Lấy thời gian hiện tại ở GMT+7
    const now = new Date()
    const vietnamTime = new Date(now.getTime() + (7 * 60 * 60 * 1000))
    const currentHour = vietnamTime.getUTCHours()
    const currentMinute = vietnamTime.getUTCMinutes()
    
    console.log(`Current Vietnam time: ${vietnamTime.toISOString()}, Hour: ${currentHour}:${currentMinute}`)

    // Chỉ chạy từ 7 AM đến 10 PM (giờ Việt Nam)
    if (currentHour < 7 || currentHour >= 22) {
      console.log('Outside active hours (7 AM - 10 PM Vietnam time), skipping...')
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Outside active hours, no views added'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    // CRITICAL: Reset daily stats at 7:00 AM (first interval of the day)
    if (currentHour === 7 && currentMinute < 30) {
      console.log('🔄 It\'s 7:00-7:30 AM - Running daily reset...')
      
      const { error: resetError } = await supabaseClient.rpc('reset_daily_view_stats2')
      
      if (resetError) {
        console.error('❌ Error running daily reset:', resetError)
      } else {
        console.log('✅ Daily reset completed successfully - yesterday updated, today reset to 0')
      }
    }

    // Tổng view mục tiêu cho cả ngày: 1000-1500 (random mỗi ngày)
    // Chia đều cho 30 khoảng 30 phút (7AM-10PM = 15h = 30 khoảng)
    const dailyTarget = 1000 + Math.floor(Math.random() * 501) // Random từ 1000-1500
    const totalIntervals = 30 // 15 giờ * 2 (mỗi giờ có 2 khoảng 30 phút)
    
    // Phân bố theo giờ (peak hours)
    const hourlyWeight: { [key: number]: number } = {
      7: 0.5,   // 7-8 AM: ít
      8: 1.2,   // 8-9 AM: peak morning
      9: 1.5,   // 9-10 AM: peak morning
      10: 1.0,  // 10-11 AM
      11: 0.8,  // 11-12 AM
      12: 1.3,  // 12-1 PM: lunch peak
      13: 1.2,  // 1-2 PM: lunch peak
      14: 0.9,  // 2-3 PM
      15: 0.7,  // 3-4 PM
      16: 0.7,  // 4-5 PM
      17: 0.9,  // 5-6 PM
      18: 1.2,  // 6-7 PM: evening peak
      19: 1.4,  // 7-8 PM: evening peak
      20: 1.1,  // 8-9 PM: evening peak
      21: 0.6,  // 9-10 PM
    }

    const totalWeight = Object.values(hourlyWeight).reduce((sum, w) => sum + w, 0)
    const baseViewsPerInterval = dailyTarget / totalIntervals
    const currentWeight = hourlyWeight[currentHour] || 1.0
    const weightedViews = Math.round(baseViewsPerInterval * currentWeight * (totalWeight / totalIntervals))
    
    // Thêm random variation ±20%
    const variation = 0.8 + Math.random() * 0.4
    const viewsToAdd = Math.round(weightedViews * variation)
    
    console.log(`Will add ${viewsToAdd} views for this 30-minute interval (base: ${baseViewsPerInterval.toFixed(1)}, weight: ${currentWeight})`)

    const viewsToInsert = []
    
    // Tính khoảng thời gian 30 phút hiện tại
    const intervalStart = new Date(vietnamTime)
    intervalStart.setUTCMinutes(currentMinute < 30 ? 0 : 30, 0, 0)
    
    const intervalEnd = new Date(intervalStart)
    intervalEnd.setUTCMinutes(intervalStart.getUTCMinutes() + 30)
    
    // Chuyển về UTC để lưu vào database
    const intervalStartUTC = new Date(intervalStart.getTime() - (7 * 60 * 60 * 1000))
    const intervalEndUTC = new Date(intervalEnd.getTime() - (7 * 60 * 60 * 1000))
    
    console.log(`Time range: ${intervalStartUTC.toISOString()} to ${intervalEndUTC.toISOString()}`)

    // Tạo views với random timestamps trong 30 phút này
    for (let i = 0; i < viewsToAdd; i++) {
      const randomMs = Math.floor(Math.random() * 30 * 60 * 1000) // Random trong 30 phút
      const timestamp = new Date(intervalStartUTC.getTime() + randomMs)
      
      viewsToInsert.push({
        viewed_at: timestamp.toISOString()
      })
    }

    console.log(`Generated ${viewsToInsert.length} view logs`)

    // Insert views
    const { error, data } = await supabaseClient
      .from('view_logs2')
      .insert(viewsToInsert)

    if (error) {
      console.error('Error inserting views:', error)
      throw error
    }

    console.log(`Successfully added ${viewsToInsert.length} views`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        totalAdded: viewsToInsert.length,
        interval: `${intervalStart.toISOString()} - ${intervalEnd.toISOString()} (GMT+7)`,
        message: `Successfully added ${viewsToInsert.length} views for this interval`
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error in auto views:', error)
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
