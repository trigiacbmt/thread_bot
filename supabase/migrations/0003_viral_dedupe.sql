-- Chống lấy trùng bài viral + bỏ ngưỡng like/bình luận/chia sẻ.
-- Một bài coi là TRÙNG nếu: cùng id, HOẶC cùng mã bài Threads (dù lấy từ Apify / scraper / thêm tay),
-- HOẶC cùng nội dung (bỏ khoảng trắng, dấu câu, hoa/thường — bắt được bài bị người khác đăng lại y nguyên).
-- Chạy trong Supabase → SQL Editor (sau 0001, 0002). Chạy lại nhiều lần không sao.

alter table viral_posts add column if not exists post_code text;
alter table viral_posts add column if not exists text_hash text;
create index if not exists viral_posts_code_idx on viral_posts (post_code) where post_code is not null;
create index if not exists viral_posts_hash_idx on viral_posts (text_hash) where text_hash is not null;

create or replace function viral_post_code(p_id text)
returns text language sql immutable as $$
  select case
    when p_id ~ '^(ap|sc)-' then substring(p_id from 4)
    when p_id ~ '^manual-' and length(p_id) <= 30 then substring(p_id from 8)  -- manual-<shortcode>, bỏ manual-<sha1>
    else null end;
$$;

create or replace function viral_text_hash(p_text text)
returns text language sql immutable as $$
  select case when length(n) >= 20 then md5(left(n, 400)) end
  from (select lower(regexp_replace(coalesce(p_text, ''), '[[:space:][:punct:]]+', '', 'g')) as n) x;
$$;

create or replace function viral_posts_fingerprint()
returns trigger language plpgsql as $$
begin
  new.post_code := viral_post_code(new.id);
  new.text_hash := viral_text_hash(new.text);
  return new;
end;
$$;
drop trigger if exists viral_posts_fingerprint on viral_posts;
create trigger viral_posts_fingerprint before insert or update of id, text on viral_posts
  for each row execute function viral_posts_fingerprint();

-- Đã bỏ ngưỡng like/bình luận/chia sẻ → trả lại các bài từng bị loại vì lý do đó (AI sẽ phân loại lại)
update viral_posts set status = 'new', ai_checked = false, ai_reason = null
  where status = 'dismissed' and (ai_reason like 'Chưa đủ viral%' or ai_reason like 'Dưới % lượt thích');

-- Tính dấu vân tay cho bài cũ
update viral_posts set post_code = viral_post_code(id), text_hash = viral_text_hash(text)
  where post_code is distinct from viral_post_code(id) or text_hash is distinct from viral_text_hash(text);

/** Ghi 1 lượt thấy bài. Nếu đã có bài trùng (id / mã bài / nội dung) thì chỉ cập nhật bài cũ — giữ nguyên trạng thái
    (đã viết lại / đã bỏ qua) nên bài cũ không quay lại danh sách. Trả về { id: id bài trong DB, is_new }. */
create or replace function upsert_viral_post(
  p_id text, p_keyword text, p_text text, p_username text, p_permalink text,
  p_media_type text, p_has_replies boolean, p_posted_at timestamptz, p_rank int,
  p_likes int default null, p_replies int default null, p_reposts int default null
) returns jsonb
language plpgsql as $$
declare
  existing text;
  v_code text := viral_post_code(p_id);
  v_hash text := viral_text_hash(p_text);
begin
  select id into existing from viral_posts
   where id = p_id
      or (v_code is not null and post_code = v_code)
      or (v_hash is not null and text_hash = v_hash)
   order by (id = p_id) desc, found_at
   limit 1;

  if existing is null then
    insert into viral_posts (id, keyword, text, username, permalink, media_type, has_replies, posted_at, best_rank,
                             like_count, reply_count, repost_count)
    values (p_id, p_keyword, p_text, p_username, p_permalink, p_media_type, coalesce(p_has_replies, false), p_posted_at, p_rank,
            coalesce(p_likes, 0), coalesce(p_replies, 0), coalesce(p_reposts, 0));
    return jsonb_build_object('id', p_id, 'is_new', true);
  end if;

  update viral_posts set
    seen_count   = seen_count + case when last_seen_at < now() - interval '30 minutes' then 1 else 0 end,
    last_seen_at = now(),
    best_rank    = least(best_rank, p_rank),
    has_replies  = has_replies or coalesce(p_has_replies, false),
    like_count   = greatest(like_count, coalesce(p_likes, 0)),
    reply_count  = greatest(reply_count, coalesce(p_replies, 0)),
    repost_count = greatest(repost_count, coalesce(p_reposts, 0))
  where id = existing;
  return jsonb_build_object('id', existing, 'is_new', false);
end;
$$;

-- Hàm cũ (scraper bản cũ còn gọi) → dùng chung logic chống trùng
create or replace function upsert_viral_hit(
  p_id text, p_keyword text, p_text text, p_username text, p_permalink text,
  p_media_type text, p_has_replies boolean, p_posted_at timestamptz, p_rank int
) returns boolean
language sql as $$
  select (upsert_viral_post(p_id, p_keyword, p_text, p_username, p_permalink, p_media_type, p_has_replies, p_posted_at, p_rank) ->> 'is_new')::boolean;
$$;

-- Bài đã viết lại / đã bỏ qua được giữ lại (chỉ để chống trùng), chỉ xoá bài "chưa dùng" lâu không gặp lại
create or replace function cleanup_old_rows()
returns void
language sql
as $$
  delete from activity           where at < now() - interval '90 days';
  delete from seen_ids           where at < now() - interval '30 days';
  delete from insights_snapshots where at < now() - interval '180 days';
  delete from viral_posts        where status = 'new' and last_seen_at < now() - interval '30 days';
$$;

-- Điểm: độ "mới" tính theo lúc bot TÌM THẤY bài (found_at) thay vì lúc bài được đăng,
-- để bài lấy theo khoảng ngày cũ không bị chìm điểm.
create or replace function rescore_viral_posts()
returns void
language sql
as $$
  update viral_posts set score = round(((
      least(seen_count, 10) * 10
    + greatest(0, 25 - best_rank) * 2
    + case when has_replies or reply_count > 0 then 8 else 0 end
    + coalesce(ai_quality, 5) * 3
    + least(40, ln(1 + like_count) * 4 + ln(1 + reply_count) * 5 + ln(1 + repost_count) * 5)
  ) * exp(- greatest(0, extract(epoch from (now() - found_at))) / 3600 / 72)
    * case when is_tip = false then 0.3 else 1 end
  )::numeric, 1)
  where status = 'new';
$$;
