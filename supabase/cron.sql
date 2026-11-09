-- Lên lịch job bằng pg_cron + pg_net của Supabase (chạy được với gói Free).
-- 1) Dashboard > Database > Extensions: bật "pg_cron" và "pg_net".
-- 2) Thay APP_URL và CRON_SECRET bên dưới (CRON_SECRET giống biến môi trường của app).
-- 3) Chạy file này trong SQL Editor. Xem lịch: select * from cron.job;
--    Xem kết quả: select * from cron.job_run_details order by start_time desc limit 20;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Lưu URL và secret trong Vault để không lộ trong định nghĩa job
select vault.create_secret('https://your-app.vercel.app', 'threads_bot_url');
select vault.create_secret('change-me-cron-secret', 'threads_bot_cron_secret');

create or replace function call_threads_job(job text)
returns void
language plpgsql
security definer
as $$
declare
  base   text := (select decrypted_secret from vault.decrypted_secrets where name = 'threads_bot_url');
  secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'threads_bot_cron_secret');
begin
  perform net.http_post(
    url     := base || '/api/cron/' || job,
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret, 'Content-Type', 'application/json'),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$$;

-- "tick" mỗi phút: đăng bài đến giờ + chạy auto-post / quét từ khóa theo cron trong Cài đặt
select cron.schedule('threads-tick',          '* * * * *',    $$select call_threads_job('tick')$$);
select cron.schedule('threads-insights',      '5 * * * *',    $$select call_threads_job('insights')$$);
select cron.schedule('threads-mentions',      '*/10 * * * *', $$select call_threads_job('mentions')$$);
select cron.schedule('threads-refresh-token', '17 20 * * *',  $$select call_threads_job('refresh-token')$$);
select cron.schedule('threads-cleanup',       '30 19 * * *',  $$select cleanup_old_rows()$$);
