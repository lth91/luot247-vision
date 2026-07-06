import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Kiểm tra user hiện tại có quyền QUẢN LÝ ĐÓNG GÓP không (admin hoặc nằm trong
// bảng contribution_managers — vd long@denco.vn) qua RPC is_contribution_manager.
// null = đang kiểm tra / chưa đăng nhập. Lỗi RPC (migration chưa chạy) → false
// (trang quản trị đóng là an toàn; backend vẫn là chốt thật).
export function useContributionManager(userId: string | undefined): boolean | null {
  const [manager, setManager] = useState<boolean | null>(null);

  useEffect(() => {
    if (!userId) { setManager(null); return; }
    let cancelled = false;
    // RPC mới hơn types.ts auto-generated → cast any (pattern chung của repo).
    (supabase as any).rpc("is_contribution_manager").then(({ data, error }: { data: unknown; error: unknown }) => {
      if (!cancelled) setManager(error ? false : data === true);
    });
    return () => { cancelled = true; };
  }, [userId]);

  return manager;
}
