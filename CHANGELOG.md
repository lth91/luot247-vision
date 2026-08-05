## [1.118.1](https://github.com/lth91/luot247-vision/compare/v1.118.0...v1.118.1) (2026-08-05)


### Bug Fixes

* **health:** chuông nhịp tim worker chỉ kêu khi đường local là đường chính ([#196](https://github.com/lth91/luot247-vision/issues/196)) ([47061be](https://github.com/lth91/luot247-vision/commit/47061beccbc2c357110a2a91ab553fd3eeedba39))

# [1.118.0](https://github.com/lth91/luot247-vision/compare/v1.117.3...v1.118.0) (2026-08-05)


### Features

* **submit:** tin gửi lẻ chấm bằng DeepSeek (công tắc le_deepseek, fallback Haiku) ([#195](https://github.com/lth91/luot247-vision/issues/195)) ([b0d7134](https://github.com/lth91/luot247-vision/commit/b0d7134d33a9cabb6df37c9808bd2ba47f7f6b33))

## [1.117.3](https://github.com/lth91/luot247-vision/compare/v1.117.2...v1.117.3) (2026-08-04)


### Bug Fixes

* **crawl:** HOTFIX — gỡ khối mở sổ biên bản bị nhân đôi khi merge (SyntaxError, crawl đứng từ 8h50) ([#194](https://github.com/lth91/luot247-vision/issues/194)) ([d725019](https://github.com/lth91/luot247-vision/commit/d72501909d4460d3575941327cd5dfa53d9f30f3))

## [1.117.2](https://github.com/lth91/luot247-vision/compare/v1.117.1...v1.117.2) (2026-08-04)


### Bug Fixes

* **crawl:** hạ TIME_BUDGET 240s→130s + ký biên bản sau từng nguồn ([#193](https://github.com/lth91/luot247-vision/issues/193)) ([a20a4b3](https://github.com/lth91/luot247-vision/commit/a20a4b3daa5ac274c6aa95722094955fc1dd7ce1))

## [1.117.1](https://github.com/lth91/luot247-vision/compare/v1.117.0...v1.117.1) (2026-08-04)


### Bug Fixes

* **crawl:** biên bản crawl ghi dần sau mỗi batch nguồn (runtime giết function sau 150s) ([#192](https://github.com/lth91/luot247-vision/issues/192)) ([a75d0a9](https://github.com/lth91/luot247-vision/commit/a75d0a93b26dae5916b1e6e3bd37123a4a5231e7))

# [1.117.0](https://github.com/lth91/luot247-vision/compare/v1.116.0...v1.117.0) (2026-08-03)


### Features

* **crawl:** biên bản crawl tự ghi vào bảng crawl_run_log ([#191](https://github.com/lth91/luot247-vision/issues/191)) ([39ffd5b](https://github.com/lth91/luot247-vision/commit/39ffd5b8068040b9ec72f8be38acea81a7493b07))

# [1.116.0](https://github.com/lth91/luot247-vision/compare/v1.115.0...v1.116.0) (2026-08-03)


### Features

* **crawl,bulk:** nghỉ hưu MacBook — giám khảo P1 + chấm lô bulk sang DeepSeek (2 công tắc, fallback Haiku) ([#190](https://github.com/lth91/luot247-vision/issues/190)) ([dabae6c](https://github.com/lth91/luot247-vision/commit/dabae6c1f300200ba69c2c10d12a5f16dd9329e9))

# [1.115.0](https://github.com/lth91/luot247-vision/compare/v1.114.3...v1.115.0) (2026-08-03)


### Features

* **crawl:** phương án ④ — cú viết P3 đi DeepSeek V4-Flash (công tắc viet_deepseek, fallback Haiku) + bộ kit bake-off ([#189](https://github.com/lth91/luot247-vision/issues/189)) ([ba3315b](https://github.com/lth91/luot247-vision/commit/ba3315bdcd8f1ba360bcfbafa2087a854af7e5d4))

## [1.114.3](https://github.com/lth91/luot247-vision/compare/v1.114.2...v1.114.3) (2026-07-31)


### Bug Fixes

* **crawl:** tách nội dung chọn khối dài nhất + ép fallback — cứu cụm nguồn mới 0 tin ([#188](https://github.com/lth91/luot247-vision/issues/188)) ([728dc44](https://github.com/lth91/luot247-vision/commit/728dc4446ef9a065215bdafa0f0da4f5ee8e8731))

## [1.114.2](https://github.com/lth91/luot247-vision/compare/v1.114.1...v1.114.2) (2026-07-31)


### Bug Fixes

* **local-llm:** lô trộn đạt+loại bị mất submission_log — đồng bộ bộ cột insert ([#187](https://github.com/lth91/luot247-vision/issues/187)) ([74bcb2b](https://github.com/lth91/luot247-vision/commit/74bcb2b60d7794d5a621fedec7fcd98d54907d52))

## [1.114.1](https://github.com/lth91/luot247-vision/compare/v1.114.0...v1.114.1) (2026-07-31)


### Bug Fixes

* **submit:** hiển thị đúng "đang chấm nền" khi bulk đi đường local ([#186](https://github.com/lth91/luot247-vision/issues/186)) ([f1a0dc7](https://github.com/lth91/luot247-vision/commit/f1a0dc722e8610108e57df66d44942ae42be7b41))

# [1.114.0](https://github.com/lth91/luot247-vision/compare/v1.113.0...v1.114.0) (2026-07-31)


### Features

* **local-llm:** hybrid đợt 2 — bulk chấm local phương án B, công tắc 3 nấc ([#185](https://github.com/lth91/luot247-vision/issues/185)) ([5d2ae4a](https://github.com/lth91/luot247-vision/commit/5d2ae4a3d890dbe50706959cd49e0e7c58e0a64c))

# [1.113.0](https://github.com/lth91/luot247-vision/compare/v1.112.1...v1.113.0) (2026-07-30)


### Features

* **monitor:** gộp báo cáo cost 8h05 vào Bản tin sáng 8h00 ([#184](https://github.com/lth91/luot247-vision/issues/184)) ([cd3dff9](https://github.com/lth91/luot247-vision/commit/cd3dff9e42c9484bf8e807886a80e5a1df1e98bb))

## [1.112.1](https://github.com/lth91/luot247-vision/compare/v1.112.0...v1.112.1) (2026-07-29)


### Bug Fixes

* **local-llm:** finalize nhặt cả job lỗi đi Haiku fallback — chống mất tin ([#183](https://github.com/lth91/luot247-vision/issues/183)) ([5e7243f](https://github.com/lth91/luot247-vision/commit/5e7243f3287b6c76a7619f03b80bebf77908bb85))

# [1.112.0](https://github.com/lth91/luot247-vision/compare/v1.111.0...v1.112.0) (2026-07-29)


### Features

* **crawl:** vá luật phân loại mơ hồ + lưới dính chữ + dòng hybrid bản tin sáng ([#182](https://github.com/lth91/luot247-vision/issues/182)) ([13afaae](https://github.com/lth91/luot247-vision/commit/13afaae1d72f702d9101c787e2a2d4e44c23ad29))

# [1.111.0](https://github.com/lth91/luot247-vision/compare/v1.110.0...v1.111.0) (2026-07-28)


### Features

* **local-llm:** hybrid đợt 1 sau công tắc — giám khảo local async + finalize + fallback Haiku ([#180](https://github.com/lth91/luot247-vision/issues/180)) ([a0f7c5b](https://github.com/lth91/luot247-vision/commit/a0f7c5b7d207a2a6745a7737370cf00cc161b47b))

# [1.110.0](https://github.com/lth91/luot247-vision/compare/v1.109.4...v1.110.0) (2026-07-28)


### Features

* **local-llm:** bước 1 chế độ bóng — local chấm song song Haiku ([#179](https://github.com/lth91/luot247-vision/issues/179)) ([5a6a838](https://github.com/lth91/luot247-vision/commit/5a6a8386d63937927a401aa9c644e9da079b9480))

## [1.109.4](https://github.com/lth91/luot247-vision/compare/v1.109.3...v1.109.4) (2026-07-28)


### Bug Fixes

* **tools:** vá bộ test bước 0 theo kiểm tra chéo — nhãn sạch, bám production ([#178](https://github.com/lth91/luot247-vision/issues/178)) ([1925023](https://github.com/lth91/luot247-vision/commit/19250233e936623532509ba07518e68072ebd664))

## [1.109.3](https://github.com/lth91/luot247-vision/compare/v1.109.2...v1.109.3) (2026-07-23)


### Bug Fixes

* **review:** lượt 2 không tự loại theo % — hỏi người duyệt qua dialog đối chiếu ([#176](https://github.com/lth91/luot247-vision/issues/176)) ([065e80e](https://github.com/lth91/luot247-vision/commit/065e80e434ed3d81aed03ba2df1818d6b405a53e))

## [1.109.2](https://github.com/lth91/luot247-vision/compare/v1.109.1...v1.109.2) (2026-07-23)


### Bug Fixes

* **monitor:** báo cáo cost đếm thiếu khi >1000 call/ngày — phân trang llm_usage_log ([#175](https://github.com/lth91/luot247-vision/issues/175)) ([d1f8cc1](https://github.com/lth91/luot247-vision/commit/d1f8cc11ec2d53c67f65801efee40882414405fc))

## [1.109.1](https://github.com/lth91/luot247-vision/compare/v1.109.0...v1.109.1) (2026-07-22)


### Performance Improvements

* **submit:** rút gọn JSON verdict — giảm ~50-70% output token của submit-news + bulk ([#173](https://github.com/lth91/luot247-vision/issues/173)) ([39f8e40](https://github.com/lth91/luot247-vision/commit/39f8e40c68d4ef7da7e9624b202deaf197b94936))

# [1.109.0](https://github.com/lth91/luot247-vision/compare/v1.108.1...v1.109.0) (2026-07-22)


### Features

* **monitor:** bản tin sáng Telegram 8h + siết chuông im ắng 1h ([#171](https://github.com/lth91/luot247-vision/issues/171)) ([1aa9fd9](https://github.com/lth91/luot247-vision/commit/1aa9fd9d04d0fb6be9083986a5168003b5f606cd))

## [1.108.1](https://github.com/lth91/luot247-vision/compare/v1.108.0...v1.108.1) (2026-07-22)


### Bug Fixes

* **crawl:** hết loại oan "bịa ngày" — đưa ngày metadata cho giám khảo P1 + chặn câu cụt ([#170](https://github.com/lth91/luot247-vision/issues/170)) ([ba7e449](https://github.com/lth91/luot247-vision/commit/ba7e4495557d8e57b22260fd95aec55ced46ca79))

# [1.108.0](https://github.com/lth91/luot247-vision/compare/v1.107.2...v1.108.0) (2026-07-21)


### Features

* **views:** tổng view/ngày dao động rộng tự nhiên, hết dải đều ([#169](https://github.com/lth91/luot247-vision/issues/169)) ([9882069](https://github.com/lth91/luot247-vision/commit/9882069c5472a9940d9014ced74283c04f59fa7e))

## [1.107.2](https://github.com/lth91/luot247-vision/compare/v1.107.1...v1.107.2) (2026-07-21)


### Performance Improvements

* **home:** trang chủ chịu tải nghìn tin/ngày — cắt cột thừa + content-visibility ([#168](https://github.com/lth91/luot247-vision/issues/168)) ([2cc099c](https://github.com/lth91/luot247-vision/commit/2cc099c99fab0304794652dd3a127360be3bdf41))

## [1.107.1](https://github.com/lth91/luot247-vision/compare/v1.107.0...v1.107.1) (2026-07-21)


### Performance Improvements

* **crawl:** Nấc 1+2 — cron 15 phút + ngân sách lượt 240s + 3 fix tiên quyết ([#167](https://github.com/lth91/luot247-vision/issues/167)) ([f53fb51](https://github.com/lth91/luot247-vision/commit/f53fb514cc5be51d5b6d10133f9aac9261fcbe3d))

# [1.107.0](https://github.com/lth91/luot247-vision/compare/v1.106.0...v1.107.0) (2026-07-20)


### Features

* menu "Thống kê" + email phụ gọn theo danh sách sếp ([#166](https://github.com/lth91/luot247-vision/issues/166)) ([e1dfd3e](https://github.com/lth91/luot247-vision/commit/e1dfd3e7a2acb046100ea483b885d1d24f8cff47))

# [1.106.0](https://github.com/lth91/luot247-vision/compare/v1.105.3...v1.106.0) (2026-07-20)


### Features

* **review:** dialog đối chiếu song song tin đang duyệt vs tin đã đăng nghi trùng ([#165](https://github.com/lth91/luot247-vision/issues/165)) ([0caf5ef](https://github.com/lth91/luot247-vision/commit/0caf5ef6850e111c8d97aad411d8b78639a742c9))

## [1.105.3](https://github.com/lth91/luot247-vision/compare/v1.105.2...v1.105.3) (2026-07-20)


### Performance Improvements

* **crawl:** chống tái xử lý bài đã bị AI loại — lưu url_hash vào hồ sơ loại ([#164](https://github.com/lth91/luot247-vision/issues/164)) ([c346229](https://github.com/lth91/luot247-vision/commit/c3462291cb7e527b6746ee6b392ec36cfd174287))

## [1.105.2](https://github.com/lth91/luot247-vision/compare/v1.105.1...v1.105.2) (2026-07-20)


### Performance Improvements

* **crawl:** kiểm trùng sớm trên bài gốc cho ca nghi trùng ≥70%, tiết kiệm cú viết ([#163](https://github.com/lth91/luot247-vision/issues/163)) ([cb3dae9](https://github.com/lth91/luot247-vision/commit/cb3dae9b26b0915c3a697767761ad338a0fadcf5))

## [1.105.1](https://github.com/lth91/luot247-vision/compare/v1.105.0...v1.105.1) (2026-07-20)


### Bug Fixes

* **header:** menu cuộn được + giãn cách gọn lại, admin thấy nút Đăng xuất ([#162](https://github.com/lth91/luot247-vision/issues/162)) ([b43919b](https://github.com/lth91/luot247-vision/commit/b43919bb34cca6914d706ad16a0f07040bde5984))

# [1.105.0](https://github.com/lth91/luot247-vision/compare/v1.104.0...v1.105.0) (2026-07-17)


### Features

* **review:** nhãn 🆕 DIỄN BIẾN MỚI / 🔍 CẦN KIỂM TRA + báo chặn trùng lượt 2 lúc duyệt ([#159](https://github.com/lth91/luot247-vision/issues/159)) ([fd94d81](https://github.com/lth91/luot247-vision/commit/fd94d819f757c918615f241aac428cbb081f5263))

# [1.104.0](https://github.com/lth91/luot247-vision/compare/v1.103.2...v1.104.0) (2026-07-17)


### Features

* **crawl:** kiểm 2 lượt — giám khảo P1 sau khi viết + chặn trùng lúc bấm duyệt ([#158](https://github.com/lth91/luot247-vision/issues/158)) ([8108123](https://github.com/lth91/luot247-vision/commit/81081233cb83d1d9828f4ad4503fe65cf04abe23))

## [1.103.2](https://github.com/lth91/luot247-vision/compare/v1.103.1...v1.103.2) (2026-07-17)


### Bug Fixes

* **dashboard:** migration acc DISTINCT dùng đúng signature 11 cột có acc_yesterday ([#157](https://github.com/lth91/luot247-vision/issues/157)) ([0f46678](https://github.com/lth91/luot247-vision/commit/0f4667849f9e102fb6ffdc351302e2ac6ab828c0))

## [1.103.1](https://github.com/lth91/luot247-vision/compare/v1.103.0...v1.103.1) (2026-07-17)


### Bug Fixes

* **dashboard:** cột Duyệt đếm DISTINCT tiêu đề như cột Up, hết tỷ lệ vượt 100% ([#156](https://github.com/lth91/luot247-vision/issues/156)) ([0f2a313](https://github.com/lth91/luot247-vision/commit/0f2a31342714aca8cf4b89eddb20a637cadf6508))

# [1.103.0](https://github.com/lth91/luot247-vision/compare/v1.102.0...v1.103.0) (2026-07-17)


### Features

* **leaderboard:** cột "Up hôm nay" hiển thị dạng "126 (20)" gộp tin AI đã duyệt ([#155](https://github.com/lth91/luot247-vision/issues/155)) ([ce3a01a](https://github.com/lth91/luot247-vision/commit/ce3a01a35717544b6b61405d92d1a39ebc818488))

# [1.102.0](https://github.com/lth91/luot247-vision/compare/v1.101.0...v1.102.0) (2026-07-17)


### Features

* **ui:** nội dung tin đổi từ xám sang màu chữ chính, tăng tương phản dễ đọc ([#153](https://github.com/lth91/luot247-vision/issues/153)) ([22e704d](https://github.com/lth91/luot247-vision/commit/22e704d3c6496f9ff7f82f05128cf0ae5ff66fd8))

# [1.101.0](https://github.com/lth91/luot247-vision/compare/v1.100.0...v1.101.0) (2026-07-17)


### Features

* **crawl:** prompt biên tập bản sếp chốt 16/07 ([#152](https://github.com/lth91/luot247-vision/issues/152)) ([661b9d1](https://github.com/lth91/luot247-vision/commit/661b9d1ce7267a099d0a818865557cccc892acb2))

# [1.100.0](https://github.com/lth91/luot247-vision/compare/v1.99.0...v1.100.0) (2026-07-16)


### Features

* **about:** lời giới thiệu 2 đoạn mới + tiêu đề "Thông tin liên hệ:" ([#151](https://github.com/lth91/luot247-vision/issues/151)) ([55c7368](https://github.com/lth91/luot247-vision/commit/55c736825f2e2f1a03b36f38ea910ddca31d7b43))

# [1.99.0](https://github.com/lth91/luot247-vision/compare/v1.98.1...v1.99.0) (2026-07-16)


### Features

* **leaderboard:** cột "Tên" thành "Thành viên (xx)" hiển thị quân số ([#150](https://github.com/lth91/luot247-vision/issues/150)) ([eb0631b](https://github.com/lth91/luot247-vision/commit/eb0631bf83f08ef89124b98111f250aabf04e424))

## [1.98.1](https://github.com/lth91/luot247-vision/compare/v1.98.0...v1.98.1) (2026-07-16)


### Bug Fixes

* **crawl:** giảm nhãn "Cần sửa số từ" — cắt vế phụ sau dấu phẩy + cú nén AI giá rẻ ([#149](https://github.com/lth91/luot247-vision/issues/149)) ([17f82d5](https://github.com/lth91/luot247-vision/commit/17f82d5a0210cdafcd9f67101838ee7a1f7aecdd))

# [1.98.0](https://github.com/lth91/luot247-vision/compare/v1.97.1...v1.98.0) (2026-07-16)


### Features

* **crawl:** nâng nhịp quét tin 1 giờ → 30 phút (phút :05 và :35) ([#148](https://github.com/lth91/luot247-vision/issues/148)) ([798018f](https://github.com/lth91/luot247-vision/commit/798018f671a1d8a81abfb5a1175e0a88c9b11701))

## [1.97.1](https://github.com/lth91/luot247-vision/compare/v1.97.0...v1.97.1) (2026-07-16)


### Bug Fixes

* **crawl:** chặn trần 1.5MB HTML trước khi parse + giảm song song 3→2, hết crash Memory limit exceeded ([#147](https://github.com/lth91/luot247-vision/issues/147)) ([36ea6fd](https://github.com/lth91/luot247-vision/commit/36ea6fda01606df6375d43d9901ba6eca0365898))

# [1.97.0](https://github.com/lth91/luot247-vision/compare/v1.96.4...v1.97.0) (2026-07-15)


### Features

* **crawl:** AI phán xử tin nghi trùng vùng xám 45-70% + badge độ giống trang duyệt ([#146](https://github.com/lth91/luot247-vision/issues/146)) ([775dd53](https://github.com/lth91/luot247-vision/commit/775dd53e5e3a735f40f6f300f9f58ddbeea2fc57))

## [1.96.4](https://github.com/lth91/luot247-vision/compare/v1.96.3...v1.96.4) (2026-07-15)


### Bug Fixes

* **ui:** chỉnh nhãn theo sếp — 46 (20), Thống kê, Tin tự động (N), bỏ chú giải ([#145](https://github.com/lth91/luot247-vision/issues/145)) ([48b51e7](https://github.com/lth91/luot247-vision/commit/48b51e74eb7042396f9c491c2e44c8279aeae608))

## [1.96.3](https://github.com/lth91/luot247-vision/compare/v1.96.2...v1.96.3) (2026-07-15)


### Bug Fixes

* **review:** bỏ nút "Hàng đợi" thừa ở màn hàng đợi (giữ nút quay về khi ở Lịch sử) ([#144](https://github.com/lth91/luot247-vision/issues/144)) ([786bebd](https://github.com/lth91/luot247-vision/commit/786bebdb5f2ba3b59d2469ec10d5ff36058b77a9))

## [1.96.2](https://github.com/lth91/luot247-vision/compare/v1.96.1...v1.96.2) (2026-07-15)


### Bug Fixes

* **crawl:** siết prompt chính tả — nhắc AI 2 lỗi hay vấp (dính chữ, sai dấu thanh) ([#143](https://github.com/lth91/luot247-vision/issues/143)) ([732eb00](https://github.com/lth91/luot247-vision/commit/732eb00ab0abaee31af13229e0b603c9597c494e))

## [1.96.1](https://github.com/lth91/luot247-vision/compare/v1.96.0...v1.96.1) (2026-07-15)


### Bug Fixes

* **crawl:** tiêu đề tin AI không dùng dấu hai chấm (:) ([#142](https://github.com/lth91/luot247-vision/issues/142)) ([c2d8326](https://github.com/lth91/luot247-vision/commit/c2d8326501f2c85f1cfcf6885b8c97e87a4b0e7e))

# [1.96.0](https://github.com/lth91/luot247-vision/compare/v1.95.0...v1.96.0) (2026-07-15)


### Features

* **bulk:** import Sheet tự chia 2 khổ — nhân viên viết liền 1 đoạn ([#141](https://github.com/lth91/luot247-vision/issues/141)) ([1e48152](https://github.com/lth91/luot247-vision/commit/1e481520912ebe23f17eb005474390dfb9a70fca))

# [1.95.0](https://github.com/lth91/luot247-vision/compare/v1.94.2...v1.95.0) (2026-07-15)


### Features

* **content:** tin AI 1 khổ, tin nhân viên bắt buộc 2 khổ (sếp 16/07) ([#140](https://github.com/lth91/luot247-vision/issues/140)) ([280fdc3](https://github.com/lth91/luot247-vision/commit/280fdc38a89c7867a281f6205d39aca681cf688f))

## [1.94.2](https://github.com/lth91/luot247-vision/compare/v1.94.1...v1.94.2) (2026-07-15)


### Bug Fixes

* **submission:** bộ đếm từ v2 — dấu gạch dài là dấu câu, khớp Word/đếm tay ([#139](https://github.com/lth91/luot247-vision/issues/139)) ([4f66efa](https://github.com/lth91/luot247-vision/commit/4f66efa9c57724624db99ee3e85ac48e0087fda3))

## [1.94.1](https://github.com/lth91/luot247-vision/compare/v1.94.0...v1.94.1) (2026-07-15)


### Bug Fixes

* **review:** hiện "đang tải/tổng" khi hàng đợi vượt 1 trang 200 tin ([#135](https://github.com/lth91/luot247-vision/issues/135)) ([1cc52cb](https://github.com/lth91/luot247-vision/commit/1cc52cb70fdeb103d35d1a5359e9ba23f3640757))

# [1.94.0](https://github.com/lth91/luot247-vision/compare/v1.93.0...v1.94.0) (2026-07-15)


### Features

* **crawl:** chuẩn tin tự động 100-120 từ (cả tiêu đề) + duyệt hôm qua cho công duyệt ([#137](https://github.com/lth91/luot247-vision/issues/137)) ([9739c14](https://github.com/lth91/luot247-vision/commit/9739c14733f26cb58a2c8110ba9d208fbbe918d1))

# [1.93.0](https://github.com/lth91/luot247-vision/compare/v1.92.1...v1.93.0) (2026-07-15)


### Features

* **crawl:** chuẩn hiển thị theo sếp — tiêu đề VIẾT HOA + nội dung 2 khổ ([#136](https://github.com/lth91/luot247-vision/issues/136)) ([d1463f6](https://github.com/lth91/luot247-vision/commit/d1463f695b9f4c3a1448cac5bc155545571b96b0))

## [1.92.1](https://github.com/lth91/luot247-vision/compare/v1.92.0...v1.92.1) (2026-07-14)


### Bug Fixes

* **crawl:** bộ dò RSS v2 — quét thêm trang mục lục /rss(.html|.htm) + mở rộng path ([#134](https://github.com/lth91/luot247-vision/issues/134)) ([31c7438](https://github.com/lth91/luot247-vision/commit/31c74384f91231ead460cdda7f9137480a0b1c83))

# [1.92.0](https://github.com/lth91/luot247-vision/compare/v1.91.0...v1.92.0) (2026-07-14)


### Features

* **crawl:** mode add_sources — dò RSS rồi tự seed crawl_sources (chỉ feed sống) ([#133](https://github.com/lth91/luot247-vision/issues/133)) ([c9d4337](https://github.com/lth91/luot247-vision/commit/c9d433789adfd4f4ab14ec33903529892bde929d))

# [1.91.0](https://github.com/lth91/luot247-vision/compare/v1.90.0...v1.91.0) (2026-07-14)


### Features

* **crawl:** mode discover_feeds — dò RSS của danh sách domain từ egress Supabase ([#131](https://github.com/lth91/luot247-vision/issues/131)) ([80cb216](https://github.com/lth91/luot247-vision/commit/80cb216065d474088c3ac514c3bc4533e1671e0e))

# [1.90.0](https://github.com/lth91/luot247-vision/compare/v1.89.0...v1.90.0) (2026-07-14)


### Features

* **dashboard:** PR6 bảng Công duyệt tin AI trong /bang-xep-hang ([#130](https://github.com/lth91/luot247-vision/issues/130)) ([d172455](https://github.com/lth91/luot247-vision/commit/d1724554e6ceb1fddc9c9f5458b63e5c621451a9))

# [1.89.0](https://github.com/lth91/luot247-vision/compare/v1.88.0...v1.89.0) (2026-07-14)


### Features

* **feed:** PR5 giới hạn feed trang chủ 14 ngày + ghi nguồn bài gốc ([#129](https://github.com/lth91/luot247-vision/issues/129)) ([56e50e9](https://github.com/lth91/luot247-vision/commit/56e50e9e2d5fd11a8629f5a7df617749d940626e))

# [1.88.0](https://github.com/lth91/luot247-vision/compare/v1.87.0...v1.88.0) (2026-07-14)


### Features

* **crawl:** PR4 cron tự động + bảo trì hàng đợi + giám sát Telegram ([#128](https://github.com/lth91/luot247-vision/issues/128)) ([f60b695](https://github.com/lth91/luot247-vision/commit/f60b6958524bc0fc58927dc7de9923bec6bc75da))

# [1.87.0](https://github.com/lth91/luot247-vision/compare/v1.86.0...v1.87.0) (2026-07-14)


### Features

* **review:** PR3 trang duyệt tin AI /duyet-tin-ai cho nhân viên whitelist ([#127](https://github.com/lth91/luot247-vision/issues/127)) ([07ef0bd](https://github.com/lth91/luot247-vision/commit/07ef0bd96c6a256fff819b5d53912371b18162d1))

# [1.86.0](https://github.com/lth91/luot247-vision/compare/v1.85.1...v1.86.0) (2026-07-14)


### Features

* **review:** PR2 hàng đợi duyệt tin AI — RPC duyệt/loại + bảng công duyệt ([#126](https://github.com/lth91/luot247-vision/issues/126)) ([bfcfe49](https://github.com/lth91/luot247-vision/commit/bfcfe49701275260c30c103b908767f89772aa57))

## [1.85.1](https://github.com/lth91/luot247-vision/compare/v1.85.0...v1.85.1) (2026-07-14)


### Bug Fixes

* **crawl:** trị bệnh viết lố số từ — ép chỉ tiêu content 108-118 + cắt câu cuối tự động ([#125](https://github.com/lth91/luot247-vision/issues/125)) ([f5a598a](https://github.com/lth91/luot247-vision/commit/f5a598a26a58092d31dc10015aac210fa40090de))

# [1.85.0](https://github.com/lth91/luot247-vision/compare/v1.84.0...v1.85.0) (2026-07-14)


### Features

* **crawl:** PR1 pipeline AI crawl tin tổng hợp — edge crawl-news + bảng nguồn + hàng đợi duyệt ([#124](https://github.com/lth91/luot247-vision/issues/124)) ([269a4a1](https://github.com/lth91/luot247-vision/commit/269a4a103e9347a8a39e49329ca13222507911ec))

# [1.84.0](https://github.com/lth91/luot247-vision/compare/v1.83.3...v1.84.0) (2026-07-12)


### Features

* **dashboard:** thêm cột Duyệt hôm qua + bỏ chữ "Tin" ở tên cột ([#123](https://github.com/lth91/luot247-vision/issues/123)) ([9344475](https://github.com/lth91/luot247-vision/commit/9344475473fe033a49ef3141ab1d021448db223d))

## [1.83.3](https://github.com/lth91/luot247-vision/compare/v1.83.2...v1.83.3) (2026-07-09)


### Bug Fixes

* **dashboard:** cột Tin đăng đếm TIN thật (DISTINCT tiêu đề) thay vì đếm lượt chấm ([#122](https://github.com/lth91/luot247-vision/issues/122)) ([f59329d](https://github.com/lth91/luot247-vision/commit/f59329df90600b84f78ad2c1096ef2ec9c9e58b8))

## [1.83.2](https://github.com/lth91/luot247-vision/compare/v1.83.1...v1.83.2) (2026-07-09)


### Performance Improvements

* **submission:** bật prompt caching cho LLM kiểm duyệt (giảm ~70-90% chi phí input) ([#121](https://github.com/lth91/luot247-vision/issues/121)) ([240304c](https://github.com/lth91/luot247-vision/commit/240304c6461b04ff20883f5763f5ca9091958ac2))

## [1.83.1](https://github.com/lth91/luot247-vision/compare/v1.83.0...v1.83.1) (2026-07-09)


### Bug Fixes

* **submission:** nới kiểm duyệt cho luồng SỬA tin thẻ vàng ([#120](https://github.com/lth91/luot247-vision/issues/120)) ([fc0c26c](https://github.com/lth91/luot247-vision/commit/fc0c26c90b145a0c84ac7e434864b69442eac984))

# [1.83.0](https://github.com/lth91/luot247-vision/compare/v1.82.0...v1.83.0) (2026-07-09)


### Features

* **auth:** manager@luot247.com đăng nhập bằng mật khẩu thật như admin ([#119](https://github.com/lth91/luot247-vision/issues/119)) ([a4040e9](https://github.com/lth91/luot247-vision/commit/a4040e9eb49daff3d9c61fb6cd53778f313b6929))

# [1.82.0](https://github.com/lth91/luot247-vision/compare/v1.81.0...v1.82.0) (2026-07-09)


### Features

* **cards:** nút Chi tiết xem đầy đủ thẻ + nút Xóa thẻ đã hủy khỏi lịch sử ([#118](https://github.com/lth91/luot247-vision/issues/118)) ([bcbf2f4](https://github.com/lth91/luot247-vision/commit/bcbf2f4c9287ca6c9802f4e400dca951f2edf0a7))

# [1.81.0](https://github.com/lth91/luot247-vision/compare/v1.80.0...v1.81.0) (2026-07-09)


### Features

* **cards:** thông báo chủ động cho người bị thẻ vàng + hiện lý do thẻ ở trang quản lý ([#117](https://github.com/lth91/luot247-vision/issues/117)) ([9d4a5eb](https://github.com/lth91/luot247-vision/commit/9d4a5ebcb38114898e046889d23f76549c8f0135))

# [1.80.0](https://github.com/lth91/luot247-vision/compare/v1.79.1...v1.80.0) (2026-07-08)


### Features

* **cards:** thẻ hiệu lực ngay — đỏ giật tin, vàng sửa tin, bỏ biểu quyết ([#116](https://github.com/lth91/luot247-vision/issues/116)) ([536e82a](https://github.com/lth91/luot247-vision/commit/536e82ad0adffb58c21d22d1f9f29556a15016cd))

## [1.79.1](https://github.com/lth91/luot247-vision/compare/v1.79.0...v1.79.1) (2026-07-07)


### Bug Fixes

* **submission:** import Sheet không vứt kết quả AI đã chấm khi quá ngân sách thời gian ([#115](https://github.com/lth91/luot247-vision/issues/115)) ([9cec031](https://github.com/lth91/luot247-vision/commit/9cec031e0fa3d74f1f726a67e144b8675db2923e))

# [1.79.0](https://github.com/lth91/luot247-vision/compare/v1.78.1...v1.79.0) (2026-07-07)


### Features

* **cards:** thẻ vàng/đỏ — báo lỗi chéo, cộng đồng biểu quyết ±3, 3 đỏ cấm gửi tin ([#114](https://github.com/lth91/luot247-vision/issues/114)) ([a8ffe86](https://github.com/lth91/luot247-vision/commit/a8ffe86a83075e470a4f6a6ec16861f482585503))

## [1.78.1](https://github.com/lth91/luot247-vision/compare/v1.78.0...v1.78.1) (2026-07-05)


### Bug Fixes

* **menu:** siết hiển thị nhóm gửi tin — ẩn trước hiện sau, gỡ Bảng xếp hạng khỏi menu khách ([#113](https://github.com/lth91/luot247-vision/issues/113)) ([9396b2a](https://github.com/lth91/luot247-vision/commit/9396b2afcb525dc0dd7fdf887772744fa051f444)), closes [#98](https://github.com/lth91/luot247-vision/issues/98)

# [1.78.0](https://github.com/lth91/luot247-vision/compare/v1.77.0...v1.78.0) (2026-07-03)


### Features

* **leaderboard:** bỏ cột Tin đăng tháng này, đưa Tin duyệt hôm nay lên trước Tin đăng hôm nay ([#112](https://github.com/lth91/luot247-vision/issues/112)) ([28d8342](https://github.com/lth91/luot247-vision/commit/28d8342643cca7d07634e83a68046e89082ad04e))

# [1.77.0](https://github.com/lth91/luot247-vision/compare/v1.76.0...v1.77.0) (2026-07-03)


### Features

* **submission:** chốt tiêu đề 12–18 + tổng 120–140, bộ đếm nội dung tự tính theo tiêu đề ([#110](https://github.com/lth91/luot247-vision/issues/110)) ([4f3c43a](https://github.com/lth91/luot247-vision/commit/4f3c43ad3a634b920b5b4afba7b593d950268467))

# [1.76.0](https://github.com/lth91/luot247-vision/compare/v1.75.0...v1.76.0) (2026-07-03)


### Features

* **submission:** tách 2 tiêu chí độ dài độc lập — tiêu đề 12–18, nội dung 108–122 từ ([#109](https://github.com/lth91/luot247-vision/issues/109)) ([b013e94](https://github.com/lth91/luot247-vision/commit/b013e94969e0bdf573e26e034f516ff0c6cac136))

# [1.75.0](https://github.com/lth91/luot247-vision/compare/v1.74.1...v1.75.0) (2026-07-03)


### Features

* **views:** nâng mặt bằng view giả lập lên quanh 3800/ngày ([#107](https://github.com/lth91/luot247-vision/issues/107)) ([e5d11a1](https://github.com/lth91/luot247-vision/commit/e5d11a11b631c0a610e1e20554be038e424e6f78))

## [1.74.1](https://github.com/lth91/luot247-vision/compare/v1.74.0...v1.74.1) (2026-07-03)


### Bug Fixes

* **views:** nâng trần view giả lập 3600 → 3800/ngày ([#106](https://github.com/lth91/luot247-vision/issues/106)) ([d498a10](https://github.com/lth91/luot247-vision/commit/d498a1007a43970ade4430dc58aef21288b884db))

# [1.74.0](https://github.com/lth91/luot247-vision/compare/v1.73.0...v1.74.0) (2026-07-03)


### Features

* **leaderboard:** ghim tiêu đề khi cuộn + bấm cột để sắp xếp tăng/giảm ([#105](https://github.com/lth91/luot247-vision/issues/105)) ([c29fecb](https://github.com/lth91/luot247-vision/commit/c29fecb3319ec6cdcc3b9b359c6eb18813ccfb51))

# [1.73.0](https://github.com/lth91/luot247-vision/compare/v1.72.1...v1.73.0) (2026-07-03)


### Features

* **leaderboard:** bảng theo dõi gửi tin theo mẫu sếp — thay bảng top điểm ([#103](https://github.com/lth91/luot247-vision/issues/103)) ([b17310d](https://github.com/lth91/luot247-vision/commit/b17310d03914057a4d48caf177ee0caffc7e2daf))

## [1.72.1](https://github.com/lth91/luot247-vision/compare/v1.72.0...v1.72.1) (2026-07-02)


### Bug Fixes

* **views:** guard chống daily-auto-views bị gọi trùng interval — hết view đúp 1.7x ([#101](https://github.com/lth91/luot247-vision/issues/101)) ([332cfcf](https://github.com/lth91/luot247-vision/commit/332cfcf63bbbaf5c9fce9b51e145d340c324e2e3))

# [1.72.0](https://github.com/lth91/luot247-vision/compare/v1.71.1...v1.72.0) (2026-07-02)


### Features

* **submission:** LLM chấm 4 chiều tiêu chí biên tập — loại khi vi phạm rõ kèm hướng dẫn sửa ([#100](https://github.com/lth91/luot247-vision/issues/100)) ([8a3789d](https://github.com/lth91/luot247-vision/commit/8a3789db2bac750fc15517c6fcbd39fd4bf2888e))

## [1.71.1](https://github.com/lth91/luot247-vision/compare/v1.71.0...v1.71.1) (2026-07-02)


### Bug Fixes

* **submission:** sửa email whitelist Bùi Thị Na — bui.thi.na.denco@gmail.com ([#99](https://github.com/lth91/luot247-vision/issues/99)) ([56c4f35](https://github.com/lth91/luot247-vision/commit/56c4f35f7a8b4a6fe3f3b028244105ea3fc07bf8))

# [1.71.0](https://github.com/lth91/luot247-vision/compare/v1.70.0...v1.71.0) (2026-07-02)


### Features

* **submission:** ẩn Điểm của tôi + Bảng xếp hạng với user ngoài whitelist ([#98](https://github.com/lth91/luot247-vision/issues/98)) ([09b605a](https://github.com/lth91/luot247-vision/commit/09b605a7d60e4a72f623c0c122f2ddde178cddbe))

# [1.70.0](https://github.com/lth91/luot247-vision/compare/v1.69.2...v1.70.0) (2026-07-02)


### Features

* **submission:** khoá gửi tin theo whitelist email — chỉ 25 email đăng ký + admin ([#97](https://github.com/lth91/luot247-vision/issues/97)) ([658893e](https://github.com/lth91/luot247-vision/commit/658893e220555f85cbb62ecef0c1bdaee8f7f7a8))

## [1.69.2](https://github.com/lth91/luot247-vision/compare/v1.69.1...v1.69.2) (2026-07-02)


### Bug Fixes

* **views:** cuối tuần view giả lập CAO hơn ngày thường 10-18% ([#96](https://github.com/lth91/luot247-vision/issues/96)) ([d344d04](https://github.com/lth91/luot247-vision/commit/d344d046bc01cb8d7bcdf2bac9c49699b5e2d8cb))

## [1.69.1](https://github.com/lth91/luot247-vision/compare/v1.69.0...v1.69.1) (2026-07-02)


### Bug Fixes

* **views:** bỏ ngày spike viral trong daily-auto-views — trần cố định 3600/ngày ([#95](https://github.com/lth91/luot247-vision/issues/95)) ([8376291](https://github.com/lth91/luot247-vision/commit/8376291339589fe19307315e57642d4d35955a1a))

# [1.69.0](https://github.com/lth91/luot247-vision/compare/v1.68.0...v1.69.0) (2026-07-02)


### Features

* **submission:** chuẩn dung lượng mới — tiêu đề 12–18 từ, tổng tiêu đề + nội dung 120–140 từ ([#94](https://github.com/lth91/luot247-vision/issues/94)) ([b451198](https://github.com/lth91/luot247-vision/commit/b451198d2242fb4fdc96c319c6167555e1bf32d1))

# [1.68.0](https://github.com/lth91/luot247-vision/compare/v1.67.1...v1.68.0) (2026-07-01)


### Features

* **feed:** nhãn 9 chuyên mục IN HOA + lưới cân đối ([#91](https://github.com/lth91/luot247-vision/issues/91)) ([0093027](https://github.com/lth91/luot247-vision/commit/0093027e1d165744277e08c7c4c6e376bf2b8ebd))
* **submission:** phân loại tin 6 → 9 mục — backend ([#90](https://github.com/lth91/luot247-vision/issues/90)) ([0abda87](https://github.com/lth91/luot247-vision/commit/0abda87bf6b3a2a79a3c9fac5e466d1458c3690a))

## [1.67.1](https://github.com/lth91/luot247-vision/compare/v1.67.0...v1.67.1) (2026-07-01)


### Bug Fixes

* **electricity:** nhận tin điện/năng lượng quốc tế + bỏ ngưỡng tin cậy ([#89](https://github.com/lth91/luot247-vision/issues/89)) ([a184043](https://github.com/lth91/luot247-vision/commit/a184043a4b1af4f47ae5e70d1a9d7bbeeec086c8))

# [1.67.0](https://github.com/lth91/luot247-vision/compare/v1.66.1...v1.67.0) (2026-07-01)


### Features

* **seo:** sitemap động liệt kê từng bài (/tin/:id) ([#88](https://github.com/lth91/luot247-vision/issues/88)) ([92c4dce](https://github.com/lth91/luot247-vision/commit/92c4dce7e027315a2f273867d7ee0f600b9019ff))

## [1.66.1](https://github.com/lth91/luot247-vision/compare/v1.66.0...v1.66.1) (2026-07-01)


### Bug Fixes

* **home:** deep-link /tin/:id cuộn tới đúng bài ([#87](https://github.com/lth91/luot247-vision/issues/87)) ([3ec639f](https://github.com/lth91/luot247-vision/commit/3ec639f588eed9274474e72f228d563137d6178f))

# [1.66.0](https://github.com/lth91/luot247-vision/compare/v1.65.0...v1.66.0) (2026-07-01)


### Features

* **seo:** OG động per-bài cho /tin/:id ([#86](https://github.com/lth91/luot247-vision/issues/86)) ([006e30d](https://github.com/lth91/luot247-vision/commit/006e30de3cbd9f25ecbc834004a06d8a43a4006f))

# [1.65.0](https://github.com/lth91/luot247-vision/compare/v1.64.1...v1.65.0) (2026-07-01)


### Features

* **seo:** og:image mặc định + ảnh thương hiệu ([#85](https://github.com/lth91/luot247-vision/issues/85)) ([45264c3](https://github.com/lth91/luot247-vision/commit/45264c3d0a4c8b568872daa6d5dc1c641d112f1f))

## [1.64.1](https://github.com/lth91/luot247-vision/compare/v1.64.0...v1.64.1) (2026-07-01)


### Bug Fixes

* **analytics:** GA4 gtag tĩnh trong head (Search Console verify được) ([#84](https://github.com/lth91/luot247-vision/issues/84)) ([2c8c991](https://github.com/lth91/luot247-vision/commit/2c8c99145234dc5b329b30c3c0b3cbe36b6a87fc))

# [1.64.0](https://github.com/lth91/luot247-vision/compare/v1.63.0...v1.64.0) (2026-07-01)


### Features

* **seo:** sitemap.xml + robots.txt cho Google index ([#83](https://github.com/lth91/luot247-vision/issues/83)) ([3081395](https://github.com/lth91/luot247-vision/commit/3081395721fbda4d925875c70df513eb697b0ca6))

# [1.63.0](https://github.com/lth91/luot247-vision/compare/v1.62.1...v1.63.0) (2026-07-01)


### Features

* **analytics:** đo traffic thật — GA4 + Meta Pixel ([#82](https://github.com/lth91/luot247-vision/issues/82)) ([a7ec042](https://github.com/lth91/luot247-vision/commit/a7ec0425de7c2f53f50ce450bb3dac26111018c3))

## [1.62.1](https://github.com/lth91/luot247-vision/compare/v1.62.0...v1.62.1) (2026-06-30)


### Bug Fixes

* **feed:** nhãn 6 chuyên mục IN HOA đầy đủ + chip 1 dòng ([#80](https://github.com/lth91/luot247-vision/issues/80)) ([e727b32](https://github.com/lth91/luot247-vision/commit/e727b32a34f7c555d5fe9793e782521fe9445bf6))

# [1.62.0](https://github.com/lth91/luot247-vision/compare/v1.61.0...v1.62.0) (2026-06-30)


### Features

* **electricity:** /d user gửi tin + giống hệt trang chủ ([#79](https://github.com/lth91/luot247-vision/issues/79)) ([f6f3972](https://github.com/lth91/luot247-vision/commit/f6f3972ff7f602df4d486bcf649dbb10036f52f7))

# [1.61.0](https://github.com/lth91/luot247-vision/compare/v1.60.0...v1.61.0) (2026-06-30)


### Features

* **electricity:** chuyển /d sang user gửi tin — backend ([#78](https://github.com/lth91/luot247-vision/issues/78)) ([484c150](https://github.com/lth91/luot247-vision/commit/484c150d4743d478c5788e79e1318b0b5542b1fd))

# [1.60.0](https://github.com/lth91/luot247-vision/compare/v1.59.1...v1.60.0) (2026-06-30)


### Features

* **submission:** phân loại lại tin cũ theo 6 mục ([#76](https://github.com/lth91/luot247-vision/issues/76)) ([62a72ec](https://github.com/lth91/luot247-vision/commit/62a72ec327f0b831e747680ed556c8f27e83e08a))

## [1.59.1](https://github.com/lth91/luot247-vision/compare/v1.59.0...v1.59.1) (2026-06-30)


### Bug Fixes

* **submission:** bulk lưu category_confidence để đo được độ tin cậy ([#75](https://github.com/lth91/luot247-vision/issues/75)) ([2063100](https://github.com/lth91/luot247-vision/commit/20631002089b7233b96c3a325a05d93b25e4adb4))

# [1.59.0](https://github.com/lth91/luot247-vision/compare/v1.58.2...v1.59.0) (2026-06-30)


### Features

* **submission:** thêm chuyên mục Khoa học - Công nghệ ([#73](https://github.com/lth91/luot247-vision/issues/73)) ([40f4e16](https://github.com/lth91/luot247-vision/commit/40f4e16cc933375d5d1cd267ccc5b33d56c3794d))

## [1.58.2](https://github.com/lth91/luot247-vision/compare/v1.58.1...v1.58.2) (2026-06-29)


### Bug Fixes

* **views:** get_view2_stats đếm theo ngày lịch (00:00) thay vì mốc 7h ([#72](https://github.com/lth91/luot247-vision/issues/72)) ([9ab6645](https://github.com/lth91/luot247-vision/commit/9ab6645c2a05f037e304a161d8e6de7d6866e2f8))

## [1.58.1](https://github.com/lth91/luot247-vision/compare/v1.58.0...v1.58.1) (2026-06-29)


### Bug Fixes

* **views:** get_view2_stats tính ngày theo mốc 7h rolling ([#71](https://github.com/lth91/luot247-vision/issues/71)) ([52b379f](https://github.com/lth91/luot247-vision/commit/52b379fb80188aebce0093abeca8355335aa9016))

# [1.58.0](https://github.com/lth91/luot247-vision/compare/v1.57.0...v1.58.0) (2026-06-29)


### Features

* **submission:** tab "Tin bị loại" xem lại tin bị loại để sửa ([#70](https://github.com/lth91/luot247-vision/issues/70)) ([4a6bd66](https://github.com/lth91/luot247-vision/commit/4a6bd6608030284aba47277603a471722f204725))

# [1.57.0](https://github.com/lth91/luot247-vision/compare/v1.56.0...v1.57.0) (2026-06-29)


### Features

* **submission:** báo đúng dòng/tin bị loại khi import sheet ([#68](https://github.com/lth91/luot247-vision/issues/68)) ([121b059](https://github.com/lth91/luot247-vision/commit/121b05921b1eb742ccfac5d2e177342de50293d0))

# [1.56.0](https://github.com/lth91/luot247-vision/compare/v1.55.0...v1.56.0) (2026-06-29)


### Features

* **security:** khóa đọc raw view_logs2 (Mức A — chỉ admin) ([#67](https://github.com/lth91/luot247-vision/issues/67)) ([23fb1c3](https://github.com/lth91/luot247-vision/commit/23fb1c3951f65a5a3fcea0e84b740fe6dfab0e63))

# [1.55.0](https://github.com/lth91/luot247-vision/compare/v1.54.1...v1.55.0) (2026-06-29)


### Features

* **views:** mô phỏng auto-views thật hơn (5 hướng) ([#66](https://github.com/lth91/luot247-vision/issues/66)) ([85d2e20](https://github.com/lth91/luot247-vision/commit/85d2e201f3ff4a64e34d53ea9c75136817177dc3))

## [1.54.1](https://github.com/lth91/luot247-vision/compare/v1.54.0...v1.54.1) (2026-06-29)


### Bug Fixes

* **submission:** import lại sheet an toàn + rẻ (dedup trước LLM) ([#65](https://github.com/lth91/luot247-vision/issues/65)) ([a16add2](https://github.com/lth91/luot247-vision/commit/a16add261dd1784ba552484e2ac6309a3b74ec5b))

# [1.54.0](https://github.com/lth91/luot247-vision/compare/v1.53.0...v1.54.0) (2026-06-29)


### Features

* **submission:** import hàng loạt tin từ Google Sheet ([#64](https://github.com/lth91/luot247-vision/issues/64)) ([53b9aa1](https://github.com/lth91/luot247-vision/commit/53b9aa153aed3a151daeb2da45d36523be5978d0))

# [1.53.0](https://github.com/lth91/luot247-vision/compare/v1.52.0...v1.53.0) (2026-06-28)


### Features

* **submission:** bỏ ô Chuyên mục + Nguồn khỏi form gửi tin ([#62](https://github.com/lth91/luot247-vision/issues/62)) ([a385f06](https://github.com/lth91/luot247-vision/commit/a385f064b8d11bccf1fdc24da248924dac341e4a))

# [1.52.0](https://github.com/lth91/luot247-vision/compare/v1.51.0...v1.52.0) (2026-06-28)


### Features

* **scoring:** khóa điểm khỏi user tự sửa + phạt phân tầng khi gỡ tin ([#61](https://github.com/lth91/luot247-vision/issues/61)) ([b446874](https://github.com/lth91/luot247-vision/commit/b44687483df1093612db55ee1297ae6e6c823e5f))

# [1.51.0](https://github.com/lth91/luot247-vision/compare/v1.50.0...v1.51.0) (2026-06-28)


### Bug Fixes

* **news:** khôi phục feed sau khi backfill migration đẩy updated_at toàn bảng ([#58](https://github.com/lth91/luot247-vision/issues/58)) ([73c5a15](https://github.com/lth91/luot247-vision/commit/73c5a15b44ac20eb7655a257dadf9f0ae2d2dd90))


### Features

* **submission:** frontend pipeline tin user gửi (4 trang + menu) ([#57](https://github.com/lth91/luot247-vision/issues/57)) ([5436425](https://github.com/lth91/luot247-vision/commit/5436425bc64157ace6a2a7f0bb35464b4030767b))

# [1.50.0](https://github.com/lth91/luot247-vision/compare/v1.49.0...v1.50.0) (2026-06-28)


### Features

* **views:** tăng target view giả lập lên 2700-3300/ngày từ 29/6 ([#59](https://github.com/lth91/luot247-vision/issues/59)) ([bd3ae48](https://github.com/lth91/luot247-vision/commit/bd3ae480918be467d637cf829b0f0ddcb927e336))

# [1.49.0](https://github.com/lth91/luot247-vision/compare/v1.48.0...v1.49.0) (2026-06-27)


### Features

* **submission:** backend pipeline tin user gửi (migrations + edge function) ([#56](https://github.com/lth91/luot247-vision/issues/56)) ([f7c3a8f](https://github.com/lth91/luot247-vision/commit/f7c3a8f4f1161d728fa670c9f7a212829a48c508))

# [1.48.0](https://github.com/lth91/luot247-vision/compare/v1.47.0...v1.48.0) (2026-06-26)


### Features

* **brand:** wire favicon.svg cho tab trình duyệt ([#54](https://github.com/lth91/luot247-vision/issues/54)) ([e57a0ff](https://github.com/lth91/luot247-vision/commit/e57a0ff1534e81be0c8cd92822e5f036eafffc9d))

# [1.47.0](https://github.com/lth91/luot247-vision/compare/v1.46.2...v1.47.0) (2026-06-26)


### Features

* **brand:** cập nhật logo Lướt 247 ([#53](https://github.com/lth91/luot247-vision/issues/53)) ([bf42aaf](https://github.com/lth91/luot247-vision/commit/bf42aafc2e8771021985fd76e0a7e96de3582709))

## [1.46.2](https://github.com/lth91/luot247-vision/compare/v1.46.1...v1.46.2) (2026-06-26)


### Bug Fixes

* **home2:** tách nội dung thành nhiều đoạn trong chế độ lật ([#52](https://github.com/lth91/luot247-vision/issues/52)) ([8eda926](https://github.com/lth91/luot247-vision/commit/8eda926ffaa46b29ce45398a10ed4e9bc6e261e0))

## [1.46.1](https://github.com/lth91/luot247-vision/compare/v1.46.0...v1.46.1) (2026-06-26)


### Bug Fixes

* **home:** chế độ lật mở đúng tin đang xem ở trang chủ ([#51](https://github.com/lth91/luot247-vision/issues/51)) ([5e16ec7](https://github.com/lth91/luot247-vision/commit/5e16ec7fa767aa13aa986fd244d97914595f5d08)), closes [#44](https://github.com/lth91/luot247-vision/issues/44)

# [1.46.0](https://github.com/lth91/luot247-vision/compare/v1.45.3...v1.46.0) (2026-06-25)


### Features

* **home:** tách nội dung tin thành nhiều đoạn theo sheet ([#48](https://github.com/lth91/luot247-vision/issues/48)) ([942a1ed](https://github.com/lth91/luot247-vision/commit/942a1edf465981d08d9db7080be76e60a26e0c6b))

## [1.45.3](https://github.com/lth91/luot247-vision/compare/v1.45.2...v1.45.3) (2026-06-25)


### Bug Fixes

* **home:** tiêu đề desktop cho 2 dòng thay vì cắt cụt 1 dòng ([#47](https://github.com/lth91/luot247-vision/issues/47)) ([9f1aab2](https://github.com/lth91/luot247-vision/commit/9f1aab2d7eb665d5a3359376e5d74a8d497caa33)), closes [#46](https://github.com/lth91/luot247-vision/issues/46)

## [1.45.2](https://github.com/lth91/luot247-vision/compare/v1.45.1...v1.45.2) (2026-06-25)


### Bug Fixes

* **home:** giữ line-clamp tiêu đề trên desktop, chỉ bỏ trên mobile ([#46](https://github.com/lth91/luot247-vision/issues/46)) ([d34e0b3](https://github.com/lth91/luot247-vision/commit/d34e0b3961e3608df242d1f89ff32f9678eea296)), closes [#45](https://github.com/lth91/luot247-vision/issues/45)

## [1.45.1](https://github.com/lth91/luot247-vision/compare/v1.45.0...v1.45.1) (2026-06-25)


### Bug Fixes

* **home:** tiêu đề không bị cắt cụt trên mobile ([#45](https://github.com/lth91/luot247-vision/issues/45)) ([aa38f9a](https://github.com/lth91/luot247-vision/commit/aa38f9a3a5817c0e2053ba5a8185a55092f12f6c))

# [1.45.0](https://github.com/lth91/luot247-vision/compare/v1.44.4...v1.45.0) (2026-06-24)


### Features

* **home:** mobile auto-hide thật + fix giật mark-read ([#44](https://github.com/lth91/luot247-vision/issues/44)) ([6eaf2be](https://github.com/lth91/luot247-vision/commit/6eaf2bec3b547344d1a2bb74484b9e09c41109b6))

## [1.44.4](https://github.com/lth91/luot247-vision/compare/v1.44.3...v1.44.4) (2026-06-24)


### Bug Fixes

* **home:** tin mới không bị ẩn sau refresh (bỏ blanket-hide mobile) ([#43](https://github.com/lth91/luot247-vision/issues/43)) ([769a4ef](https://github.com/lth91/luot247-vision/commit/769a4efc3d83dfad25cc22f873894de25d495257))

## [1.44.3](https://github.com/lth91/luot247-vision/compare/v1.44.2...v1.44.3) (2026-06-24)


### Bug Fixes

* **home:** sửa ẩn/hiện tin đã đọc + bug dbg tự tham chiếu ([#42](https://github.com/lth91/luot247-vision/issues/42)) ([024c4ad](https://github.com/lth91/luot247-vision/commit/024c4ad323cc8bc9619a5dc514a852079f4db1bd)), closes [#41](https://github.com/lth91/luot247-vision/issues/41)

## [1.44.2](https://github.com/lth91/luot247-vision/compare/v1.44.1...v1.44.2) (2026-06-24)


### Performance Improvements

* **home:** tắt console.log production + hoist parse — fix giật khi scroll ([#41](https://github.com/lth91/luot247-vision/issues/41)) ([8be5b57](https://github.com/lth91/luot247-vision/commit/8be5b57a674ee88990c1c1ce980f1ac466314da9))

## [1.44.1](https://github.com/lth91/luot247-vision/compare/v1.44.0...v1.44.1) (2026-06-24)


### Bug Fixes

* **import:** parser CSV chuẩn — fix tin bị vỡ thành fragment ([#40](https://github.com/lth91/luot247-vision/issues/40)) ([f8403c3](https://github.com/lth91/luot247-vision/commit/f8403c3febfeb0901de6db62d653d056757caed3))

# [1.44.0](https://github.com/lth91/luot247-vision/compare/v1.43.0...v1.44.0) (2026-06-24)


### Features

* **duyet-tin:** hiển thị nội dung dưới tiêu đề khi duyệt tin ([#38](https://github.com/lth91/luot247-vision/issues/38)) ([1d64b66](https://github.com/lth91/luot247-vision/commit/1d64b665e6cfa60ed136ef60bdb2b807f9843297))

# [1.43.0](https://github.com/lth91/luot247-vision/compare/v1.42.1...v1.43.0) (2026-06-24)


### Features

* **home:** hiển thị nội dung dưới tiêu đề trên feed trang chủ ([#37](https://github.com/lth91/luot247-vision/issues/37)) ([792e012](https://github.com/lth91/luot247-vision/commit/792e0122909892fe8f0ad0820a683580d6734142))

## [1.42.1](https://github.com/lth91/luot247-vision/compare/v1.42.0...v1.42.1) (2026-05-25)


### Bug Fixes

* **electricity:** chặn off-topic title "lạng lách" + "vì sức khỏe người lao động" lọt /d ([f1ac097](https://github.com/lth91/luot247-vision/commit/f1ac097d37fd0ef2f173aa30b82ddc142d309cb7))

# [1.42.0](https://github.com/lth91/luot247-vision/compare/v1.41.0...v1.42.0) (2026-05-19)


### Features

* **electricity:** add 5 Google News RSS workaround cho Mac Mini broken ([e67c41b](https://github.com/lth91/luot247-vision/commit/e67c41bb2a19ffc25c28d3b7670f5021021c00dd))

# [1.41.0](https://github.com/lth91/luot247-vision/compare/v1.40.0...v1.41.0) (2026-05-19)


### Features

* **electricity:** add sub nangluongvietnam "Khoa học CN Môi trường" ([#9](https://github.com/lth91/luot247-vision/issues/9) QA 19/5) ([651b7af](https://github.com/lth91/luot247-vision/commit/651b7af8e6043aa4ab22beee99da3d1f00f8fce8))

# [1.40.0](https://github.com/lth91/luot247-vision/compare/v1.39.2...v1.40.0) (2026-05-19)


### Features

* **viewcount:** target 2000-3000/day + fix distribution formula + drop cron trùng ([b105988](https://github.com/lth91/luot247-vision/commit/b1059888a5e557901b015c52f02f60a13933a509))

## [1.39.2](https://github.com/lth91/luot247-vision/compare/v1.39.1...v1.39.2) (2026-05-19)


### Bug Fixes

* **viewcount:** grant EXECUTE get_view2_stats cho anon + authenticated ([1587810](https://github.com/lth91/luot247-vision/commit/1587810d1046b3b9d17836ac492389a4d69650fc))

## [1.39.1](https://github.com/lth91/luot247-vision/compare/v1.39.0...v1.39.1) (2026-05-16)


### Bug Fixes

* **electricity:** chặn title-duplicate trong cùng batch Discovery RSS ([4d70836](https://github.com/lth91/luot247-vision/commit/4d70836917e3e2ed7dca98c0e9e399d3fbb08441))

# [1.39.0](https://github.com/lth91/luot247-vision/compare/v1.38.0...v1.39.0) (2026-05-16)


### Features

* **electricity:** add 2 source mới sau QA 5/16 (coverage fix) ([6bbbbf0](https://github.com/lth91/luot247-vision/commit/6bbbbf0a5234d29e93c310fa1548038bbb8b8c7e)), closes [#10](https://github.com/lth91/luot247-vision/issues/10) [#7](https://github.com/lth91/luot247-vision/issues/7)

# [1.38.0](https://github.com/lth91/luot247-vision/compare/v1.37.8...v1.38.0) (2026-05-14)


### Features

* **electricity:** add 13 source mới sau QA 5/14 (coverage fix) ([1161217](https://github.com/lth91/luot247-vision/commit/1161217ea612b4b5d863e821aa3f81f6b2386e4e)), closes [#2](https://github.com/lth91/luot247-vision/issues/2) [#24](https://github.com/lth91/luot247-vision/issues/24) [#4](https://github.com/lth91/luot247-vision/issues/4) [#13](https://github.com/lth91/luot247-vision/issues/13) [#26](https://github.com/lth91/luot247-vision/issues/26) [#15](https://github.com/lth91/luot247-vision/issues/15) [#25](https://github.com/lth91/luot247-vision/issues/25) [#9](https://github.com/lth91/luot247-vision/issues/9) [#8](https://github.com/lth91/luot247-vision/issues/8) [#10](https://github.com/lth91/luot247-vision/issues/10) [#3](https://github.com/lth91/luot247-vision/issues/3) [#23](https://github.com/lth91/luot247-vision/issues/23) [#22](https://github.com/lth91/luot247-vision/issues/22) [#19](https://github.com/lth91/luot247-vision/issues/19) [#1](https://github.com/lth91/luot247-vision/issues/1)

## [1.37.8](https://github.com/lth91/luot247-vision/compare/v1.37.7...v1.37.8) (2026-05-11)


### Bug Fixes

* **electricity:** exclude địa danh "Điện Biên/Bàn" khỏi keyword filter + cleanup 4 bài off-topic ([e01d87f](https://github.com/lth91/luot247-vision/commit/e01d87fe7759f71ef066e80ed08aadc36a7e0f5d))

## [1.37.7](https://github.com/lth91/luot247-vision/compare/v1.37.6...v1.37.7) (2026-05-09)


### Bug Fixes

* **mobile:** scroll lock 2s trong head script — install listener trước React ([960ecd5](https://github.com/lth91/luot247-vision/commit/960ecd5b8844dc00e51f02a989f9ddaf4b3d65f4))

## [1.37.6](https://github.com/lth91/luot247-vision/compare/v1.37.5...v1.37.6) (2026-05-09)


### Bug Fixes

* **mobile:** multi-layer force scroll=0 sau refresh (overflow-anchor + watchdog) ([2be2045](https://github.com/lth91/luot247-vision/commit/2be2045830f7e85cad9aa413ee551d062fe9177b))

## [1.37.5](https://github.com/lth91/luot247-vision/compare/v1.37.4...v1.37.5) (2026-05-09)


### Bug Fixes

* **mobile:** force scrollTo(0,0) lặp 6 lần sau refresh để override iOS auto-restore ([1caa54f](https://github.com/lth91/luot247-vision/commit/1caa54f66b37123c3ed280c3250f15c1f70583d8)), closes [#10](https://github.com/lth91/luot247-vision/issues/10)

## [1.37.4](https://github.com/lth91/luot247-vision/compare/v1.37.3...v1.37.4) (2026-05-09)


### Bug Fixes

* **mobile:** disable RADICAL setTimeout restore — override scrollTo(0,0) ([25e942f](https://github.com/lth91/luot247-vision/commit/25e942fa2b082c08cc235d32cd6e494adb4258ef))

## [1.37.3](https://github.com/lth91/luot247-vision/compare/v1.37.2...v1.37.3) (2026-05-09)


### Bug Fixes

* **mobile:** hide articles trước tin đang đọc + scroll=0 sau refresh ([dabec7c](https://github.com/lth91/luot247-vision/commit/dabec7c9a08e9fc1b1e4a9c85dda9b4a9b214b20)), closes [#5](https://github.com/lth91/luot247-vision/issues/5)

## [1.37.2](https://github.com/lth91/luot247-vision/compare/v1.37.1...v1.37.2) (2026-05-09)


### Bug Fixes

* **mobile:** luôn render cards khi data loaded, ẩn visually qua overlay ([362e7a1](https://github.com/lth91/luot247-vision/commit/362e7a145fce15309de19e1359e9149935cce148))

## [1.37.1](https://github.com/lth91/luot247-vision/compare/v1.37.0...v1.37.1) (2026-05-09)


### Bug Fixes

* **mobile:** disable native scrollRestoration để iOS Chrome không giữ vị trí cũ sau refresh ([cad09d6](https://github.com/lth91/luot247-vision/commit/cad09d6a3dde828656e5ef0b4c67a5bddddc6544)), closes [#5](https://github.com/lth91/luot247-vision/issues/5) [#5](https://github.com/lth91/luot247-vision/issues/5)

# [1.37.0](https://github.com/lth91/luot247-vision/compare/v1.36.1...v1.37.0) (2026-05-09)


### Features

* **discovery:** tier-1 bypass keyword filter + thêm 3 nguồn (BNews, TBTC VN, Người Đưa Tin) ([1895730](https://github.com/lth91/luot247-vision/commit/1895730220048c000ec9aaca1c1218b0fa8ccb7d))

## [1.36.1](https://github.com/lth91/luot247-vision/compare/v1.36.0...v1.36.1) (2026-05-09)


### Bug Fixes

* **electricity:** bỏ ^ anchor trong pattern Báo Bắc Ninh + Bộ KHCN ([cf1e78d](https://github.com/lth91/luot247-vision/commit/cf1e78d6ca221a961dea552c0cb6a86d1946e21a))

# [1.36.0](https://github.com/lth91/luot247-vision/compare/v1.35.1...v1.36.0) (2026-05-08)


### Features

* **autonomy:** thêm báo cáo cost 6h qua Telegram (4 lần/ngày) ([4a06289](https://github.com/lth91/luot247-vision/commit/4a0628917e0b5673657945d63c1ef37dbd8b8a66))
* **autonomy:** track LLM API cost + Telegram daily report & threshold alert ([3b890ee](https://github.com/lth91/luot247-vision/commit/3b890eeecbe4e5d2a53fad5b6e8867bc127d67ed))
* **electricity:** pre-LLM fuzzy dedupe + reject lịch cúp điện + prompt chất lượng ([fb0a781](https://github.com/lth91/luot247-vision/commit/fb0a781c725da5c61a691bd19a17c7222ac92e35))
* **electricity:** thêm Báo Bắc Ninh + Bộ KHCN làm electricity_sources ([d1be537](https://github.com/lth91/luot247-vision/commit/d1be53788565f5335cff22fe68ff1e616d2de6ac)), closes [E#13](https://github.com/E/issues/13) [E#12](https://github.com/E/issues/12)


### Reverts

* combo coverage gain để stop API cost spike ([e22bcd6](https://github.com/lth91/luot247-vision/commit/e22bcd62f8fff4c0cbb9d238caa1facca6f6c3a7))

## [1.35.1](https://github.com/lth91/luot247-vision/compare/v1.35.0...v1.35.1) (2026-05-07)


### Bug Fixes

* **d:** không ẩn tin MỚI crawl sau save khi mobile restore ([a032a1b](https://github.com/lth91/luot247-vision/commit/a032a1bf0506c6243bcc00c6ff745810eafb2cca)), closes [#5](https://github.com/lth91/luot247-vision/issues/5) [#5](https://github.com/lth91/luot247-vision/issues/5) [#1-4](https://github.com/lth91/luot247-vision/issues/1-4) [#5](https://github.com/lth91/luot247-vision/issues/5)

# [1.35.0](https://github.com/lth91/luot247-vision/compare/v1.34.7...v1.35.0) (2026-05-07)


### Features

* **d:** refresh mobile ẩn tin trước restore-point khỏi list ([4553bca](https://github.com/lth91/luot247-vision/commit/4553bca5b408d222967e5fcfc468f3e09032c037)), closes [#5](https://github.com/lth91/luot247-vision/issues/5) [#1-4](https://github.com/lth91/luot247-vision/issues/1-4) [#5](https://github.com/lth91/luot247-vision/issues/5) [#6](https://github.com/lth91/luot247-vision/issues/6) [#7](https://github.com/lth91/luot247-vision/issues/7) [#1-6](https://github.com/lth91/luot247-vision/issues/1-6)

## [1.34.7](https://github.com/lth91/luot247-vision/compare/v1.34.6...v1.34.7) (2026-05-07)


### Bug Fixes

* **d:** mobile dùng scroll memory pattern thay scroll-mark (match /) ([a8fa6f8](https://github.com/lth91/luot247-vision/commit/a8fa6f8f9b8e72930ea63c9982026d77de350c55))

## [1.34.6](https://github.com/lth91/luot247-vision/compare/v1.34.5...v1.34.6) (2026-05-07)


### Bug Fixes

* **d:** captureAnchor dùng refs + scrollTo behavior:instant cross-platform ([ac3f117](https://github.com/lth91/luot247-vision/commit/ac3f1178887719c8e944f08e6e3869bedd0f9bcc))

## [1.34.5](https://github.com/lth91/luot247-vision/compare/v1.34.4...v1.34.5) (2026-05-07)


### Bug Fixes

* **d:** instant display:none thay max-height transition ([70261cf](https://github.com/lth91/luot247-vision/commit/70261cfd7da9be64e0830ca465d4a90f7d4db751)), closes [#5](https://github.com/lth91/luot247-vision/issues/5)

## [1.34.4](https://github.com/lth91/luot247-vision/compare/v1.34.3...v1.34.4) (2026-05-07)


### Bug Fixes

* **d:** manual scroll compensation cho iOS Safari thiếu scroll-anchor ([eec32b6](https://github.com/lth91/luot247-vision/commit/eec32b6fa2f7d0e517d4170321b5727211c90e59)), closes [#1](https://github.com/lth91/luot247-vision/issues/1) [#5](https://github.com/lth91/luot247-vision/issues/5) [#5](https://github.com/lth91/luot247-vision/issues/5) [#1-4](https://github.com/lth91/luot247-vision/issues/1-4) [#5](https://github.com/lth91/luot247-vision/issues/5)

## [1.34.3](https://github.com/lth91/luot247-vision/compare/v1.34.2...v1.34.3) (2026-05-07)


### Bug Fixes

* **d:** bỏ defer scrolling toggle effect — dùng CSS collapse animation ([166e719](https://github.com/lth91/luot247-vision/commit/166e719bd114ba3c5dde3af61f0c1417cf9e2054))

## [1.34.2](https://github.com/lth91/luot247-vision/compare/v1.34.1...v1.34.2) (2026-05-07)


### Bug Fixes

* **d:** chống giật lag — defer filter trong scroll + trigger ít nhạy ([b1d7dc7](https://github.com/lth91/luot247-vision/commit/b1d7dc7042dd1748a0560dc353c1a9c9786dc233))

## [1.34.1](https://github.com/lth91/luot247-vision/compare/v1.34.0...v1.34.1) (2026-05-07)


### Bug Fixes

* **d:** mobile bug auto-hide — switch sang scroll listener pattern / ([d5523ff](https://github.com/lth91/luot247-vision/commit/d5523ff08340cd08929c7e0dfefd2a01a2552d81))

# [1.34.0](https://github.com/lth91/luot247-vision/compare/v1.33.0...v1.34.0) (2026-05-07)


### Features

* **d:** auto-hide read news — port tính năng từ trang chủ / ([47f8dd9](https://github.com/lth91/luot247-vision/commit/47f8dd9e954cbca4e5fe85a4539940db3bd38fa5))

# [1.33.0](https://github.com/lth91/luot247-vision/compare/v1.32.0...v1.33.0) (2026-05-07)


### Features

* **discovery:** combo coverage gain — +6 RSS feed, +1 HTML feed, 30min cron ([6aea001](https://github.com/lth91/luot247-vision/commit/6aea0010fb831838bba1439f1bc546508948f58e)), closes [#6](https://github.com/lth91/luot247-vision/issues/6) [#3](https://github.com/lth91/luot247-vision/issues/3) [#10](https://github.com/lth91/luot247-vision/issues/10) [#9](https://github.com/lth91/luot247-vision/issues/9) [#22](https://github.com/lth91/luot247-vision/issues/22) [#20](https://github.com/lth91/luot247-vision/issues/20)

# [1.32.0](https://github.com/lth91/luot247-vision/compare/v1.31.0...v1.32.0) (2026-05-06)


### Features

* **discovery:** log mọi LLM classification cho threshold analysis ([aa4d57b](https://github.com/lth91/luot247-vision/commit/aa4d57bf6c284b12a1bc05cfb48b060c309f3d1c))

# [1.31.0](https://github.com/lth91/luot247-vision/compare/v1.30.2...v1.31.0) (2026-05-06)


### Features

* **discovery:** dry_run mode để xem classifications borderline ([fbb75aa](https://github.com/lth91/luot247-vision/commit/fbb75aaddcbab0bff4ddbe902906bc9cd8728455))

## [1.30.2](https://github.com/lth91/luot247-vision/compare/v1.30.1...v1.30.2) (2026-05-06)


### Bug Fixes

* **electricity:** Unicode \b boundary + quality_score sample_factor ([2cce6b1](https://github.com/lth91/luot247-vision/commit/2cce6b199c1bee02d6df10e632c95e40e44ef807)), closes [#22](https://github.com/lth91/luot247-vision/issues/22) [#21](https://github.com/lth91/luot247-vision/issues/21)

## [1.30.1](https://github.com/lth91/luot247-vision/compare/v1.30.0...v1.30.1) (2026-05-06)


### Bug Fixes

* **electricity:** disable 403 sources + move baotintuc sang Discovery ([ac1065d](https://github.com/lth91/luot247-vision/commit/ac1065da049274563e4de50be54e52c02ff11d2c)), closes [#23](https://github.com/lth91/luot247-vision/issues/23)

# [1.30.0](https://github.com/lth91/luot247-vision/compare/v1.29.1...v1.30.0) (2026-05-06)


### Features

* **electricity:** per-tier MAX_ARTICLES — tier 3 broad channels cần 20 ([39674db](https://github.com/lth91/luot247-vision/commit/39674db84d05c00935e695969a9fa9548a69ef01)), closes [hi#signal](https://github.com/hi/issues/signal)

## [1.29.1](https://github.com/lth91/luot247-vision/compare/v1.29.0...v1.29.1) (2026-05-06)


### Bug Fixes

* **electricity:** cleanup không disable source <14 ngày tuổi + reactivate ([1d474d9](https://github.com/lth91/luot247-vision/commit/1d474d986e8945c5fe75e6bb52d06cf64fa65767))

# [1.29.0](https://github.com/lth91/luot247-vision/compare/v1.28.0...v1.29.0) (2026-05-06)


### Features

* **electricity:** Phase 1D — Cafef ngân hàng + Tuổi Trẻ Thế giới ([f2950e3](https://github.com/lth91/luot247-vision/commit/f2950e34f46f877356cb125ffb5ec85576a45e6f)), closes [#1](https://github.com/lth91/luot247-vision/issues/1) [#14](https://github.com/lth91/luot247-vision/issues/14) [#16](https://github.com/lth91/luot247-vision/issues/16) [#2](https://github.com/lth91/luot247-vision/issues/2) [#11](https://github.com/lth91/luot247-vision/issues/11)

# [1.28.0](https://github.com/lth91/luot247-vision/compare/v1.27.0...v1.28.0) (2026-05-06)


### Features

* **electricity:** Phase 1C — 3 domain mới (Nhà Đầu Tư, Một Thế Giới, Lào Cai) ([173300c](https://github.com/lth91/luot247-vision/commit/173300c2b4db8df1c8444239d1f315332e02e42c)), closes [#14](https://github.com/lth91/luot247-vision/issues/14) [#19](https://github.com/lth91/luot247-vision/issues/19) [#21](https://github.com/lth91/luot247-vision/issues/21)

# [1.27.0](https://github.com/lth91/luot247-vision/compare/v1.26.0...v1.27.0) (2026-05-06)


### Features

* **electricity:** Phase 1B — 3 channel cuối + reactivate baotintuc ([caa95cc](https://github.com/lth91/luot247-vision/commit/caa95cceade08aadc72228722e8ac694108188cc)), closes [#2](https://github.com/lth91/luot247-vision/issues/2) [#3](https://github.com/lth91/luot247-vision/issues/3) [#17](https://github.com/lth91/luot247-vision/issues/17)

# [1.26.0](https://github.com/lth91/luot247-vision/compare/v1.25.3...v1.26.0) (2026-05-06)


### Features

* **electricity:** Phase 1A — bổ sung 3 channel còn thiếu ([ad6b366](https://github.com/lth91/luot247-vision/commit/ad6b366ed93c252d3d029c61cef1bcf7993d6ad3)), closes [#8](https://github.com/lth91/luot247-vision/issues/8) [#24](https://github.com/lth91/luot247-vision/issues/24) [#5](https://github.com/lth91/luot247-vision/issues/5) [#16](https://github.com/lth91/luot247-vision/issues/16) [#2](https://github.com/lth91/luot247-vision/issues/2) [#17](https://github.com/lth91/luot247-vision/issues/17)

## [1.25.3](https://github.com/lth91/luot247-vision/compare/v1.25.2...v1.25.3) (2026-05-06)


### Bug Fixes

* **electricity:** re-cleanup 2 bài SHB+NovaLand crawl lại do race condition ([392dfc1](https://github.com/lth91/luot247-vision/commit/392dfc1b7c66012332636761c0c330d65a5064fd))

## [1.25.2](https://github.com/lth91/luot247-vision/compare/v1.25.1...v1.25.2) (2026-05-06)


### Bug Fixes

* **electricity:** tighten keyword regex + cleanup 3 bài off-topic ([27ad8d4](https://github.com/lth91/luot247-vision/commit/27ad8d4971931b1ef9ab0614f3c005be3c34d028))

## [1.25.1](https://github.com/lth91/luot247-vision/compare/v1.25.0...v1.25.1) (2026-05-06)


### Bug Fixes

* **electricity:** disable soha.vn + Googlebot UA cho nguoiquansat.vn ([50c8b27](https://github.com/lth91/luot247-vision/commit/50c8b276f356b354406ee315761f3ed62608606e))
* **electricity:** switch nguoiquansat.vn từ Playwright sang RSS ([33788cd](https://github.com/lth91/luot247-vision/commit/33788cd8adfbcc07a262cb4dfeffb1baf31bf012))

# [1.25.0](https://github.com/lth91/luot247-vision/compare/v1.24.0...v1.25.0) (2026-05-05)


### Features

* **electricity:** manual add baodautu.vn + vietnamfinance.vn qua Playwright ([1225a6f](https://github.com/lth91/luot247-vision/commit/1225a6f54d691259f2d17309fd1844edea3daf2f))

# [1.24.0](https://github.com/lth91/luot247-vision/compare/v1.23.0...v1.24.0) (2026-05-05)


### Features

* **discovery:** thêm VietnamNet Thời sự + VTV8 vào RSS Discovery feeds ([bd13c99](https://github.com/lth91/luot247-vision/commit/bd13c9969ec150e75f7f293f9a8117b65dc34328)), closes [#7](https://github.com/lth91/luot247-vision/issues/7) [#15](https://github.com/lth91/luot247-vision/issues/15)

# [1.23.0](https://github.com/lth91/luot247-vision/compare/v1.22.5...v1.23.0) (2026-05-05)


### Features

* **electricity:** add EVN - Vận hành source (category 60-2015) ([04b58fa](https://github.com/lth91/luot247-vision/commit/04b58fa15c2aec2ef67ae123ae4a2c05a00011cf)), closes [#9](https://github.com/lth91/luot247-vision/issues/9)

## [1.22.5](https://github.com/lth91/luot247-vision/compare/v1.22.4...v1.22.5) (2026-05-05)


### Bug Fixes

* **autonomy:** link_pattern Playwright source vietnam/plo/tapchicongthuong ([9591c7e](https://github.com/lth91/luot247-vision/commit/9591c7e4175a73ac7b94b3ec14d54f742280b2b1))

## [1.22.4](https://github.com/lth91/luot247-vision/compare/v1.22.3...v1.22.4) (2026-05-04)


### Bug Fixes

* **autonomy:** cảnh báo pipeline gọn hơn + tránh underscore vỡ Telegram ([135d174](https://github.com/lth91/luot247-vision/commit/135d17498964fb447bfc073e0b895c9f672fff45))

## [1.22.3](https://github.com/lth91/luot247-vision/compare/v1.22.2...v1.22.3) (2026-05-04)


### Bug Fixes

* **autonomy:** Telegram report viết lại bằng từ ngữ thân thiện, không kỹ thuật ([aaaf174](https://github.com/lth91/luot247-vision/commit/aaaf174404af93311fb8cfc8661f197ac2ec457b))

## [1.22.2](https://github.com/lth91/luot247-vision/compare/v1.22.1...v1.22.2) (2026-05-04)


### Bug Fixes

* **electricity:** /d timestamp đơn giản hóa — chỉ "X phút trước" (crawled_at) ([9ab5b18](https://github.com/lth91/luot247-vision/commit/9ab5b1888d80178b5d37b284f3213137e589490a))

## [1.22.1](https://github.com/lth91/luot247-vision/compare/v1.22.0...v1.22.1) (2026-05-04)


### Bug Fixes

* **electricity:** timestamp /d hiển thị tách "Tìm thấy" + "Đăng" ([ada7237](https://github.com/lth91/luot247-vision/commit/ada7237a5fc288b8ed761007330a8d6954de3868))

# [1.22.0](https://github.com/lth91/luot247-vision/compare/v1.21.6...v1.22.0) (2026-05-04)


### Features

* **electricity:** /d sort theo crawled_at — tin mới tìm thấy lên đầu ([bbab12f](https://github.com/lth91/luot247-vision/commit/bbab12fd16bae90949630bd5b612332d4b8753fb))

## [1.21.6](https://github.com/lth91/luot247-vision/compare/v1.21.5...v1.21.6) (2026-05-04)


### Bug Fixes

* **electricity:** mobile responsive cho /ddashboard ([ff5cc3d](https://github.com/lth91/luot247-vision/commit/ff5cc3d62ae4414ce43f14cfa5ca3050853add44))

## [1.21.5](https://github.com/lth91/luot247-vision/compare/v1.21.4...v1.21.5) (2026-05-04)


### Bug Fixes

* **autonomy:** inferLinkPattern dùng subset có digit-id để tránh nhiễu ([9c85ad3](https://github.com/lth91/luot247-vision/commit/9c85ad30168d8b693aa18bcf49346115065dfe05))

## [1.21.4](https://github.com/lth91/luot247-vision/compare/v1.21.3...v1.21.4) (2026-05-04)


### Bug Fixes

* **autonomy:** Phase E skip domain Mac Mini đã cover via per-host naming ([876c215](https://github.com/lth91/luot247-vision/commit/876c2158160f0717801ac1fe7234510585b432d4))

## [1.21.3](https://github.com/lth91/luot247-vision/compare/v1.21.2...v1.21.3) (2026-05-04)


### Bug Fixes

* **autonomy:** hạ threshold Playwright handover xuống = MIN_SAMPLE_COUNT (3) ([213c0c2](https://github.com/lth91/luot247-vision/commit/213c0c2475fb4c2361a930af0525bd096892ac50))

## [1.21.2](https://github.com/lth91/luot247-vision/compare/v1.21.1...v1.21.2) (2026-05-04)


### Bug Fixes

* **electricity:** tab AI Agents — RLS public read + mô tả Phase E up to date ([e8bc73e](https://github.com/lth91/luot247-vision/commit/e8bc73eae81e44b51742183d19f10438efb5f0ea))

## [1.21.1](https://github.com/lth91/luot247-vision/compare/v1.21.0...v1.21.1) (2026-05-04)


### Bug Fixes

* **electricity:** dashboard match per-host Mac Mini naming + mark CPC handover ([83dc2af](https://github.com/lth91/luot247-vision/commit/83dc2affbe2f010fca0a7cd31b6a5a5184f883d9))

# [1.21.0](https://github.com/lth91/luot247-vision/compare/v1.20.3...v1.21.0) (2026-05-04)


### Features

* **autonomy:** pipeline-health-check cron 6h + Telegram alert khi có issue ([41df107](https://github.com/lth91/luot247-vision/commit/41df1070e2d523fcf21379d1c0d43eb179d0a54a))

## [1.20.3](https://github.com/lth91/luot247-vision/compare/v1.20.2...v1.20.3) (2026-05-04)


### Bug Fixes

* **electricity:** parser robust với JSON malformed/markdown fence từ Claude ([bfd6805](https://github.com/lth91/luot247-vision/commit/bfd68051c19e79771040628a29160caef1e546cc))

## [1.20.2](https://github.com/lth91/luot247-vision/compare/v1.20.1...v1.20.2) (2026-05-04)


### Bug Fixes

* **autonomy:** mở rộng feed_type CHECK để allow 'playwright' ([e8c8190](https://github.com/lth91/luot247-vision/commit/e8c8190b2de520ced9afd11faa1df1135e9efefd))

## [1.20.1](https://github.com/lth91/luot247-vision/compare/v1.20.0...v1.20.1) (2026-05-04)


### Bug Fixes

* **autonomy:** Phase E suy luận link_pattern từ trang chủ thật + cron lifecycle ([3cb5b62](https://github.com/lth91/luot247-vision/commit/3cb5b62ba1214f36fec4e6f84ea609270d5fa30d))

# [1.20.0](https://github.com/lth91/luot247-vision/compare/v1.19.0...v1.20.0) (2026-05-04)


### Features

* **autonomy:** Phase E auto-handover Playwright cho site không-RSS-nhưng-đẹp ([9b8e6e6](https://github.com/lth91/luot247-vision/commit/9b8e6e6a03e667c7320f17ecc7fe6c6592887e9a))

# [1.19.0](https://github.com/lth91/luot247-vision/compare/v1.18.0...v1.19.0) (2026-05-04)


### Features

* **autonomy:** chuyển Phase F digest sang daily Telegram + thêm section 24h ([f26afb0](https://github.com/lth91/luot247-vision/commit/f26afb029dd14e6362016103f499c6c6e7e8e5d6))

# [1.18.0](https://github.com/lth91/luot247-vision/compare/v1.17.1...v1.18.0) (2026-05-04)


### Features

* **electricity:** tab AI Agents trên dashboard — Phase E + Phase G ([37c0b92](https://github.com/lth91/luot247-vision/commit/37c0b920fd2a131594af2e1adade195de32de30d))

## [1.17.1](https://github.com/lth91/luot247-vision/compare/v1.17.0...v1.17.1) (2026-05-04)


### Bug Fixes

* **discovery:** decode double-encoded HTML entity + dedup tay 3 bài T&T Group ([3bef957](https://github.com/lth91/luot247-vision/commit/3bef9571b16f56ef6dc95b812532d6aefb15aa04))
* **electricity:** dashboard +5 tin mới expand + gộp banner Mac Mini ([8133fb4](https://github.com/lth91/luot247-vision/commit/8133fb4f63ac1f4db28de03b7b500f845294ef3a))

# [1.17.0](https://github.com/lth91/luot247-vision/compare/v1.16.0...v1.17.0) (2026-05-04)


### Features

* **electricity:** sparkline 7 ngày + click action item jump tới row ([1f406ac](https://github.com/lth91/luot247-vision/commit/1f406acfd6b3d959278288108bafad618bd77c48))

# [1.16.0](https://github.com/lth91/luot247-vision/compare/v1.15.2...v1.16.0) (2026-05-04)


### Features

* **electricity:** redesign /ddashboard với tabs theo crawl method ([8908e4f](https://github.com/lth91/luot247-vision/commit/8908e4f888891880ea7c647e4f0cef8a2037425b))

## [1.15.2](https://github.com/lth91/luot247-vision/compare/v1.15.1...v1.15.2) (2026-05-03)


### Bug Fixes

* **electricity:** /d dùng cùng layout list-of-rows như trang chủ ([2dd9aae](https://github.com/lth91/luot247-vision/commit/2dd9aaebf1c0ca56075af50c1842ecc6d6b99a59))

## [1.15.1](https://github.com/lth91/luot247-vision/compare/v1.15.0...v1.15.1) (2026-05-03)


### Bug Fixes

* **discovery:** bổ sung reject rules cho tin năng lượng macro/địa chính trị ([b2b07d7](https://github.com/lth91/luot247-vision/commit/b2b07d7a95cbee29a1ef7c415f09eab52af797c0))
* **electricity:** fallback parse ngày từ header DD/MM/YYYY HH:MM cho EVN ([c76875c](https://github.com/lth91/luot247-vision/commit/c76875c0e4ce6dc3bcd34c1e951ceaf0ed062a77))

# [1.15.0](https://github.com/lth91/luot247-vision/compare/v1.14.1...v1.15.0) (2026-05-03)


### Features

* **electricity:** /d chuyển về layout 1 cột giống trang chủ ([#35](https://github.com/lth91/luot247-vision/issues/35)) ([31a2860](https://github.com/lth91/luot247-vision/commit/31a28606d691d96300cc62b75782cda05f0dbce9))

## [1.14.1](https://github.com/lth91/luot247-vision/compare/v1.14.0...v1.14.1) (2026-05-03)


### Bug Fixes

* **electricity:** triple-layer guard chống tin off-topic vào /d ([#34](https://github.com/lth91/luot247-vision/issues/34)) ([f38a78e](https://github.com/lth91/luot247-vision/commit/f38a78edf25fe6ba08127d02576063c56ba0a2f9)), closes [#32](https://github.com/lth91/luot247-vision/issues/32) [#32](https://github.com/lth91/luot247-vision/issues/32)

# [1.14.0](https://github.com/lth91/luot247-vision/compare/v1.13.1...v1.14.0) (2026-05-03)


### Features

* **autonomy:** AI auto-fix selector agent (Phase G) ([#33](https://github.com/lth91/luot247-vision/issues/33)) ([66fb232](https://github.com/lth91/luot247-vision/commit/66fb2325ffce6ccff6ff799976e0a2543ca124d3))

## [1.13.1](https://github.com/lth91/luot247-vision/compare/v1.13.0...v1.13.1) (2026-05-03)


### Bug Fixes

* **electricity:** disable Tuổi Trẻ per-source (covered by RSS Discovery) ([#32](https://github.com/lth91/luot247-vision/issues/32)) ([444ef00](https://github.com/lth91/luot247-vision/commit/444ef00b719b4bf46b50ad3ab541414459feba78))

# [1.13.0](https://github.com/lth91/luot247-vision/compare/v1.12.0...v1.13.0) (2026-05-03)


### Features

* **autonomy:** weekly digest + coverage metric (Phase F) ([#31](https://github.com/lth91/luot247-vision/issues/31)) ([ec741f0](https://github.com/lth91/luot247-vision/commit/ec741f0116ed9fce8277d03dbf8f496914ee7d90))

# [1.12.0](https://github.com/lth91/luot247-vision/compare/v1.11.0...v1.12.0) (2026-05-03)


### Features

* **autonomy:** auto-discovery candidates via Google News (Phase E) ([#30](https://github.com/lth91/luot247-vision/issues/30)) ([ffae3ce](https://github.com/lth91/luot247-vision/commit/ffae3ce3b880097ee2b9965793f54fde6624b21a))

# [1.11.0](https://github.com/lth91/luot247-vision/compare/v1.10.0...v1.11.0) (2026-05-03)


### Features

* **autonomy:** source quality score + auto-cleanup (Phase D) ([#29](https://github.com/lth91/luot247-vision/issues/29)) ([3d159fd](https://github.com/lth91/luot247-vision/commit/3d159fd79a1453f39396e29af05a66b3471561f9))

# [1.10.0](https://github.com/lth91/luot247-vision/compare/v1.9.0...v1.10.0) (2026-05-03)


### Features

* **electricity:** add PV Power + Trung Nam Group sources (Phase B2) ([#27](https://github.com/lth91/luot247-vision/issues/27)) ([c032cd7](https://github.com/lth91/luot247-vision/commit/c032cd7158e4e55afa0ab95520ce3f78158f8b67)), closes [#25](https://github.com/lth91/luot247-vision/issues/25)

# [1.9.0](https://github.com/lth91/luot247-vision/compare/v1.8.0...v1.9.0) (2026-05-03)


### Features

* **discovery:** add 2 RSS feeds Báo Chính Phủ + SGGP (Phase B1) ([#26](https://github.com/lth91/luot247-vision/issues/26)) ([337de70](https://github.com/lth91/luot247-vision/commit/337de7080b84b360ae4a699a6d645f38f626ccbd))

# [1.8.0](https://github.com/lth91/luot247-vision/compare/v1.7.1...v1.8.0) (2026-05-03)


### Features

* **monitoring:** per-source Telegram events (Phase C) ([#24](https://github.com/lth91/luot247-vision/issues/24)) ([bcc616f](https://github.com/lth91/luot247-vision/commit/bcc616f6428e1d02155979450819d7506a9fed6f))

## [1.7.1](https://github.com/lth91/luot247-vision/compare/v1.7.0...v1.7.1) (2026-05-03)


### Bug Fixes

* **electricity:** sort /d feed by published time, drop tier sort ([#23](https://github.com/lth91/luot247-vision/issues/23)) ([1ff8c43](https://github.com/lth91/luot247-vision/commit/1ff8c43eb9ef54f9d54052c7ffaebebfd0da2263)), closes [#21](https://github.com/lth91/luot247-vision/issues/21)

# [1.7.0](https://github.com/lth91/luot247-vision/compare/v1.6.1...v1.7.0) (2026-05-03)


### Features

* **electricity:** content dedup via title hash (Phase 3) ([#22](https://github.com/lth91/luot247-vision/issues/22)) ([0ea513a](https://github.com/lth91/luot247-vision/commit/0ea513a71419669be6195b595ebf0b3ba1012495))

## [1.6.1](https://github.com/lth91/luot247-vision/compare/v1.6.0...v1.6.1) (2026-05-03)


### Bug Fixes

* **electricity:** remove tier badge from /d news cards ([#21](https://github.com/lth91/luot247-vision/issues/21)) ([32f308d](https://github.com/lth91/luot247-vision/commit/32f308d5a936043fcfcc40a6295a3ae730e2bd23))

# [1.6.0](https://github.com/lth91/luot247-vision/compare/v1.5.0...v1.6.0) (2026-05-03)


### Features

* **electricity:** source tier system (Phase 2) ([#20](https://github.com/lth91/luot247-vision/issues/20)) ([5f5403d](https://github.com/lth91/luot247-vision/commit/5f5403dce6d523fe2c660338315948a11bc91c50))

# [1.5.0](https://github.com/lth91/luot247-vision/compare/v1.4.0...v1.5.0) (2026-05-03)


### Features

* **discovery:** tighten RSS classifier (Phase 1) ([#19](https://github.com/lth91/luot247-vision/issues/19)) ([cb56574](https://github.com/lth91/luot247-vision/commit/cb56574e6b1eec7c71c6fa3ffaf3fa818caf8f59))

# [1.4.0](https://github.com/lth91/luot247-vision/compare/v1.3.0...v1.4.0) (2026-05-03)


### Features

* **supabase:** hardening + perf indexes + crawler 0-link fix ([#15](https://github.com/lth91/luot247-vision/issues/15)) ([6c185e9](https://github.com/lth91/luot247-vision/commit/6c185e90752adc6e6ab2dcdb127bae9f391472e0))

# [1.3.0](https://github.com/lth91/luot247-vision/compare/v1.2.0...v1.3.0) (2026-05-03)


### Bug Fixes

* add try/catch + logging for 500 debug ([#14](https://github.com/lth91/luot247-vision/issues/14)) ([3a50323](https://github.com/lth91/luot247-vision/commit/3a503230ab93139a38520183b7ea97673aa523c4))
* bỏ line-clamp-2 trên tiêu đề card tin điện ([f6a3da7](https://github.com/lth91/luot247-vision/commit/f6a3da7b39885357bff5ea541f3d037d9e55c6df))
* Correct time calculation in ViewManagement2 - Fix setHours(30) bug ([81b1c22](https://github.com/lth91/luot247-vision/commit/81b1c22837bb73994c1a7cf52d4c3ea76665a757))
* **crawl+discovery:** better extraction + skip LLM apology summaries ([cac567e](https://github.com/lth91/luot247-vision/commit/cac567e604c281937b3949983221ed462383d684))
* **crawl+discovery:** P0–P3 audit fixes from 26/04 detection rate review ([387b9c7](https://github.com/lth91/luot247-vision/commit/387b9c73fdeedf43539ead9f24597775213b5f77))
* **crawl:** increase fetch timeout from 15s to 30s ([c515b23](https://github.com/lth91/luot247-vision/commit/c515b23aa2626578aefa291913b183dbabf1240e))
* **crawl:** prevent worker resource limit crash ([52ee067](https://github.com/lth91/luot247-vision/commit/52ee067d55d172a5c31323cbe7d5ce129734d0ed))
* **crawl:** tighten regex to electricity compounds + fix Tuoi Tre URL ([8b3a7eb](https://github.com/lth91/luot247-vision/commit/8b3a7eb66be67cc158a1f9cdbe7c588a611c0ecd))
* **d:** aggregate RSS Discovery counts + add domain breakdown ([6e630d9](https://github.com/lth91/luot247-vision/commit/6e630d90d54b04f22f7092cbed15165ab588059d))
* **discovery:** decode HTML entities in RSS titles ([223d19e](https://github.com/lth91/luot247-vision/commit/223d19ef5a8d208232e4b3432b61e361b0fbb9b0)), closes [#039](https://github.com/lth91/luot247-vision/issues/039) [#NNN](https://github.com/lth91/luot247-vision/issues/NNN) [#xHH](https://github.com/lth91/luot247-vision/issues/xHH)
* **discovery:** reject digest/round-up articles mixing unrelated topics ([73cae9d](https://github.com/lth91/luot247-vision/commit/73cae9d0c8dd72b779ebe30101aa58dde4989d85))
* **discovery:** reject foreign lifestyle/cultural pieces with energy framing ([570a459](https://github.com/lth91/luot247-vision/commit/570a45951f4d19318814fdafc55d459a71c25ba7))
* **discovery:** tighten RSS classifier to reject oil/geopolitics/macro ([31f409c](https://github.com/lth91/luot247-vision/commit/31f409cb3ba61f657dd3e485f7c55b354adc2ba7))
* simplify Menu button to text only ([4824bef](https://github.com/lth91/luot247-vision/commit/4824befcc0c828be44dd07efa8d7874a13961b11))
* strict date filter with HTML meta tag parsing ([#10](https://github.com/lth91/luot247-vision/issues/10)) ([3e35624](https://github.com/lth91/luot247-vision/commit/3e3562433589896683498d89f65baec8c71c1c19))
* Sửa lỗi tin tức xuất hiện lại sau khi bấm KHÔNG DUYỆT ([381ec6b](https://github.com/lth91/luot247-vision/commit/381ec6bc0e13ae37e0ec73fb8b76c0b10e5b047a))
* Sửa lỗi tính toán weekly views không đúng ([68caef8](https://github.com/lth91/luot247-vision/commit/68caef8d3883f0d6034802b69bdcb7c92bc7ab4a))
* **summarize:** pass known published date to LLM to prevent year hallucination ([0a5043c](https://github.com/lth91/luot247-vision/commit/0a5043c3e07765054196bc7e1c09f8ebffaf8ceb))
* tăng max_tokens Claude từ 400 lên 700 để tránh cắt cụt tóm tắt ([920bfda](https://github.com/lth91/luot247-vision/commit/920bfda5982f0abe32d2102b94c9c3f74921f1ec))
* title/summary truncation + add CI auto-deploy edge functions ([#7](https://github.com/lth91/luot247-vision/issues/7)) ([ebdc777](https://github.com/lth91/luot247-vision/commit/ebdc777539ae0dc8d75de810453c2996e4908dc0))
* update flip mode label and remove shortcut hint ([00820ab](https://github.com/lth91/luot247-vision/commit/00820ab0fc9c97c8f69f6f64b95b3c729baf24f7))


### Features

* 3-day window filter + LLM date extraction ([#8](https://github.com/lth91/luot247-vision/issues/8)) ([72b9dbb](https://github.com/lth91/luot247-vision/commit/72b9dbb10accb1b759201aa47cdd980601086dbe))
* add /d electricity news AI agent ([0fb1e5f](https://github.com/lth91/luot247-vision/commit/0fb1e5f654b53f083baade82e1ad5437b24987ac))
* add /iran live dashboard for US-Iran conflict tracking ([8d59963](https://github.com/lth91/luot247-vision/commit/8d5996377e546f06d11e5b78add742acfcfaed54)), closes [hi#severity](https://github.com/hi/issues/severity)
* Add automated daily view generation ([950bae4](https://github.com/lth91/luot247-vision/commit/950bae428f024c53f872c86b8c82554149da3217))
* Add View2 system with edge function for background view tracking ([a40e9bd](https://github.com/lth91/luot247-vision/commit/a40e9bdf072fc8350b5ef87720e985747569fedb))
* **backfill:** one-off edge function to regenerate summaries ([ed410b1](https://github.com/lth91/luot247-vision/commit/ed410b10d1d9a9a6a75a2238379dc0133d363b06))
* Cải thiện UX và thống kê views ([38656d4](https://github.com/lth91/luot247-vision/commit/38656d46c4a88db99ea13033d5f12683adb96890))
* **crawl:** add 11 new electricity news sources, bump per-source limit to 15 ([be28542](https://github.com/lth91/luot247-vision/commit/be28542bd08bc2551e0dc6b0b3c57f040b75cad0))
* cron crawl every 15 minutes ([#12](https://github.com/lth91/luot247-vision/issues/12)) ([a7dfc82](https://github.com/lth91/luot247-vision/commit/a7dfc822a76df17d7cc251cf561e49709b192d90))
* **d:** add /ddashboard monitoring page, clean up /d header ([ff4b69a](https://github.com/lth91/luot247-vision/commit/ff4b69a81089146dafbf2d96247df34548a935d4))
* **discovery:** add 4 more RSS feeds (Nhân Dân, VietnamPlus, VietnamNet) ([770a00c](https://github.com/lth91/luot247-vision/commit/770a00caf0fa7c3d4bdc4ab77605a9181f109b47))
* **discovery:** add RSS-based discovery for electricity news ([acf6c79](https://github.com/lth91/luot247-vision/commit/acf6c79b9be15eb64b465262b9a3174636ba734a))
* **discovery:** support HTML list-page feeds alongside RSS ([a61f7c5](https://github.com/lth91/luot247-vision/commit/a61f7c5bedc35c7ed59863c84a6bda1bbef0fb60))
* **d:** show new articles count from last crawl batch ([5a3741d](https://github.com/lth91/luot247-vision/commit/5a3741de288433d67cd88f2293831c26129a96e3))
* edge function one-shot cleanup-electricity-news ([#11](https://github.com/lth91/luot247-vision/issues/11)) ([21d4593](https://github.com/lth91/luot247-vision/commit/21d4593cfda21ae67ac14a13df15ea120163b466))
* Fix timezone display and add show/hide read news toggle ([e7e5810](https://github.com/lth91/luot247-vision/commit/e7e581081ecd9a98384729b51d403aa27cd81831))
* **header:** tạm ẩn nút Menu trên /d (electricity news) ([de4cd92](https://github.com/lth91/luot247-vision/commit/de4cd922a15cce9ff9b2966e1099a9e0d51d10b6))
* Implement daily view count reset ([847cb01](https://github.com/lth91/luot247-vision/commit/847cb0177083ea449f2151c269d713ff76f6b4b9))
* **monitoring:** daily report 3x/ngày qua Telegram ([f9557fe](https://github.com/lth91/luot247-vision/commit/f9557feb0c87395ff400a4a2b60b7d9ec87cdf23))
* **monitoring:** Telegram health-check alert mỗi 4h ([3ff635b](https://github.com/lth91/luot247-vision/commit/3ff635bb3c1e95af1d6a552bdefcf48da73b7261))
* **sources:** add 'Mac Mini Scraper' virtual source for Playwright FK ([9a32848](https://github.com/lth91/luot247-vision/commit/9a328485526d2c60af302b16449011db3a8efaf9))
* Thêm tính năng chỉnh sửa tin tức trong trang Duyệt tin ([a93ef04](https://github.com/lth91/luot247-vision/commit/a93ef0446df6245192869878c0ada327c62baef9))
* Update viewcount system to use ViewCount2 with hidden charts ([e9a7f8f](https://github.com/lth91/luot247-vision/commit/e9a7f8f53090834c5f479fe5604b2bb64a0c99bd))


### Performance Improvements

* crawl all 27 sources per run with concurrency=5 ([#13](https://github.com/lth91/luot247-vision/issues/13)) ([e22649d](https://github.com/lth91/luot247-vision/commit/e22649d7d2577baff70cf90b95b5aa543109af0c))


### Reverts

* remove /iran dashboard ([63e5f06](https://github.com/lth91/luot247-vision/commit/63e5f06438203a518f648c545076e0862d3b4aba))
