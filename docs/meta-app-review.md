# Hồ sơ Meta App Review — Threads Bot

> **Làm cá nhân, không có xác minh doanh nghiệp?** Advanced access cho `threads_keyword_search` thường yêu cầu
> business verification, nên khả năng cao không được duyệt. Không cần nộp App Review: chuyển nguồn quét sang
> **Apify** (xem README → "Săn viral không cần App Review"). Mọi tính năng khác (đăng bài, trả lời, insights,
> phân tích giọng văn) đã chạy được với tư cách Threads Tester của chính app.

Mục tiêu: được duyệt quyền **`threads_keyword_search`** để tính năng *Săn viral* tìm được **bài công khai**
(khi chưa duyệt, Threads chỉ cho tìm trong bài của chính bạn).

> Vì chỉ một mình bạn (tài khoản đã là **Threads Tester**) dùng app, các quyền khác (đăng bài, reply, insights…)
> **đã dùng được** ở chế độ thử nghiệm. Chỉ cần xin duyệt những quyền thật sự cần mở rộng — xin càng ít, càng dễ qua.

---

## 0. Checklist trước khi nộp

| Việc | Ở đâu | Ghi chú |
|---|---|---|
| Deploy app lên URL HTTPS cố định | Vercel | Không dùng URL `trycloudflare.com` (đổi mỗi lần chạy) |
| Biểu tượng app 1024×1024 | App settings → Basic | |
| **Privacy Policy URL** | App settings → Basic | `https://<domain>/privacy` |
| **User data deletion** | App settings → Basic | Chọn *Data deletion instructions URL*: `https://<domain>/data-deletion` |
| **Uninstall callback URL** | Use cases → Threads API → Settings | `https://<domain>/api/threads/uninstall` |
| **Remove (delete) callback URL** | Use cases → Threads API → Settings | `https://<domain>/api/threads/delete` |
| Danh mục app, email liên hệ | App settings → Basic | Đặt `CONTACT_EMAIL` trong env để hiện trên trang Privacy |
| **Xác minh doanh nghiệp** | Meta Business Settings → Security Center | Thường bắt buộc khi xin Advanced Access |
| Đã có lệnh gọi API thành công | Bảng quyền (cột số lượt gọi) | Bấm *Quét ngay* vài lần; có thể mất ~24h mới cập nhật |
| Tài khoản cho người duyệt đăng nhập | env `ADMIN_KEY` | Xem mục 4 |

---

## 1. Quyền cần xin

| Quyền | Có cần xin không | Lý do |
|---|---|---|
| `threads_keyword_search` | **Có** | Bắt buộc để tìm bài công khai |
| `threads_basic` | Có (thường bắt buộc đi kèm) | Mọi API đều cần |
| `threads_content_publish`, `threads_read_replies`, `threads_manage_replies`, `threads_manage_insights`, `threads_manage_mentions` | Không bắt buộc | Tester đã dùng được; chỉ xin nếu muốn cho tài khoản khác dùng app |

---

## 2. Mô tả cho từng quyền (dán vào form — tiếng Anh)

Viết đúng sự thật về cách app hoạt động. Không mô tả app là "repost/copy" — app **không đăng lại** bài người khác,
mà dùng bài nổi để chủ tài khoản nghiên cứu chủ đề và tự viết nội dung **mới**.

### `threads_keyword_search`

> **How will this app use threads_keyword_search?**
>
> Threads Bot is a personal content-management dashboard used by a single Threads creator to manage their own account,
> which shares practical everyday-life tips (home, cooking, saving money).
>
> The app calls the keyword search endpoint with `search_type=TOP` for a small set of keywords configured by the account
> owner (for example "life hacks", "cooking tips", "cleaning tips"), a few times per day. The results are shown on a
> private "Trending" page so the owner can see which tip topics are currently popular in their niche.
>
> From that page the owner can (1) open the original post on Threads, (2) reply to it through the API, or (3) ask the
> app's AI assistant to draft a brand-new, original post on the same topic in the owner's own writing style. Drafts are
> never copies: the AI is instructed not to reuse wording or structure and not to mention the original author, and every
> draft is reviewed and edited by the owner before publishing.
>
> Search results are stored only to rank topics (text, username, permalink, timestamp) and are automatically deleted
> after 30 days if unused. The data is not shared with third parties, not sold, and not used for advertising.
> Search volume stays well below the documented limits (about 7 keywords × 12 times per day).

### `threads_basic`

