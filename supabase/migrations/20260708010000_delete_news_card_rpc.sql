-- RPC xóa hẳn thẻ khỏi lịch sử (dọn thẻ test / thẻ đã hủy). Chỉ manager/admin.
-- KHÔNG cho xóa thẻ đang hiệu lực (approved) — phải Hủy thẻ trước (để luồng
-- khôi phục tin + hoàn điểm của thẻ đỏ chạy đúng), rồi mới xóa được.

CREATE OR REPLACE FUNCTION public.delete_news_card(_card_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF NOT public.is_contribution_manager() THEN
    RAISE EXCEPTION 'Chỉ quản lý đóng góp được xóa thẻ.';
  END IF;

  SELECT status INTO v_status FROM public.news_cards WHERE id = _card_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Thẻ không tồn tại.';
  END IF;
  IF v_status = 'approved' THEN
    RAISE EXCEPTION 'Thẻ đang hiệu lực — hãy Hủy thẻ trước rồi mới xóa.';
  END IF;

  DELETE FROM public.news_cards WHERE id = _card_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_news_card(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_news_card(uuid) TO authenticated;
