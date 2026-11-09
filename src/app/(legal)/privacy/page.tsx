import type { Metadata } from "next";
import Link from "next/link";
import { legal } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy Policy", robots: { index: true } };
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  const name = legal.appName;
  const contact = legal.contact
    ? <a href={`mailto:${legal.contact}`}>{legal.contact}</a>
    : <>the app owner via their Threads profile</>;
  return (
    <article>
      <h1>Privacy Policy</h1>
      <p className="text-muted-foreground text-sm">Last updated: {legal.updated}</p>

      <p>
        {name} is a personal tool that helps its owner manage their own Threads account: discovering popular public
        posts about everyday life tips, drafting original posts with AI assistance, scheduling and publishing posts, replying
        to comments, and viewing account insights. It is operated by and for a single account owner. It is not offered to the
        general public and has no end-user sign-up.
      </p>

      <h2>1. Data we collect</h2>
      <p>When the owner connects their Threads account through Threads Login, we receive and store:</p>
      <ul>
        <li><b>Account information:</b> Threads user ID and username.</li>
        <li><b>Access token:</b> a Threads access token, used only to call the Threads API on the owner&apos;s behalf. It is stored server-side and never shown in the browser.</li>
        <li><b>Owner&apos;s content:</b> the owner&apos;s own posts and replies (text, timestamps, links), retrieved to analyze writing style and to show what the bot published.</li>
        <li><b>Insights:</b> metrics for the owner&apos;s account and posts (views, likes, replies, reposts, quotes, follower count).</li>
        <li><b>Replies and mentions:</b> text, username and ID of replies to the owner&apos;s posts and mentions of the owner, received so the owner can respond.</li>
        <li><b>Public posts from keyword search:</b> text, username, permalink and timestamp of public posts matching keywords configured by the owner (e.g. &quot;life hacks&quot;). These are used only as inspiration and are never republished verbatim.</li>
        <li><b>Activity log:</b> a record of actions taken by the bot (posts published, replies sent, errors).</li>
      </ul>
      <p>We do not collect passwords, email addresses, phone numbers, payment information, or private messages.</p>

      <h2>2. How we use the data</h2>
      <ul>
        <li>To publish posts and replies that the owner has written or approved.</li>
        <li>If the owner enables auto-reply, to send short AI-generated replies to comments and mentions on the owner&apos;s own posts (with an hourly limit and spam filtering). The owner can turn this off at any time.</li>
        <li>To find popular public posts about life tips so the owner can write their own original content on similar topics.</li>
        <li>To generate draft posts and reply suggestions with AI, in the owner&apos;s writing style. Drafts require the owner&apos;s review before publishing unless the owner explicitly enables automatic publishing.</li>
        <li>To display insights and charts about the owner&apos;s account.</li>
      </ul>
      <p>We do not sell data, use it for advertising, build profiles of other users, or contact any user.</p>

      <h2>3. Sharing with service providers</h2>
      <ul>
        <li><b>Supabase</b> (database hosting) stores the data listed above.</li>
        <li><b>Anthropic</b> (Claude API) receives post text needed to classify posts and to draft content and replies. Anthropic processes this data to provide the API service.</li>
        <li><b>Vercel</b> or the owner&apos;s own server hosts the application.</li>
        <li><b>Shopee Affiliate</b> (optional): only product links chosen by the owner are processed; no Threads data is sent to Shopee.</li>
      </ul>
      <p>Data is shared with no other third parties, except where required by law.</p>

      <h2>4. Data retention</h2>
      <ul>
        <li>Activity log: 90 days. Processed reply/mention IDs: 30 days.</li>
        <li>Public posts found by keyword search that were not used: 30 days after they were last seen.</li>
        <li>Insights snapshots: 180 days.</li>
        <li>Access token: until the owner disconnects the app, removes it in Threads settings, or requests deletion.</li>
      </ul>

      <h2>5. Security</h2>
      <p>
        Data is stored in a database with row-level security that is accessible only from the server. The dashboard is
        protected by Threads Login and restricted to the owner&apos;s account. All traffic uses HTTPS.
      </p>

      <h2>6. Your choices and data deletion</h2>
      <p>
        You can remove the app at any time in Threads → Settings → Account → Website permissions. To delete your data, follow
        the instructions on the <Link href="/data-deletion">Data Deletion</Link> page.
      </p>

      <h2>7. Contact</h2>
      <p>Questions about this policy: {contact}.</p>

      <hr className="my-10" />

      <h2>Tóm tắt tiếng Việt</h2>
      <p>
        {name} là công cụ cá nhân giúp chủ tài khoản quản lý tài khoản Threads của chính mình: tìm bài mẹo vặt công khai
        đang nổi để lấy cảm hứng, nhờ AI soạn bài theo giọng văn của chủ tài khoản, lên lịch và đăng bài, trả lời bình luận,
        xem số liệu. Ứng dụng lưu: ID và username Threads, access token, bài và reply của chủ tài khoản, số liệu insights,
        reply/mention gửi tới, bài công khai tìm theo từ khoá và nhật ký hoạt động. Không thu thập mật khẩu, email, số điện
        thoại hay tin nhắn riêng. Dữ liệu chỉ được xử lý bởi Supabase (lưu trữ) và Anthropic (AI), không bán, không dùng cho
        quảng cáo. Xoá dữ liệu: xem trang <Link href="/data-deletion">Xoá dữ liệu</Link>.
      </p>
    </article>
  );
}
