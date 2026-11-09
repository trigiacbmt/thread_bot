// Shopee Affiliate Open API (tuỳ chọn): đổi link sản phẩm Shopee thành link tiếp thị liên kết.
// Cần tài khoản Shopee Affiliate đã được duyệt quyền Open API (AppID + Secret trong trang affiliate).
// Không cấu hình thì bỏ qua: bạn tự dán link affiliate khi thêm sản phẩm.
import crypto from "node:crypto";

const endpoint = () => process.env.SHOPEE_AFFILIATE_ENDPOINT || "https://open-api.affiliate.shopee.vn/graphql";
const appId = () => process.env.SHOPEE_AFFILIATE_APP_ID ?? "";
const secret = () => process.env.SHOPEE_AFFILIATE_SECRET ?? "";

export const shopeeEnabled = () => Boolean(appId() && secret());

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  if (!shopeeEnabled()) throw new Error("Chưa cấu hình SHOPEE_AFFILIATE_APP_ID / SHOPEE_AFFILIATE_SECRET");
  const payload = JSON.stringify({ query, variables });
  const ts = Math.floor(Date.now() / 1000);
  // Chữ ký: SHA256(AppId + Timestamp + Payload + Secret)
  const signature = crypto.createHash("sha256").update(`${appId()}${ts}${payload}${secret()}`).digest("hex");
  const res = await fetch(endpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `SHA256 Credential=${appId()}, Timestamp=${ts}, Signature=${signature}`,
    },
    body: payload,
  });
  const body = (await res.json().catch(() => ({}))) as { data?: T; errors?: Array<{ message: string }> };
  if (!res.ok || body.errors?.length) {
    throw new Error(`Shopee API: ${body.errors?.map((e) => e.message).join("; ") || res.statusText}`);
  }
  return body.data as T;
}

/** Đổi link sản phẩm Shopee gốc thành link affiliate rút gọn. subId để phân biệt chiến dịch (VD "threads"). */
export async function generateShortLink(originUrl: string, subIds: string[] = ["threads"]): Promise<string> {
  const data = await gql<{ generateShortLink: { shortLink: string } }>(
    `mutation ($originUrl: String!, $subIds: [String]) {
      generateShortLink(input: { originUrl: $originUrl, subIds: $subIds }) { shortLink }
    }`,
    { originUrl, subIds: subIds.slice(0, 5) },
  );
  return data.generateShortLink.shortLink;
}
