import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Configuration for November 1-4, 2025
    const daysConfig = [
      { date: '2025-11-01', count: 750 },
      { date: '2025-11-02', count: 780 },
      { date: '2025-11-03', count: 720 },
      { date: '2025-11-04', count: 760 }
    ]

    let totalAdded = 0

    for (const dayConfig of daysConfig) {
      console.log(`Adding ${dayConfig.count} views for ${dayConfig.date}...`)
      
      // Generate random timestamps for this day (7 AM to 10 PM VN time)
      const viewLogs = []
      for (let i = 0; i < dayConfig.count; i++) {
        // Random hour between 0-15 (7 AM to 10 PM is 15 hours)
        const randomHours = Math.random() * 15
        const randomMinutes = Math.random() * 60
        const randomSeconds = Math.random() * 60
        
        // Create timestamp in VN timezone (GMT+7)
        const vnTime = new Date(`${dayConfig.date}T07:00:00+07:00`)
        vnTime.setHours(vnTime.getHours() + Math.floor(randomHours))
        vnTime.setMinutes(Math.floor(randomMinutes))
        vnTime.setSeconds(Math.floor(randomSeconds))
        
        viewLogs.push({
          viewed_at: vnTime.toISOString()
        })
      }

      // Insert in batches of 500 to avoid timeout
      const batchSize = 500
      for (let i = 0; i < viewLogs.length; i += batchSize) {
        const batch = viewLogs.slice(i, i + batchSize)
        const { error } = await supabaseClient
          .from('view_logs2')
          .insert(batch)
        
        if (error) {
          console.error(`Error inserting batch for ${dayConfig.date}:`, error)
          throw error
        }
        
        totalAdded += batch.length
        console.log(`Inserted ${batch.length} views, total: ${totalAdded}`)
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Successfully added ${totalAdded} view logs for November 1-4, 2025`,
        details: daysConfig
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
