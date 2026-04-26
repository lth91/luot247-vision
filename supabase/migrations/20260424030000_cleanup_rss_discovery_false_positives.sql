-- Xoá các bài false-positive đã lọt vào DB qua RSS Discovery:
-- giá dầu thế giới, địa chính trị Trung Đông, macro kinh tế chung, tài chính xanh chung.
-- Song song với fix: edge function discovery-rss-news siết classifier (confidence ≥ 0.7, reject rõ dầu/geopolitics/macro).

DELETE FROM public.electricity_news
WHERE original_url IN (
  'https://www.vietnamplus.vn/xung-dot-trung-dong-khien-hoat-dong-kinh-te-eurozone-suy-giam-post1106662.vnp',
  'https://vov.vn/kinh-te/nguon-luc-tai-chinh-ho-tro-cac-du-an-xanh-chua-dap-ung-yeu-cau-post1286363.vov',
  'https://nhandan.vn/viet-nam-chu-dong-trien-khai-cac-bien-phap-bao-dam-nguon-cung-nhien-lieu-trong-nuoc-post957885.html',
  'https://www.vietnamplus.vn/toa-dam-ban-tron-ve-hop-tac-kinh-te-giua-viet-nam-va-han-quoc-post1106643.vnp',
  'https://nhandan.vn/gia-dau-vuot-100-usdthung-mxv-index-ghi-nhan-phien-tang-manh-nhat-trong-thang-4-post957835.html',
  'https://vneconomy.vn/chu-dong-kich-ban-dieu-hanh-gia-truoc-ap-luc-lam-phat-nhap-khau.htm',
  'https://vnexpress.net/chau-au-de-xuat-bien-phap-khan-cap-ho-tro-kinh-te-5066016.html',
  'https://www.vietnamplus.vn/gia-dau-the-gioi-giam-nhe-sau-khi-my-gia-han-lenh-ngung-ban-voi-iran-post1106409.vnp',
  'https://nhandan.vn/video-iran-bat-giu-2-tau-tai-eo-bien-hormuz-gia-dau-vuot-100-usdthung-post957747.html'
);
