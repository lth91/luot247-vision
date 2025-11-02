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
    const { totalViews, durationHours } = await req.json()

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const durationSeconds = durationHours * 3600
    const avgDelayPerView = (durationSeconds * 1000) / totalViews

    console.log(`Starting to add ${totalViews} views over ${durationHours} hours`)
    console.log(`Average delay per view: ${avgDelayPerView}ms`)

    let addedCount = 0
    const startTime = Date.now()

    for (let i = 0; i < totalViews; i++) {
      const variation = 0.5 + Math.random() * 1.0
      const delay = avgDelayPerView * variation

      await new Promise(resolve => setTimeout(resolve, delay))

      const { error } = await supabaseClient
        .from('view_logs2')
        .insert({
          viewed_at: new Date().toISOString()
        })

      if (error) {
        console.error('Error inserting view log:', error)
      } else {
        addedCount++
        if (addedCount % 100 === 0) {
          console.log(`Added view ${addedCount}/${totalViews}`)
        }
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(2)
    console.log(`Completed: ${addedCount} views added in ${elapsed} minutes`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        totalAdded: addedCount,
        message: `Successfully added ${addedCount} views`
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error:', error)
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

