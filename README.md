# Threads Bot: săn bài viral tips đời sống → viết lại kèm link Shopee

Bot tự tìm các bài **tips/mẹo đời sống đang viral** trên Threads, để AI viết một bài **tương tự bằng giọng của bạn** (không chép). **Tuỳ chọn:** bật "Gắn link sản phẩm" trong Cài đặt để AI chọn **sản phẩm Shopee** phù hợp trong kho và gắn link tiếp thị liên kết khi đăng. Tắt đi thì bot chỉ săn viral và viết lại bài (tab Sản phẩm sẽ ẩn).

## Luồng hoạt động

```
Quét Apify / keyword_search ──► chấm điểm viral ──► AI lọc "có phải tips?" + gợi ý loại sản phẩm
        ▲ mỗi 2 giờ                                         │
        │                                                   ▼
   Cài đặt từ khoá              Bạn bấm "Viết bài tương tự" (hoặc bot tự viết N bài/ngày)
                                                            │
                                                            ▼
                         AI viết lại + chọn sản phẩm trong kho ──► Nháp trong Hàng đợi
                                                            │ bạn duyệt / sửa
                                                            ▼
                         Đăng bài + link Shopee (ở reply đầu tiên hoặc cuối bài)
```

**Điểm viral** được tính trong Postgres (`rescore_viral_posts`). Threads API không trả số like của bài người khác, nên điểm dựa trên các tín hiệu có được:
- số lần bài xuất hiện trong kết quả `TOP` qua các lần quét (bài nổi bền vững),
- thứ hạng tốt nhất trong kết quả `TOP`,
- bài có thảo luận (`has_replies`),
- chất lượng do AI chấm (1–10),
- độ mới (giảm dần theo thời gian, nửa đời khoảng 2 ngày),
- bài AI xác nhận *không phải tips* bị giảm còn 30% điểm.

**Học giọng văn của bạn:** Cài đặt → AI → "Phân tích từ bài đã đăng". AI đọc tối đa 50 bài + 30 reply bạn đã viết (bỏ qua bài do bot đăng), tóm tắt phong cách (xưng hô, độ dài câu, emoji, cách mở/kết bài…), đề xuất persona + hướng dẫn viết và chọn 3–5 bài mẫu. Bạn chọn phần muốn áp dụng rồi Lưu. Bài mẫu được đưa vào mọi prompt (viết lại viral, viết theo chủ đề, trả lời) với yêu cầu bắt chước giọng, không lặp nội dung.

**Cấu hình:** `.env` chỉ chứa key/kết nối. Mọi thứ khác (model AI, persona, chủ đề, từ khoá, lịch cron, múi giờ, topic tag…) chỉnh trong trang Cài đặt, lưu ở bảng `kv` của Supabase, có hiệu lực từ phút kế tiếp.

**Các tính năng khác** vẫn có: tự trả lời reply/mention, đăng bài theo chủ đề (mặc định tắt), insights, nhật ký.

## Dashboard

| Trang | Dùng để |
|---|---|
| Săn viral | Danh sách bài viral xếp theo điểm, kết quả AI lọc, nút **Viết bài tương tự** (chọn sản phẩm hoặc để AI chọn, thêm yêu cầu riêng) |
| Sản phẩm *(tuỳ chọn)* | Kho link affiliate: tên, link, từ khoá (giúp AI ghép đúng mẹo), giá, ghi chú; bật/tắt từng sản phẩm. Khi viết bài luôn có lựa chọn "Không gắn sản phẩm" |
| Insights | Biểu đồ ECharts: xu hướng tài khoản 30 ngày (lượt xem, người theo dõi) và tương tác từng bài (thích/reply/repost/quote + lượt xem) |
| Hàng đợi | Duyệt nháp, sửa nội dung, đổi sản phẩm, câu giới thiệu, cách gắn link, hẹn giờ |
| Soạn bài | Tự viết bài, gắn sản phẩm thủ công |
| Cài đặt | Chia tab: **AI** (chọn model viết bài / model phân loại + nút Kiểm tra, persona, hướng dẫn viết, **phân tích giọng văn** từ bài đã đăng), **Săn viral** (từ khoá, lịch, số bài mỗi từ khoá, tự viết nháp), **Đăng bài** (topic tag, ai được reply, chủ đề), **Trả lời**, **Sản phẩm** (bật/tắt, cách gắn link, subId Shopee), **Chung** (múi giờ, khôi phục mặc định) |

## Cấu trúc

