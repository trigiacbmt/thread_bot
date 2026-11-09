// Sinh nội dung bằng Claude.
import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config";
import { getSettings } from "./settings";
import { MAX_TEXT } from "./threadsClient";

let client: Anthropic | null = null;
function ai(): Anthropic {
  if (!config.anthropicKey) throw new Error("Chưa cấu hình ANTHROPIC_API_KEY");
  return (client ??= new Anthropic({ apiKey: config.anthropicKey, baseURL: process.env.ANTHROPIC_BASE_URL || undefined }));
}

async function complete(system: string, user: string, maxTokens = 400, model?: string): Promise<string> {
  const res = await ai().messages.create({
    model: model ?? (await getSettings()).aiModel,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  return res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
}

type StyleSettings = { writingGuide: string; voiceSummary: string; voiceSamples: string[]; useVoiceSamples: boolean };

/**
 * Khối "giọng văn" gắn vào cuối system prompt: phong cách của chủ tài khoản, bài mẫu để bắt chước,
 * và hướng dẫn viết riêng (Cài đặt → AI).
 */
const guide = (s: StyleSettings) => {
  const parts: string[] = [];
  if (s.voiceSummary.trim()) parts.push(`Phong cách viết của chủ tài khoản:\n${s.voiceSummary.trim()}`);
  if (s.useVoiceSamples && s.voiceSamples.length) {
    parts.push(
      `Bài mẫu do chính chủ tài khoản viết. Bắt chước giọng điệu, cách xưng hô, độ dài câu, cách xuống dòng, emoji — KHÔNG lặp lại nội dung hay câu chữ:\n` +
      s.voiceSamples.map((x, i) => `<mau ${i + 1}>\n${x}\n</mau>`).join("\n"),
    );
  }
  if (s.writingGuide.trim()) parts.push(`Yêu cầu riêng của chủ tài khoản (ưu tiên làm theo):\n${s.writingGuide.trim()}`);
  return parts.length ? `\n\n${parts.join("\n\n")}` : "";
};

const RULES = `Quy tắc:
- Tối đa ${MAX_TEXT - 50} ký tự.
- Chỉ trả về nội dung bài viết, không giải thích, không đặt trong dấu ngoặc kép.
- Không bịa số liệu, không gắn link giả.
- Tối đa 1-2 emoji, hashtag không bắt buộc.`;

export async function generatePost(topic: string, extra?: string): Promise<string> {
  const s = await getSettings();
  return complete(
    `${s.persona}\n\nBạn đang viết một bài đăng Threads.\n${RULES}${guide(s)}`,
    `Chủ đề: ${topic}${extra ? `\nYêu cầu thêm: ${extra}` : ""}\nViết 1 bài đăng hấp dẫn, có giá trị thực tế.`,
  );
}

export interface ReplyContext {
  incomingText: string;
  incomingUser: string;
  rootPostText?: string;
  thread?: Array<{ username?: string; text?: string }>;
}

/** Trả về null nếu AI quyết định không nên trả lời (spam, xúc phạm, không liên quan). */
export async function generateReply(ctx: ReplyContext): Promise<string | null> {
  const s = await getSettings();
  const history = (ctx.thread ?? [])
    .slice(-8)
    .map((m) => `@${m.username ?? "?"}: ${m.text ?? ""}`)
    .join("\n");

  const out = await complete(
    `${s.persona}\n\nBạn đang trả lời bình luận trên Threads.\n${RULES}
- Ngắn gọn (1-3 câu), lịch sự, đúng trọng tâm câu hỏi.
- Nếu bình luận là spam, quảng cáo, khiêu khích, xúc phạm hoặc không cần trả lời, chỉ trả về đúng chữ: SKIP${guide(s)}`,
    [
      ctx.rootPostText ? `Bài gốc: ${ctx.rootPostText}` : "",
      history ? `Hội thoại gần đây:\n${history}` : "",
      `Bình luận cần trả lời từ @${ctx.incomingUser}: ${ctx.incomingText}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    300,
  );
  return out === "SKIP" || out.startsWith("SKIP") ? null : out;
}

// ---------- Săn bài viral ----------

/** Lấy JSON đầu tiên trong câu trả lời của model (chịu được ```json ... ``` hoặc chữ thừa). */
/**
 * Sửa JSON "gần đúng" do AI trả về: dấu " không escape bên trong chuỗi (VD reason: "hỏi "đổi tiền""),
 * xuống dòng thô trong chuỗi, dấu phẩy thừa trước } hoặc ].
 */
export function repairJson(src: string): string {
  let out = "";
  let inStr = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (!inStr) {
      if (c === '"') inStr = true;
      out += c;
      continue;
    }
    if (c === "\\") { out += c + (src[i + 1] ?? ""); i++; continue; }
    if (c === "\n") { out += "\\n"; continue; }
    if (c === "\r") continue;
    if (c === '"') {
      // Chỉ là dấu đóng chuỗi nếu sau đó là } ] : hết chuỗi, hoặc dấu phẩy rồi tới một giá trị/khoá JSON mới
      const rest = src.slice(i + 1);
      const closes = /^\s*($|[}\]:])/.test(rest) || /^\s*,\s*($|["{\[\]}\d\-tfn])/.test(rest);
      if (closes) { inStr = false; out += c; }
      else out += '\\"';
      continue;
    }
    out += c;
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

export function extractJson<T>(raw: string): T {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.search(/[\[{]/);
  if (start < 0) throw new Error("AI không trả về JSON");
  const open = body[start], close = open === "[" ? "]" : "}";
  const end = body.lastIndexOf(close);
  const text = end > start ? body.slice(start, end + 1) : body.slice(start);
  try {
    return JSON.parse(text) as T;
  } catch (first) {
    try {
      return JSON.parse(repairJson(text)) as T;
    } catch {
      // Mảng: cứu từng phần tử còn đọc được (VD output bị cắt cụt giữa chừng)
      if (open === "[") {
        const items: unknown[] = [];
        for (const m of body.slice(start).matchAll(/\{[^{}]*\}/g)) {
          try { items.push(JSON.parse(repairJson(m[0]))); } catch { /* bỏ phần tử hỏng */ }
        }
        if (items.length) return items as T;
      }
      throw first;
    }
  }
}

export interface TipVerdict {
  id: string;
  is_tip: boolean;
  quality: number; // 1-10
  reason: string;
  product_keywords: string[];
}

/** Phân loại hàng loạt: bài nào là chia sẻ tips/mẹo đời sống, chất lượng ra sao, hợp với loại sản phẩm nào. */
export async function classifyTips(posts: Array<{ id: string; text: string }>): Promise<TipVerdict[]> {
  if (!posts.length) return [];
  const list = posts.map((p, i) => `#${i + 1} [id=${p.id}]\n${p.text.slice(0, 700)}`).join("\n\n");
  const raw = await complete(
    `Bạn là biên tập viên nội dung mạng xã hội Việt Nam. Nhiệm vụ: đánh giá các bài Threads.
Trả về DUY NHẤT một mảng JSON, mỗi phần tử:
{"id": "<id>", "is_tip": true|false, "quality": 1-10, "reason": "<≤20 từ>", "product_keywords": ["<loại sản phẩm>", ...]}
Trong các chuỗi KHÔNG dùng dấu ngoặc kép " (nếu cần trích dẫn thì dùng ' hoặc « »). Không viết gì ngoài mảng JSON.
- is_tip = true khi bài chia sẻ mẹo/tips/kinh nghiệm thực tế trong cuộc sống (nhà cửa, bếp, dọn dẹp, sức khoẻ thường ngày, làm đẹp, tiết kiệm, nuôi con, du lịch, công nghệ dùng hằng ngày...). Quảng cáo lộ liễu, tin tức, chính trị, drama, tâm sự không có mẹo → false.
- quality: độ hữu ích + khả năng được lưu/chia sẻ lại.
- product_keywords: 0-4 loại sản phẩm phổ biến trên Shopee liên quan trực tiếp tới mẹo (VD "hộp đựng thực phẩm", "máy hút bụi mini"). Để [] nếu không có.`,
    list,
    Math.min(4000, 200 + posts.length * 120),
    (await getSettings()).aiClassifyModel,
  );
  const out = extractJson<TipVerdict[]>(raw);
  return out.filter((v) => v && typeof v.id === "string");
}

export interface ProductLite { id: string; name: string; keywords: string[]; note?: string | null; price?: string | null }

export interface RewriteResult {
  text: string;
  productId: string | null;
  productLine: string | null; // câu giới thiệu sản phẩm ngắn, đặt cạnh link
  reason: string;
}

/**
 * Viết một bài MỚI lấy cảm hứng từ bài viral (không chép), và chọn sản phẩm phù hợp nhất trong kho.
 */
export async function rewriteViral(
  source: { text: string; username?: string | null },
  products: ProductLite[],
  opts: { extra?: string; forceProductId?: string | null } = {},
): Promise<RewriteResult> {
  const s = await getSettings();
  const withProducts = products.length > 0; // không có sản phẩm → chỉ viết bài, không gắn link
  const catalog = products
    .map((p) => `- id=${p.id} | ${p.name}${p.price ? ` | ${p.price}` : ""} | từ khoá: ${p.keywords.join(", ")}${p.note ? ` | ghi chú: ${p.note}` : ""}`)
    .join("\n");
  const productRules = withProducts
    ? `- Thân bài tối đa ${MAX_TEXT - 120} ký tự, KHÔNG chèn link (link sẽ được hệ thống gắn sau).
- Chọn 1 sản phẩm trong kho THỰC SỰ liên quan tới mẹo; nếu không có sản phẩm nào hợp thì productId = null.
- productLine: 1 câu ngắn tự nhiên giới thiệu sản phẩm (≤ 90 ký tự, không chèn link), hoặc null.
Trả về DUY NHẤT JSON: {"text": "...", "productId": "<id>|null", "productLine": "...|null", "reason": "<vì sao chọn sản phẩm, ≤20 từ>"}`
    : `- Bài tối đa ${MAX_TEXT - 20} ký tự, không chèn link, không quảng cáo sản phẩm.
Trả về DUY NHẤT JSON: {"text": "..."}`;
  const raw = await complete(
    `${s.persona}

Bạn viết bài Threads chia sẻ tips đời sống, lấy CẢM HỨNG từ một bài đang viral.
Yêu cầu bắt buộc:
- Viết lại hoàn toàn bằng giọng của bạn: KHÔNG chép câu chữ, không giữ cấu trúc câu của bài gốc, không nhắc tên tác giả gốc.
- Giữ ý tưởng cốt lõi hữu ích, có thể bổ sung 1 ý/mẹo nhỏ của riêng bạn để bài có giá trị riêng.
- Mở đầu bằng 1 câu "hook" gây tò mò; trình bày dễ đọc (xuống dòng, gạch đầu dòng hoặc số).
- Không bịa công dụng y tế, không hứa hẹn quá đà, không bịa số liệu.
${productRules}${guide(s)}`,
    [
      `Bài viral gốc:\n${source.text.slice(0, 1500)}`,
      withProducts ? `Kho sản phẩm:\n${catalog}` : "",
      withProducts && opts.forceProductId ? `Bắt buộc dùng sản phẩm id=${opts.forceProductId}.` : "",
      opts.extra ? `Yêu cầu thêm: ${opts.extra}` : "",
    ].filter(Boolean).join("\n\n"),
    900,
  );
  const r = extractJson<Partial<RewriteResult>>(raw);
  if (!r.text) throw new Error("AI không trả về nội dung bài");
  const valid = new Set(products.map((p) => p.id));
  const productId = !withProducts ? null : opts.forceProductId ?? (r.productId && valid.has(r.productId) ? r.productId : null);
  return {
    text: r.text.trim(),
    productId,
    productLine: productId ? (r.productLine?.trim() || null) : null,
    reason: r.reason ?? "",
  };
}

/** Gọi thử model để kiểm tra key + tên model (Cài đặt → AI → Kiểm tra). */
export async function testModel(model: string): Promise<{ ok: true; model: string; ms: number; reply: string }> {
  const started = Date.now();
  const reply = await complete("Trả lời đúng một từ: OK", "Kiểm tra kết nối", 10, model);
  return { ok: true, model, ms: Date.now() - started, reply };
}

// ---------- Phân tích giọng văn ----------
export interface VoiceAnalysis {
  summary: string;          // mô tả phong cách (đưa vào prompt)
  traits: string[];         // các đặc điểm ngắn gọn để hiển thị
  persona: string;          // đề xuất persona
  writingGuide: string;     // đề xuất hướng dẫn viết (gạch đầu dòng)
  samples: string[];        // 3–5 bài tiêu biểu nhất (nguyên văn)
  analyzed: number;         // số bài đã đọc
}

/** Đọc các bài/reply chủ tài khoản đã viết → tóm tắt phong cách + đề xuất persona, hướng dẫn, bài mẫu. */
export async function analyzeVoice(texts: string[]): Promise<VoiceAnalysis> {
  const list = texts.map((t, i) => `[${i + 1}]\n${t.slice(0, 600)}`).join("\n\n");
  const raw = await complete(
    `Bạn là chuyên gia phân tích giọng văn mạng xã hội tiếng Việt. Đọc các bài Threads do CÙNG MỘT NGƯỜI viết và mô tả phong cách của họ thật cụ thể để một AI khác có thể viết giống hệt.
Phân tích: cách xưng hô (mình/tui/em/tớ…), gọi người đọc (mọi người/các bạn/ae…), độ dài câu và bài, cách mở bài, cách kết bài, xuống dòng/gạch đầu dòng, emoji (loại nào, bao nhiêu), từ ngữ/khẩu ngữ hay dùng, mức độ hài hước, chủ đề quen thuộc, dấu câu đặc trưng, viết hoa/viết tắt.
Trả về DUY NHẤT JSON:
{"summary": "<đoạn mô tả phong cách 4-8 câu, cụ thể, dùng làm hướng dẫn cho AI>",
 "traits": ["<đặc điểm ngắn ≤8 từ>", ...5-8 mục],
 "persona": "<1-2 câu persona ngôi thứ hai, bắt đầu bằng 'Bạn là'>",
 "writingGuide": "<4-7 gạch đầu dòng quy tắc viết, mỗi dòng bắt đầu bằng '- '>",
 "sampleIndexes": [<3-5 số thứ tự bài tiêu biểu nhất cho giọng văn, ưu tiên bài đa dạng>]}`,
    `Có ${texts.length} bài:\n\n${list}`,
    1500,
  );
  const r = extractJson<{ summary?: string; traits?: string[]; persona?: string; writingGuide?: string; sampleIndexes?: number[] }>(raw);
  if (!r.summary) throw new Error("AI không phân tích được giọng văn, thử lại sau");
  const samples = [...new Set(r.sampleIndexes ?? [])]
    .map((i) => texts[Number(i) - 1])
    .filter((t): t is string => Boolean(t))
    .slice(0, 5);
  return {
    summary: r.summary.trim(),
    traits: (r.traits ?? []).map(String).slice(0, 8),
    persona: (r.persona ?? "").trim(),
    writingGuide: (r.writingGuide ?? "").trim(),
    samples: samples.length ? samples : texts.slice(0, 3),
    analyzed: texts.length,
  };
}