> The app uses threads_basic to identify the connected account (ID and username) after Threads Login, to restrict
> dashboard access to that account, and to read the owner's own posts so the dashboard can show what has been
> published and analyze the owner's writing style for AI drafting.

### (Tuỳ chọn) `threads_content_publish`

> The owner writes or approves posts in the dashboard and publishes them immediately or at a scheduled time.
> The app only publishes to the authenticated owner's own profile, with Threads' publishing limits respected.

### (Tuỳ chọn) `threads_read_replies` + `threads_manage_replies`

> The app lists replies to the owner's posts so the owner can answer them from the dashboard, optionally with an
> AI-suggested reply, and hide spam replies. An optional auto-reply mode sends short replies on the owner's own posts,
> limited per hour and skipping spam.

### (Tuỳ chọn) `threads_manage_insights`

> The app shows the owner's account and post metrics (views, likes, replies, reposts, quotes, followers) as charts
> so the owner can see which topics perform best.

### (Tuỳ chọn) `threads_manage_mentions`

> The app shows posts that mention the owner so the owner can reply from the dashboard.

---

## 3. Kịch bản video quay màn hình (1–3 phút)

Quay trên app **đã deploy** (URL thật). Bật phụ đề/chú thích tiếng Anh ngắn ở mỗi bước.

1. Mở `https://<domain>` → màn hình đăng nhập → bấm **Đăng nhập bằng Threads**.
2. Trang uỷ quyền của Threads hiện danh sách quyền → **Allow**. (Cho thấy rõ màn hình xin quyền.)
3. Quay về dashboard, thấy username đã kết nối.
4. Vào **Cài đặt → Săn viral**: cho thấy danh sách từ khoá ("life hacks"…).
5. Vào **Săn viral** → bấm **Quét ngay** → danh sách bài công khai nổi bật hiện ra, có điểm, có link mở bài gốc.
   *(Với `threads_keyword_search`, đây là bước quan trọng nhất.)*
6. Bấm **Viết bài tương tự** → AI tạo bản nháp **khác hẳn** bài gốc → mở **Hàng đợi**, sửa nháp → **Duyệt**.
7. (Nếu xin `content_publish`) bấm **Đăng ngay** → mở Threads cho thấy bài đã lên trên trang cá nhân.
8. (Nếu xin replies) vào **Tương tác** → trả lời một reply.
9. (Nếu xin insights) vào **Insights** → biểu đồ.
10. Mở `/privacy` và `/data-deletion` trong vài giây.

> Lưu ý: ở bước 5, nếu chưa được duyệt thì kết quả sẽ trống — Meta hiểu điều này. Hãy nói rõ trong video:
> *"Before approval, the endpoint only returns the owner's own posts; after approval, this list shows public posts."*
> Banner vàng trên trang Săn viral hiện "Threads trả về N bài, N là bài của bạn" — dùng nó để chứng minh app đã gọi
> đúng endpoint (đăng trước 1 bài của chính bạn có chứa từ khoá để N > 0).

---

## 4. Hướng dẫn cho người duyệt (Testing instructions)

Người duyệt **không** đăng nhập được bằng Threads của họ vì dashboard chỉ cho chủ tài khoản. Cách xử lý:

- Đặt một `ADMIN_KEY` **riêng cho đợt duyệt** trên Vercel, ghi vào ô testing instructions:

> The dashboard is private to the account owner. To review it, open https://<domain>, choose
> "Dùng admin key dự phòng" (Use backup admin key) on the login screen and enter: `<ADMIN_KEY>`.
> The dashboard is in Vietnamese; the main pages are: "Săn viral" (Trending search), "Hàng đợi" (Drafts queue),
> "Tương tác" (Replies), "Insights", "Cài đặt" (Settings). The demo video shows the full Threads Login flow
> with the owner's account.

- Duyệt xong thì **đổi `ADMIN_KEY`** (hoặc xoá để tắt cách đăng nhập này).

---

## 5. Sau khi được duyệt

- Không cần sửa code. Bấm **Quét ngay** — banner cảnh báo trên trang Săn viral sẽ biến mất khi có bài công khai.
- Nếu bị từ chối: đọc kỹ lý do, thường là (a) video không cho thấy rõ quyền được dùng ở đâu, (b) mô tả chung chung,
  (c) thiếu Privacy/Data deletion, (d) chưa xác minh doanh nghiệp. Sửa đúng điểm đó rồi nộp lại.
