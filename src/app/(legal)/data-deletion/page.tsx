import type { Metadata } from "next";
import Link from "next/link";
import { legal } from "@/lib/legal";
import { getDeletionRecord, type DeletionRecord } from "@/lib/userData";

export const metadata: Metadata = { title: "Data Deletion" };
export const dynamic = "force-dynamic";

async function lookup(code: string): Promise<DeletionRecord | null | "error"> {
  try { return await getDeletionRecord(code); } catch { return "error"; }
}

export default async function DataDeletionPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  const record = code ? await lookup(code) : null;
  const contact = legal.contact ? <a href={`mailto:${legal.contact}`}>{legal.contact}</a> : <>the app owner via their Threads profile</>;

  return (
    <article>
      <h1>Data Deletion</h1>
      <p className="text-muted-foreground text-sm">Last updated: {legal.updated}</p>

      {code && (
        <div className="bg-muted/60 my-6 rounded-xl border p-4">
          <div className="text-muted-foreground text-xs">Confirmation code</div>
          <div className="font-mono text-lg font-semibold">{code}</div>
          {record === "error" ? (
            <p className="mt-2 mb-0">We could not look up this request right now. Please try again later or contact us.</p>
          ) : !record ? (
            <p className="mt-2 mb-0">No deletion request was found for this code.</p>
          ) : (
            <div className="mt-2">
              <p className="mb-1"><b>Status:</b> {record.status === "completed" ? "Completed" : "Completed — no data was stored for this account"}</p>
              <p className="mb-1"><b>Requested:</b> {new Date(record.requestedAt).toUTCString()}</p>
              {record.removed.length > 0 && <p className="mb-0"><b>Deleted:</b> {record.removed.join(", ")}</p>}
            </div>
          )}
        </div>
      )}

      <p>{legal.appName} stores data only for the Threads account that connected it. You can delete that data in any of these ways:</p>

      <h2>Option 1 — Remove the app in Threads (automatic)</h2>
      <ol>
        <li>Open Threads and go to <b>Settings → Account → Website permissions</b>.</li>
        <li>Find <b>{legal.appName}</b> under <b>Active</b> and select <b>Remove</b>.</li>
        <li>If asked, also choose to send a request to delete your data.</li>
      </ol>
      <p>
        When you remove the app, its access token is deleted immediately and it can no longer act on your account. When you
        request data deletion, we also delete your stored insights, writing-style analysis and sample posts, and ownership of the
        dashboard, and you receive a confirmation code you can check on this page.
      </p>

      <h2>Option 2 — Contact us</h2>
      <p>Send a deletion request to {contact}, including your Threads username. We complete requests within 30 days.</p>

      <h2>What is deleted</h2>
      <ul>
        <li>Your Threads access token and connection.</li>
        <li>Insights metrics of your account.</li>
        <li>Writing-style analysis and sample posts derived from your content.</li>
        <li>Your owner access to the dashboard.</li>
      </ul>
      <p>
        Activity logs are deleted automatically after 90 days. Posts already published on Threads stay on your profile — you can
        delete them in the Threads app. See the <Link href="/privacy">Privacy Policy</Link> for details.
      </p>

      <hr className="my-10" />
      <h2>Hướng dẫn tiếng Việt</h2>
      <p>
        Vào Threads → <b>Cài đặt → Tài khoản → Quyền của trang web</b>, chọn {legal.appName} → <b>Gỡ</b> (có thể chọn gửi yêu cầu
        xoá dữ liệu). Token bị xoá ngay; khi yêu cầu xoá dữ liệu, insights, phân tích giọng văn, bài mẫu và quyền chủ dashboard cũng
        bị xoá, bạn nhận mã xác nhận để tra cứu tại trang này. Hoặc liên hệ {contact}.
      </p>
    </article>
  );
}
