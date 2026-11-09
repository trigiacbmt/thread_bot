-- Lượt tương tác lấy từ nguồn scrape (Apify) → đưa vào điểm viral.
-- Chạy file này trong Supabase → SQL Editor (sau 0001_init.sql). Chạy lại nhiều lần không sao.
alter table viral_posts add column if not exists like_count integer not null default 0;
alter table viral_posts add column if not exists reply_count integer not null default 0;
alter table viral_posts add column if not exists repost_count integer not null default 0;

create or replace function rescore_viral_posts()
returns void
language sql
as $$
  update viral_posts set score = round(((
      least(seen_count, 10) * 10
    + greatest(0, 25 - best_rank) * 2
    + case when has_replies or reply_count > 0 then 8 else 0 end
    + coalesce(ai_quality, 5) * 3
    -- tương tác thật (nếu có): thang log, tối đa +40
    + least(40, ln(1 + like_count) * 4 + ln(1 + reply_count) * 5 + ln(1 + repost_count) * 5)
  ) * exp(- greatest(0, extract(epoch from (now() - coalesce(posted_at, found_at))) / 3600) / 72)
    * case when is_tip = false then 0.3 else 1 end
  )::numeric, 1)
  where status = 'new';
$$;