```
src/
  app/
    (dashboard)/        # Các trang UI: /, /compose, /queue, /engage, /insights, /watch, /settings, /logs
    api/                # REST API cho dashboard (cần cookie admin)
      webhook/          # Webhook Threads (kiểm tra chữ ký X-Hub-Signature-256)
      cron/[job]/       # Endpoint cho cron: tick, insights, mentions, refresh-token, watch, cleanup...
    auth/login|callback # OAuth Threads
  components/
    ui/                 # shadcn/ui (button, card, dialog, drawer, select, switch, toggle-group, sonner…)
    ui.tsx, Shell.tsx   # Component nghiệp vụ + khung app (header, thanh tab dưới, menu "Thêm")
    EChart.tsx          # Wrapper ECharts (tree-shaking, tự resize, màu theo dark mode, tooltip chạm được)
    charts.tsx          # Các biểu đồ: lượt xem theo bài, tương tác theo bài, xu hướng tài khoản
  lib/                  # Logic bot: threadsClient, ai, queue, jobs, replyHandler, settings, db (Supabase)...
  instrumentation.ts    # Chạy job nền trong tiến trình khi self-host
supabase/
  migrations/0001_init.sql  # Schema
  cron.sql                  # Lịch pg_cron gọi /api/cron/*
```

## Cài đặt

