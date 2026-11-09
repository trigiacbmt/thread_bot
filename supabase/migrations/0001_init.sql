-- Threads bot — schema khởi tạo
-- Chạy trong Supabase Dashboard > SQL Editor (hoặc `supabase db push`).
-- App chỉ truy cập bằng service_role key ở server, nên bật RLS và KHÔNG tạo policy
-- → anon/authenticated key không đọc/ghi được gì.

-- Token Threads (một dòng duy nhất, id = 1)
create table if not exists threads_token (
  id            int primary key default 1 check (id = 1),
  access_token  text not null,
  user_id       text not null,
  username      text,
  expires_at    timestamptz not null,
  obtained_at   timestamptz not null default now()
);

-- Key/value: settings, topic_index...
create table if not exists kv (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- Kho sản phẩm Shopee (link tiếp thị liên kết)
create table if not exists products (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  affiliate_url text not null,
  original_url  text,
  keywords      text[] not null default '{}',
  note          text,
  price         text,
  active        boolean not null default true,
  used_count    int not null default 0,
  created_at    timestamptz not null default now()
);

-- Hàng đợi bài đăng
create table if not exists queue_items (
  id           uuid primary key default gen_random_uuid(),
  text         text not null,
  image_url    text,
  topic        text,
  source       text not null check (source in ('manual', 'ai', 'viral')),
  status       text not null check (status in ('draft', 'scheduled', 'publishing', 'posted', 'failed')),
  scheduled_at timestamptz,
  created_at   timestamptz not null default now(),
  posted_at    timestamptz,
  post_id      text,
  error        text,
  -- Bài viral làm nguồn cảm hứng + sản phẩm gắn kèm
  inspired_by  text,
  product_id   uuid references products(id) on delete set null,
  product_line text,
  link_mode    text not null default 'reply' check (link_mode in ('reply', 'inline', 'none')),
  reply_post_id text
);
create index if not exists queue_items_due_idx on queue_items (status, scheduled_at);

-- Nhật ký hoạt động
create table if not exists activity (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  type    text not null,
  message text not null,
  data    jsonb
);
create index if not exists activity_at_idx on activity (at desc);
create index if not exists activity_type_at_idx on activity (type, at desc);

-- ID reply/mention đã xử lý (chống trả lời trùng khi webhook gửi lại)
create table if not exists seen_ids (
  id text primary key,
  at timestamptz not null default now()
);

-- Ảnh chụp insights (giữ lịch sử để vẽ biểu đồ sau này)
create table if not exists insights_snapshots (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  account jsonb not null,
  posts   jsonb not null
);
create index if not exists insights_at_idx on insights_snapshots (at desc);

-- Bài viral tìm được qua keyword search (search_type = TOP)
create table if not exists viral_posts (
  id            text primary key,
  keyword       text not null,
  text          text,
  username      text,
  permalink     text,
  media_type    text,
  has_replies   boolean not null default false,
  posted_at     timestamptz,
  found_at      timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  seen_count    int not null default 1,       -- số lần xuất hiện trong kết quả TOP qua các lần quét
  best_rank     int not null default 99,      -- thứ hạng tốt nhất (0 = đứng đầu)
  score         numeric not null default 0,   -- điểm viral tính từ các tín hiệu trên
  ai_checked    boolean not null default false,
  is_tip        boolean,                      -- AI: có phải bài chia sẻ tips đời sống không
  ai_quality    int,                          -- AI: 1-10, độ hữu ích / khả năng lan toả
  ai_reason     text,
  ai_product_keywords text[],                 -- AI: loại sản phẩm phù hợp để gợi ý
  status        text not null default 'new' check (status in ('new', 'used', 'dismissed'))
);
create index if not exists viral_posts_rank_idx on viral_posts (status, score desc);

alter table threads_token      enable row level security;
alter table kv                 enable row level security;
alter table queue_items        enable row level security;
alter table activity           enable row level security;
alter table seen_ids           enable row level security;
alter table insights_snapshots enable row level security;
alter table viral_posts        enable row level security;
alter table products           enable row level security;

-- Nhận 1 bài "scheduled" đã đến giờ một cách nguyên tử (tránh 2 lần cron cùng đăng 1 bài)
create or replace function claim_due_queue_item()
returns setof queue_items
language sql
as $$
  update queue_items
     set status = 'publishing'
   where id = (
     select id from queue_items
      where status = 'scheduled'
        and (scheduled_at is null or scheduled_at <= now())
      order by coalesce(scheduled_at, created_at)
      limit 1
      for update skip locked
   )
  returning *;
$$;

-- Dọn dữ liệu cũ (gọi định kỳ từ cron)
create or replace function cleanup_old_rows()
returns void
language sql
as $$
  delete from activity           where at < now() - interval '90 days';
  delete from seen_ids           where at < now() - interval '30 days';
  delete from insights_snapshots where at < now() - interval '180 days';
  delete from viral_posts        where status <> 'used' and last_seen_at < now() - interval '30 days';
$$;

-- Ghi nhận một lượt xuất hiện của bài trong kết quả TOP (upsert + cộng dồn tín hiệu)
create or replace function upsert_viral_hit(
  p_id text, p_keyword text, p_text text, p_username text, p_permalink text,
  p_media_type text, p_has_replies boolean, p_posted_at timestamptz, p_rank int
) returns boolean   -- true nếu là bài mới
language plpgsql
as $$
declare
  inserted boolean;
begin
  insert into viral_posts (id, keyword, text, username, permalink, media_type, has_replies, posted_at, best_rank)
  values (p_id, p_keyword, p_text, p_username, p_permalink, p_media_type, coalesce(p_has_replies, false), p_posted_at, p_rank)
  on conflict (id) do update set
    seen_count   = viral_posts.seen_count + case when viral_posts.last_seen_at < now() - interval '30 minutes' then 1 else 0 end,
    last_seen_at = now(),
    best_rank    = least(viral_posts.best_rank, excluded.best_rank),
    has_replies  = viral_posts.has_replies or excluded.has_replies
  returning (xmax = 0) into inserted;
  return inserted;
end;
$$;

-- Tính lại điểm viral: xuất hiện nhiều lần + thứ hạng cao + có thảo luận + còn mới
create or replace function rescore_viral_posts()
returns void
language sql
as $$
  update viral_posts set score = round(((
      least(seen_count, 10) * 10
    + greatest(0, 25 - best_rank) * 2
    + case when has_replies then 8 else 0 end
    + coalesce(ai_quality, 5) * 3
  ) * exp(- greatest(0, extract(epoch from (now() - coalesce(posted_at, found_at))) / 3600) / 72)
    * case when is_tip = false then 0.3 else 1 end   -- AI xác nhận không phải tips → giảm mạnh
  )::numeric, 1)
  where status = 'new';
$$;
