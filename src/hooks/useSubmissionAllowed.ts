import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Kiểm tra user hiện tại có được GỬI TIN không (email trong submission_whitelist
// hoặc admin) qua RPC is_submission_allowed. null = đang kiểm tra / chưa đăng nhập.
// Lỗi RPC (vd migration chưa chạy) → fail-open true: edge function vẫn là chốt
// chặn thật, UI không chặn nhầm nhân viên.
export function useSubmissionAllowed(userId: string | undefined): boolean | null {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!userId) { setAllowed(null); return; }
    let cancelled = false;
    // Bảng/RPC mới hơn types.ts auto-generated → cast any (pattern chung của repo).
    (supabase as any).rpc("is_submission_allowed").then(({ data, error }: { data: unknown; error: unknown }) => {
      if (!cancelled) setAllowed(error ? true : data === true);
    });
    return () => { cancelled = true; };
  }, [userId]);

  return allowed;
}
