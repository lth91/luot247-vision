import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ---- Mô phỏng traffic "thật" ----
// PRNG có seed: mọi interval 30 phút TRONG CÙNG NGÀY phải tính ra cùng dailyTarget
// / hệ số cuối tuần / spike / jitter đường cong → nếu không, mỗi lần cron chạy lại
// random khác nhau và spike/Gaussian bị trung bình hoá mất. Seed = hash của ngày.
function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function gaussian(rng: () => number, mean: number, sd: number): number {
  const u = 1 - rng(), v = rng()
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
// Đường cong 24h CƠ SỞ (trọng số tương đối). Đêm (22h–6h) THẤP nhưng > 0 — không
// trang nào thật mà ban đêm = 0 view. Ban ngày giữ peak sáng/trưa/tối.
const BASE_CURVE: number[] = [
  0.08, 0.05, 0.04, 0.03, 0.04, 0.08, 0.20, // 0-6h (đêm/rạng sáng)
  0.50, 1.20, 1.50, 1.00, 0.80, 1.30, 1.20, // 7-13h (sáng + trưa)
  0.90, 0.70, 0.70, 0.90, 1.20, 1.40, 1.10, // 14-20h (chiều + tối)
  0.60, 0.30, 0.15,                           // 21-23h (tối muộn)
]

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

    // Tính khoảng 30 phút hiện tại NGAY từ đầu — dùng cho guard chống gọi trùng.
    const intervalStart = new Date(vietnamTime)
    intervalStart.setUTCMinutes(currentMinute < 30 ? 0 : 30, 0, 0)
    const intervalEnd = new Date(intervalStart)
    intervalEnd.setUTCMinutes(intervalStart.getUTCMinutes() + 30)
    // Chuyển về UTC để lưu vào database
    const intervalStartUTC = new Date(intervalStart.getTime() - (7 * 60 * 60 * 1000))
    const intervalEndUTC = new Date(intervalEnd.getTime() - (7 * 60 * 60 * 1000))

    // ==== GUARD CHỐNG GỌI TRÙNG (phát hiện 02/07: mỗi mốc :00/:30 bị gọi 2 lần
    // song song → view đúp ~1.7x). Bảng auto_views_runs có PK = interval_start:
    // execution ĐẦU TIÊN insert thành công; execution thứ 2 dính 23505 → thoát,
    // không bơm view, không reset đúp. Bảng chưa tạo (migration chưa chạy) →
    // fail-open: tiếp tục như cũ.
    const { error: guardErr } = await supabaseClient
      .from('auto_views_runs')
      .insert({ interval_start: intervalStartUTC.toISOString() })
    if (guardErr) {
      if (guardErr.code === '23505') {
        console.log(`Duplicate invocation for interval ${intervalStartUTC.toISOString()} — skipped.`)
        return new Response(JSON.stringify({ success: true, message: 'Duplicate invocation skipped (interval already processed)' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
      }
      console.error('Run-guard error (bảng auto_views_runs chưa tạo?) — tiếp tục không guard:', guardErr.message)
    }

    // Chạy 24/7: ban đêm vẫn có baseline thấp (qua BASE_CURVE) cho tự nhiên.

    // CRITICAL: Reset daily stats at 7:00 AM (first interval of the day)
    if (currentHour === 7 && currentMinute < 30) {
      console.log('🔄 It\'s 7:00-7:30 AM - Running daily reset...')
      
      const { error: resetError } = await supabaseClient.rpc('reset_daily_view_stats2')
      
      if (resetError) {
        console.error('❌ Error running daily reset:', resetError)
      } else {
        console.log('✅ Daily reset completed successfully - yesterday updated, today reset to 0')
      }

      // Dọn guard cũ hơn 7 ngày (mỗi ngày 48 dòng — giữ gọn bảng).
      await supabaseClient.from('auto_views_runs')
        .delete()
        .lt('interval_start', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
    }

    // ====== Tính mục tiêu NGÀY (seed theo ngày → mọi interval nhất quán) ======
    const vnDateStr = vietnamTime.toISOString().slice(0, 10) // YYYY-MM-DD theo GMT+7
    const dayRng = mulberry32(hashStr(vnDateStr))
    const dow = vietnamTime.getUTCDay() // 0=CN..6=T7 (theo giờ VN)

    // Hướng 2: tổng/ngày theo phân phối chuông — nâng mặt bằng lên QUANH 3800
    // (yêu cầu 03/07: cả ngày thường cũng ~3800, không chỉ cuối tuần).
    let dailyTarget = gaussian(dayRng, 3800, 150)
    // Hướng 3a: cuối tuần vẫn CAO hơn ngày thường một chút. Ngày thường
    // ×0.94-1.02 (~3.450-3.950); cuối tuần ×1.02-1.07 (~3.800-4.000 sau kẹp).
    const dowMult = (dow === 0 || dow === 6) ? (1.02 + dayRng() * 0.05) : (0.94 + dayRng() * 0.08)
    dailyTarget *= dowMult
    // Ngày spike "viral" ĐÃ BỎ. Trần dao động 3940-4000 theo seed ngày (tránh
    // ngày bị kẹp ra đúng số chẵn 4000 lặp lại — nhìn giả). KHÔNG VƯỢT 4000.
    const dayCap = 3940 + Math.round(dayRng() * 60)
    dailyTarget = Math.round(Math.max(3200, Math.min(dayCap, dailyTarget)))

    // Hướng 5: đường cong 24h + jitter mỗi giờ (mean≈1, ±15%) → hình dạng đổi mỗi
    // ngày nhưng tổng vẫn chuẩn (vì normalize theo chính curve đã jitter).
    const curve = BASE_CURVE.map((w) => w * (0.85 + dayRng() * 0.30))
    // Mỗi giờ = 2 interval 30 phút → tổng weight-interval = sum(curve) × 2.
    const totalWeightIntervals = curve.reduce((s, w) => s + w, 0) * 2
    const currentWeight = curve[currentHour] ?? 0.1
    const baseForInterval = dailyTarget * (currentWeight / totalWeightIntervals)

    // Hướng 4: nhiễu mỗi interval theo Gaussian (mean 1, sd 0.15), kẹp 0.6-1.5
    // — dùng random KHÔNG seed (biến thiên thật theo từng lần chạy).
    const noise = Math.max(0.6, Math.min(1.5, gaussian(Math.random, 1, 0.15)))
    const viewsToAdd = Math.max(0, Math.round(baseForInterval * noise))
    
    console.log(`Will add ${viewsToAdd} views for this 30-minute interval (target: ${dailyTarget}/day, dow: ${dow})`)

    // Interval đêm trọng số thấp → có thể ra 0 view; bỏ qua, không insert mảng rỗng.
    if (viewsToAdd <= 0) {
      return new Response(JSON.stringify({ success: true, message: 'No views for this interval (low-traffic window)' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    const viewsToInsert = []

    console.log(`Time range: ${intervalStartUTC.toISOString()} to ${intervalEndUTC.toISOString()}`)

    // Hướng 4: arrivals BÙNG CỤM theo "phiên" thay vì rải đều — 1 khách xem 1-3
    // trang gần nhau (trong ~3 phút). Phút đông phút vắng → tự nhiên hơn rải uniform.
    const WINDOW_MS = 30 * 60 * 1000
    let remaining = viewsToAdd
    while (remaining > 0) {
      const sessionViews = Math.min(remaining, 1 + Math.floor(Math.random() * 3)) // 1-3 trang/phiên
      const sessionStart = Math.floor(Math.random() * WINDOW_MS)
      for (let j = 0; j < sessionViews; j++) {
        const offset = Math.min(WINDOW_MS - 1, sessionStart + Math.floor(Math.random() * 3 * 60 * 1000))
        viewsToInsert.push({ viewed_at: new Date(intervalStartUTC.getTime() + offset).toISOString() })
      }
      remaining -= sessionViews
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