### 1. Supabase
1. Tạo project trên [supabase.com](https://supabase.com).
2. Mở **SQL Editor** và chạy `supabase/migrations/0001_init.sql`.
3. Lấy `Project URL` và `service_role` key ở **Project Settings > API**.

### 2. Threads app (Meta for Developers)
1. Tạo app tại developers.facebook.com, chọn use case **Access the Threads API**.
2. Thêm các quyền: `threads_basic`, `threads_content_publish`, `threads_read_replies`, `threads_manage_replies`, `threads_manage_insights`, `threads_manage_mentions`, `threads_keyword_search`.
   **Quan trọng:** khi chưa có advanced access cho `threads_keyword_search`, kết quả tìm kiếm chỉ gồm bài của chính bạn. Cá nhân (không có xác minh doanh nghiệp) nên dùng nguồn quét **Apify** — xem mục "Săn viral không cần App Review".
3. **Redirect Callback URLs**: `https://<domain>/auth/callback` (khi chạy local thì dùng URL ngrok hoặc cloudflared, vì Meta yêu cầu HTTPS).
4. Thêm tài khoản Threads của bạn làm **Threads Tester**, rồi chấp nhận lời mời trong app Threads (Settings > Account > Website permissions).
5. Webhooks: Callback URL `https://<domain>/api/webhook`, Verify token = `WEBHOOK_VERIFY_TOKEN`, subscribe các field `replies` và `mentions`. Lưu ý webhook yêu cầu business đã xác minh (verified).

Trong lúc chưa qua App Review, bot chỉ đăng được lên tài khoản tester và chỉ thấy mention từ tester. Muốn chạy với người dùng thật thì cần submit App Review.

### 3. Shopee Affiliate
- Cách đơn giản: lấy link affiliate trong trang Shopee Affiliate rồi dán vào trang **Sản phẩm**.
- Cách tự động (tuỳ chọn): nếu tài khoản affiliate đã được cấp Open API, điền `SHOPEE_AFFILIATE_APP_ID` và `SHOPEE_AFFILIATE_SECRET`. Khi đó chỉ cần dán link Shopee gốc, bot tự gọi `generateShortLink` để tạo link affiliate (subId `threads`). Endpoint mặc định là `open-api.affiliate.shopee.vn/graphql`; hãy kiểm tra lại endpoint trong trang Open API của bạn.

### 4. Chạy local
```bash
npm install
cp .env.example .env.local   # điền các giá trị
npm run dev                  # http://localhost:3000
```
Mở dashboard, bấm **Đăng nhập bằng Threads**: vừa đăng nhập vừa kết nối bot với tài khoản đó.
Threads bắt buộc redirect URL là HTTPS, nên khi chạy local hãy dùng tunnel (`npx cloudflared tunnel --url http://localhost:3000` hoặc ngrok) và khai báo URL `https://…/auth/callback` trong app; hoặc đặt `ADMIN_KEY` để vào bằng mật khẩu dự phòng.

**Ai được vào dashboard?**
- Đặt `ALLOWED_THREADS_USERS=ten_cua_ban` → chỉ các username này.
- Để trống → tài khoản đăng nhập **đầu tiên** trở thành chủ (lưu ở bảng `kv`, key `dashboard_owner`); người khác đăng nhập Threads thành công vẫn bị chặn. Muốn đổi chủ: xoá dòng `dashboard_owner` trong bảng `kv` hoặc đặt `ALLOWED_THREADS_USERS`.
- Phiên đăng nhập là cookie httpOnly ký HMAC, 30 ngày. Đổi `SESSION_SECRET` để đăng xuất mọi thiết bị.

### 5. Deploy lên Vercel
1. Push code lên GitHub rồi import vào Vercel.
2. Khai báo toàn bộ biến trong `.env.example` (để `IN_PROCESS_JOBS=false`).
3. Lên lịch job: trong Supabase bật extension **pg_cron** và **pg_net**, sửa URL và secret ở đầu `supabase/cron.sql`, rồi chạy file đó trong SQL Editor. Job `tick` chạy mỗi phút để đăng bài đến giờ, đồng thời chạy auto-post và quét từ khóa theo cron trong Cài đặt.

Vercel Hobby chỉ cho Vercel Cron chạy 1 lần/ngày, nên dùng pg_cron như trên là cách miễn phí để chạy mỗi phút.

### Self-host (VPS / Railway / Render)
```bash
npm run build
IN_PROCESS_JOBS=true npm start
```
Job chạy luôn trong tiến trình, không cần `cron.sql`.

## Săn viral không cần App Review (Apify)

Meta chỉ cho tìm bài công khai khi app đã qua App Review, thường kèm xác minh doanh nghiệp. Nếu bạn làm cá nhân:

1. Tạo tài khoản tại apify.com → **Settings → API & Integrations** → copy *Personal API token*.
2. Thêm vào `.env.local` (hoặc Vercel): `APIFY_TOKEN=...` rồi khởi động lại app.
3. Chạy `supabase/migrations/0002_viral_engagement.sql` trong SQL Editor (lưu lượt like/reply/repost để chấm điểm).
4. Dashboard → **Cài đặt → Săn viral** → *Lấy bài viral từ* = **Apify**. Chỉnh số bài mỗi từ khoá, lịch quét và **ngân sách tháng**.

- Actor mặc định: `webdata_labs/threads-scraper` (không cần đăng nhập Threads, không thu phí mỗi lần chạy, ~$3/1.000 bài ở gói Free). Mọi từ khoá được gộp vào **1 lần chạy**.
- Ví dụ 7 từ khoá × 3 bài × 4 lần/ngày ≈ 2.500 bài/tháng ≈ **$7.5/tháng**. Trang Cài đặt hiện ước tính theo lịch và chi phí đã dùng trong tháng; vượt ngân sách thì bot tự dừng quét đến tháng sau.
- Bot chỉ **đọc** bài công khai qua Apify; đăng bài, trả lời, thống kê vẫn dùng API chính thức của Threads, nên tài khoản của bạn không bị ảnh hưởng.
- Scrape là vùng xám so với điều khoản của Meta và có thể chập chờn khi Threads đổi giao diện. Có thể đổi sang actor khác trong Cài đặt (kèm mẫu input JSON với biến `{{keywords}}`, `{{maxPosts}}`, `{{postedAfter}}`).
- Quét theo lịch qua Apify chạy nền (1–3 phút), nên không bị timeout 55 giây của pg_net.

## Săn viral miễn phí bằng scraper trên máy bạn

Thay cho Apify: một tiến trình nhỏ (`scraper/`) mở trang profile công khai của các **tài khoản nguồn** bằng Chromium headless
(Playwright), đọc bài mới cùng lượt like/reply/repost, rồi ghi thẳng vào bảng `viral_posts`. App lo phần còn lại
(AI phân loại, chấm điểm, tự viết nháp) như các nguồn khác. Không cần quyền Meta, không đăng nhập Threads, không tốn phí.

1. Chạy `supabase/migrations/0002_viral_engagement.sql` (nếu chưa chạy).
2. Cài trình duyệt cho scraper (1 lần): `npm install` rồi `npx playwright install chromium`.
3. Dashboard → **Cài đặt → Săn viral** → *Lấy bài viral từ* = **Scraper trên máy bạn**, thêm 30–100 tài khoản chuyên đăng tips, lưu.
   Bật *Tìm thêm theo từ khoá* nếu muốn scraper tìm cả theo từ khoá (tab Hàng đầu của trang tìm kiếm Threads). Threads thường bắt đăng nhập để tìm kiếm: chạy `npm run scraper:login` và đăng nhập **bằng acc phụ** (không phải acc bot). Cookie lưu ở `scraper/.auth.json` (đã gitignore) và chỉ dùng cho trang tìm kiếm; đọc profile vẫn ẩn danh. Acc phụ có thể bị khoá — đừng dùng acc chính.
4. Thử (không ghi DB): `npm run scraper:test -- ten_tai_khoan`, hoặc thử tìm kiếm: `npm run scraper:test -- "mẹo vặt" --search`.
5. Chạy thật: `npm run scraper` (để cửa sổ terminal mở, tự quét theo chu kỳ trong Cài đặt). Hoặc `npm run scraper:once` với Task Scheduler.

- Scraper dùng chung `SUPABASE_URL` / `SUPABASE_SECRET_KEY` trong `.env.local`. Tuỳ chọn: `SCRAPER_HEADLESS=false` để xem cửa sổ Chrome, `SCRAPER_PROXY=http://user:pass@host:port` nếu bị chặn IP.
- Nên chạy trên **máy nhà** (IP dân cư). Vercel/VPS dùng IP datacenter, Threads chặn mạnh hơn.
- App cho AI phân loại bài mới mỗi 5 phút (job `tick`), và theo lịch quét viral như bình thường. Trang Săn viral hiện trạng thái lượt quét gần nhất.
- An toàn: giãn 6–14 giây giữa các tài khoản; 3 tài khoản liên tiếp lỗi thì dừng lượt đó và nghỉ gấp đôi. Không tải ảnh/video để tiết kiệm băng thông.
- Scraper đọc dữ liệu theo "hình dạng" bài đăng trong JSON của trang, không phụ thuộc cấu trúc HTML; nếu Threads đổi giao diện mà `scraper:test` báo 0 bài thì cần cập nhật `scraper/extract.mjs`. Scrape là vùng xám so với điều khoản của Meta.

## Meta App Review (để săn được bài công khai bằng API chính thức)

Khi chưa được duyệt quyền `threads_keyword_search`, Threads chỉ cho tìm trong bài của chính bạn → trang Săn viral
sẽ hiện cảnh báo; trong lúc chờ, dùng nút **Thêm thủ công** (dán link/nội dung bài).
Hướng dẫn nộp duyệt, mô tả quyền soạn sẵn và kịch bản video: [`docs/meta-app-review.md`](docs/meta-app-review.md).

Các URL công khai cần khai báo với Meta:

| Mục | URL |
|---|---|
| Privacy Policy | `https://<domain>/privacy` |
| Data deletion instructions | `https://<domain>/data-deletion` |
| Uninstall callback | `https://<domain>/api/threads/uninstall` |
| Remove/delete callback | `https://<domain>/api/threads/delete` |

## API cron

Mọi job đều gọi được thủ công:
```bash
curl -X POST https://<domain>/api/cron/tick -H "Authorization: Bearer $CRON_SECRET"
```
Danh sách job: `tick`, `viral`, `process-queue`, `auto-post`, `insights`, `mentions`, `refresh-token`, `cleanup`.

## Ghi chú

- Token Threads dài hạn có hạn 60 ngày. Job `refresh-token` tự gia hạn khi token còn dưới 7 ngày.
- Threads giới hạn 250 bài và 1000 reply mỗi 24 giờ. Dashboard hiển thị hạn mức đã dùng.
- Keyword search giới hạn 2.200 truy vấn mỗi 24 giờ cho mỗi tài khoản. Mặc định 7 từ khoá × 12 lần/ngày ≈ 84 truy vấn.
- Mỗi bài tối đa 5 link. `link_attachment` (thẻ xem trước) chỉ dùng được cho bài chữ.
- Giới hạn ký tự của Threads tính emoji theo số byte UTF-8. Bot và bộ đếm trên dashboard đều tính theo cách này.
- **Nội dung:** prompt bắt AI viết lại hoàn toàn và không nhắc tên tác giả gốc. Dù vậy bạn vẫn nên đọc lại trước khi duyệt, vì đăng lại gần như nguyên văn bài người khác dễ bị báo cáo, và tài khoản đăng nhiều link affiliate với tần suất cao dễ bị Threads coi là spam. Mặc định bài từ viral luôn là nháp và có giới hạn 3 bài/ngày.
- Mọi bảng đều bật RLS và không có policy, nên chỉ `service_role` (dùng ở server) truy cập được.
- Muốn thêm component shadcn: `npx shadcn@latest add <tên>` (cấu hình sẵn trong `components.json`).
- Muốn thay dashboard bằng frontend khác (ví dụ Angular), chỉ cần gọi các route trong `src/app/api/*`.
