import type { Product } from "@/data/products";
import { hideProductIds } from "@/lib/answer-visibility";
import { findRecommendations } from "@/lib/service-recommendations";

type ProviderContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type ProviderMessage = { role: "system" | "user"; content: string | ProviderContentPart[] };
type ProviderResponse = { choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }> };
type ProviderContent = string | Array<{ type?: string; text?: string }> | undefined;
export type GeneratedReply = { text: string; productIds: string[]; provider: string };

function endpointFromBaseUrl(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  return normalized.endsWith("/chat/completions") ? normalized : `${normalized}/chat/completions`;
}

function parseAssistantContent(content: ProviderContent) {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) return content.map((part) => part.text ?? "").join("\n").trim();
  return "";
}

function parseModelResult(content: string, catalog: Product[]): { text: string; productIds: string[] } {
  const validIds = new Set(catalog.map((product) => product.id));
  try {
    const candidate = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const parsed: unknown = JSON.parse(candidate);
    if (parsed && typeof parsed === "object") {
      const record = parsed as { reply?: unknown; productIds?: unknown };
      if (typeof record.reply === "string" && record.reply.trim()) {
        const productIds = Array.isArray(record.productIds) ? record.productIds.filter((id): id is string => typeof id === "string" && validIds.has(id)) : [];
        return { text: hideProductIds(record.reply.trim(), catalog.map((product) => product.id)), productIds };
      }
    }
  } catch {
    // Some compatible models may ignore the JSON-only instruction; use their plain text reply.
  }
  return { text: hideProductIds(content || "暂时无法生成回复，请稍后重试。", catalog.map((product) => product.id)), productIds: [] };
}

export async function generateWithConfiguredModel(query: string, options: { images?: Array<{ name: string; mimeType: string; base64: string }>; catalog?: Product[] } = {}): Promise<GeneratedReply | null> {
  const apiKey = process.env.DASHSCOPE_API_KEY || process.env.CHAT_API_KEY;
  if (!apiKey) return null;

  const catalogProducts = options.catalog ?? [];

  const baseUrl = process.env.CHAT_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";
  const model = process.env.CHAT_MODEL || "qwen-plus";
  const requestModel = options.images?.length ? process.env.CHAT_VISION_MODEL || (baseUrl.includes("dashscope.aliyuncs.com") ? "qwen-vl-plus" : model) : model;

  const matchedCandidates = findRecommendations(query, catalogProducts);
  const candidates = matchedCandidates.length || !options.images?.length ? matchedCandidates : findRecommendations("有哪些服务可以选择？", catalogProducts);
  const catalog = candidates.map(({ id, name, description, country, category, apiType, serviceFee, officialFee, price, currencyCode, currencyName, priceNote }) => ({ id, name, description, country, category, apiType, serviceFee, officialFee, totalPrice: price, currencyCode, currencyName, priceNote }));
  const hasLiveProducts = candidates.some((product) => product.dataSource === "test-api");
  const systemPrompt = [
    "你是智蚁企业服务平台的中文服务助手。请结合商品目录回答用户问题。",
    "商品接口的 type=1 是商标、专利、版权，type=2 是 VAT、EPR、授权代表，type=3 是海外公司。推荐时优先匹配用户提到的商品名称、服务类型、国家和办理关键词。",
    "价格由代理费、官费和总价三个接口字段提供，金额均为人民币。订单应以接口总价为准；若代理费与官费之和不等于总价，不要自行改写价格，应提示用户咨询顾问。",
    hasLiveProducts ? "目录价格取商品接口的 patentTotalPrice，统一以人民币显示。展示价格仅供参考，不得称为正式报价；具体服务范围和实际价格需由顾问或结算结果确认。" : "商品接口暂不可用；不要推荐商品、编造价格或声称有可用商品。",
    "请只返回 JSON，不要使用 Markdown 代码块，格式为：{\"reply\":\"中文回复\",\"productIds\":[\"有效商品ID\"]}。",
    "reply 字段可使用 Markdown 排版，但整个响应仍必须是合法 JSON。复杂问题先用一段话给出明确结论，再用二级标题分节说明；涉及多项服务的比较时，可用 Markdown 表格列出事项、是否必需、触发条件、办理周期和费用口径。简单问题保持简洁，不必强行做表格。",
    "只依据已知信息回答，不能编造法规要求、办理周期或费用。缺少依据的内容请明确写明需向顾问或主管机构核实；目录金额仅按商品数据说明，不要把演示价格写成正式报价。",
    "productIds 只能使用下方候选商品中的 id；仅推荐与用户需求相关的商品，最多 8 个。不适合时返回空数组。",
    "reply 是给用户看的回答，不要在 reply 中输出商品 ID、商品编号或目录中的 id。商品关联只填写在 productIds 字段，页面会单独展示商品卡片。",
    `商品目录：${JSON.stringify(catalog)}`,
    options.images?.length ? "用户同时上传了图片，请结合图片内容和商品目录回答；如果能判断服务类型或国家，只推荐目录中相关商品。" : "",
  ].join("\n");
  const userContent: ProviderContentPart[] = [{ type: "text", text: query }];
  options.images?.forEach((image) => {
    userContent.push({ type: "text", text: `图片附件：${image.name}` });
    userContent.push({ type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.base64}` } });
  });
  const messages: ProviderMessage[] = [{ role: "system", content: systemPrompt }, { role: "user", content: options.images?.length ? userContent : query }];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(endpointFromBaseUrl(baseUrl), {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: requestModel, messages, temperature: 0.4 }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`Model provider returned ${response.status}: ${detail}`);
    }
    const payload = await response.json() as ProviderResponse;
    const content = parseAssistantContent(payload.choices?.[0]?.message?.content);
    if (!content) throw new Error("Model provider returned an empty response.");
    return { ...parseModelResult(content, candidates), provider: requestModel };
  } finally {
    clearTimeout(timeout);
  }
}
