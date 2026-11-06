import { request as httpsRequest } from "node:https";
import { getProductCatalog } from "@/services/cyberantt-products";
import type { CheckoutQuote, CheckoutTicket } from "@/types/checkout";

const TEST_HOST = "test-2026.cyberantt.com";
const ALLOWED_PATHS = new Set([
  "/dev-api/servicePrice/zyywProductList.client",
  "/dev-api/zy/cart/list",
  "/dev-api/zy/cart/add",
  "/dev-api/zy/cart/checked",
  "/dev-api/zy/cart/quantity",
  "/dev-api/zy/cart/total",
  "/dev-api/zy/cart/remove",
  "/dev-api/zy/pay/createOrder",
  "/dev-api/zy/pay/exeNotify.client",
  "/dev-api/zy/pay/unifiedorder.client",
  "/dev-api/zy/pay/queryOrderPayStatus",
  "/dev-api/zy/profile/order/queryInfoByOrderNo",
  "/dev-api/zy/profile/order/list",
  "/dev-api/zy/workbench/progressList",
  "/dev-api/zy/workbench/ved/todoList",
  "/dev-api/zy/workbench/ved/todoListDict",
  "/dev-api/zy/vat/taxNo/queryInfo",
  "/dev-api/zy/vat/taxNo/registerVat",
]);
const PREVIEW_PATHS = new Set([
  "/dev-api/servicePrice/zyywProductList.client",
  "/dev-api/zy/cart/list", "/dev-api/zy/cart/add", "/dev-api/zy/cart/checked",
  "/dev-api/zy/cart/quantity", "/dev-api/zy/cart/total", "/dev-api/zy/cart/remove",
  "/dev-api/zy/profile/order/list", "/dev-api/zy/workbench/progressList",
]);

export type CheckoutItem = { productId: string; quantity: number };

type ApiResult<T> = { code?: number; flag?: boolean; success?: boolean; msg?: string; message?: string; data?: T };
type Sku = { id?: string | number; info?: string; priceFour?: number };
type ProductDetail = { id?: string; productTitle?: string; patentTotalPrice?: string; skuType?: number; sbxmProductSpecs?: Sku[]; serviceInfo?: string };
type CartLine = { cartId?: string; productName?: string; quantity?: number; checked?: number; skuInfo?: string };
type PriceDetail = { patentServePrice?: string; currencyGf?: string; quantity?: string };
type RawTicket = { ticketId?: number | string; ticketName?: string; scopeInfo?: string; remark?: string; useEndTime?: string; state?: number; type?: number; effectValue?: number; ticketValue?: number };
type PriceAmount = { totalPrice?: string; totalServePrice?: string; totalQuantity?: string; yhPrice?: string; ticketIds?: string; ticketList?: RawTicket[]; priceDetailsVos?: PriceDetail[] };

export class CheckoutError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

function number(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new CheckoutError("结算接口返回了无效金额，请稍后重试。");
  return Math.round(parsed * 100) / 100;
}

function availableTickets(value: unknown): CheckoutTicket[] {
  if (!Array.isArray(value)) return [];
  const tickets = new Map<string, CheckoutTicket>();
  for (const row of value as RawTicket[]) {
    if (!row || typeof row !== "object") continue;
    const id = String(row.ticketId ?? "");
    if (!/^\d{1,24}$/.test(id) || (row.state != null && row.state !== 0)) continue;
    const benefitLabel = row.type === 1 && Number.isFinite(row.effectValue) && Number.isFinite(row.ticketValue)
      ? `满 ${row.effectValue} 元减 ${row.ticketValue} 元`
      : row.type === 2 ? "免单券" : row.type === 3 ? "新人券" : row.type === 4 ? "折扣券" : undefined;
    tickets.set(id, {
      id,
      name: typeof row.ticketName === "string" && row.ticketName.trim() ? row.ticketName.trim() : `优惠券 ${id}`,
      benefitLabel,
      scopeInfo: typeof row.scopeInfo === "string" ? row.scopeInfo : undefined,
      remark: typeof row.remark === "string" ? row.remark : undefined,
      useEndTime: typeof row.useEndTime === "string" ? row.useEndTime : undefined,
    });
  }
  return [...tickets.values()];
}

function apiBase(): URL {
  return new URL(`${(process.env.CYBERANTT_API_BASE_URL || `https://${TEST_HOST}/dev-api`).replace(/\/+$/, "")}/`);
}

export async function apiRequest<T>(path: string, method: "GET" | "POST", body?: unknown, query?: URLSearchParams): Promise<T> {
  const base = apiBase();
  const url = new URL(path.replace(/^\//, ""), base);
  if (query) url.search = query.toString();
  const token = process.env.CYBERANTT_API_TOKEN?.trim().replace(/^Bearer\s+/i, "");
  if (!token) throw new CheckoutError("结算接口尚未配置，暂时无法获取结算价格。", 503);
  if (process.env.NODE_ENV !== "development") throw new CheckoutError("当前环境暂不支持在线结算。", 503);
  if (!ALLOWED_PATHS.has(url.pathname) || url.origin !== base.origin) throw new CheckoutError("结算接口地址配置不正确。", 500);
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const headers: Record<string, string> = { Authorization: token };
  if (payload !== undefined) headers["Content-Type"] = "application/json";
  const skipInvalidCertificate = process.env.CYBERANTT_ALLOW_INVALID_TEST_CERT === "true"
    && url.protocol === "https:" && url.hostname === TEST_HOST
    && PREVIEW_PATHS.has(url.pathname);

  let responseText: string;
  let httpStatus: number;
  if (skipInvalidCertificate) {
    const result = await new Promise<{ status: number; text: string }>((resolve, reject) => {
      const request = httpsRequest(url, { method, headers, rejectUnauthorized: false, timeout: 12_000 }, (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 6_000_000) { request.destroy(new Error("Response too large")); return; }
          chunks.push(chunk);
        });
        response.on("end", () => resolve({ status: response.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }));
        response.on("error", reject);
      });
      request.on("timeout", () => request.destroy(new Error("Request timeout")));
      request.on("error", reject);
      request.end(payload);
    });
    httpStatus = result.status;
    responseText = result.text;
  } else {
    const response = await fetch(url, { method, headers, body: payload, cache: "no-store", signal: AbortSignal.timeout(12_000) });
    httpStatus = response.status;
    responseText = await response.text();
  }
  let parsed: unknown;
  try { parsed = JSON.parse(responseText) as unknown; }
  catch { throw new CheckoutError("结算接口返回格式异常。", 502); }
  if (path === "/zy/pay/exeNotify.client" && typeof parsed === "boolean") {
    if (httpStatus >= 200 && httpStatus < 300 && parsed) return true as T;
    throw new CheckoutError("支付接口未确认成功。", 502);
  }
  if (!parsed || typeof parsed !== "object") throw new CheckoutError("结算接口返回格式异常。", 502);
  const result = parsed as ApiResult<T>;
  const needsData = path === "/servicePrice/zyywProductList.client" || path === "/zy/cart/list" || path === "/zy/cart/add" || path === "/zy/cart/total"
    || path === "/zy/pay/createOrder" || path === "/zy/pay/unifiedorder.client" || path === "/zy/pay/queryOrderPayStatus"
    || path === "/zy/profile/order/queryInfoByOrderNo" || path === "/zy/profile/order/list" || path === "/zy/workbench/progressList" || path === "/zy/workbench/ved/todoList" || path === "/zy/workbench/ved/todoListDict" || path === "/zy/vat/taxNo/queryInfo";
  if (httpStatus < 200 || httpStatus >= 300 || Number(result.code) !== 200 || result.flag === false || result.success === false || (needsData && result.data == null)) {
    throw new CheckoutError(result.msg || result.message || `服务接口暂不可用（${result.code ?? httpStatus}）。`, 502);
  }
  if (path === "/zy/pay/exeNotify.client" && result.data !== true) throw new CheckoutError("支付接口未确认成功。", 502);
  return result.data as T;
}

function selectedSku(detail: ProductDetail, displayedPrice: number): { skuId: string; warning?: string } {
  if (detail.skuType !== 2) return { skuId: "" };
  const skus = Array.isArray(detail.sbxmProductSpecs) ? detail.sbxmProductSpecs : [];
  if (!skus.length) return { skuId: "", warning: `${detail.productTitle}暂无规格信息，按基础商品价格试算。` };
  const matches = skus.filter((sku) => Math.abs(Number(sku.priceFour) - displayedPrice) < 0.01 && sku.id != null);
  if (!matches.length) throw new CheckoutError(`${detail.productTitle}的商品价格与规格不一致，暂无法试算。`, 422);
  return {
    skuId: String(matches[0].id),
    warning: matches.length > 1 ? `${detail.productTitle}有多个同价规格，当前按第一个规格试算。` : undefined,
  };
}

function serviceName(value?: string): string {
  if (!value) return "基础";
  try {
    const rows: unknown = JSON.parse(value);
    if (Array.isArray(rows) && Array.isArray(rows[0]) && rows[0][0] && typeof rows[0][0] === "object") {
      const label = (rows[0][0] as Record<string, unknown>)["套餐1"];
      if (typeof label === "string" && label.trim()) return label.trim();
    }
  } catch { /* The backend also returns empty or plain-text package descriptions. */ }
  return "基础";
}

function cartSkuId(line: CartLine): string {
  if (!line.skuInfo) return "";
  try {
    const sku = JSON.parse(line.skuInfo) as { id?: string | number };
    return sku.id == null ? "" : String(sku.id);
  } catch { return ""; }
}

async function updateCart(path: "/zy/cart/quantity" | "/zy/cart/checked", body: unknown) {
  await apiRequest<unknown>(path, "POST", body);
}

let cartQueue: Promise<void> = Promise.resolve();

export async function withCartLock<T>(action: () => Promise<T>): Promise<T> {
  // The local test token shares one backend cart. Quote and order requests must not overlap.
  const previous = cartQueue;
  let release = () => {};
  cartQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try { return await action(); }
  finally { release(); }
}

export type PreparedCheckout = { quote: CheckoutQuote; cartIds: string[]; restore: () => Promise<void> };

export async function prepareCheckout(items: CheckoutItem[], ticketIds = ""): Promise<PreparedCheckout> {
  if (ticketIds && !/^\d{1,24}(,\d{1,24})*$/.test(ticketIds)) throw new CheckoutError("优惠券 ID 不正确。", 400);
  const catalog = await getProductCatalog();
  const byId = new Map(catalog.products.filter((product) => product.dataSource === "test-api").map((product) => [product.id, product]));
  if (catalog.source !== "test-api" || items.some((item) => !byId.has(item.productId))) {
    throw new CheckoutError("所选商品不在当前商品目录中，无法获取实时结算价格。", 422);
  }
  const [page, existing] = await Promise.all([
    apiRequest<{ records?: ProductDetail[] }>("/servicePrice/zyywProductList.client", "POST", { pageIndex: 1, pageSize: 999 }),
    apiRequest<CartLine[]>("/zy/cart/list", "GET", undefined, new URLSearchParams({ taxInfoType: "0", taxType: "0" })),
  ]);
  const details = new Map((page.records ?? []).map((product) => [String(product.id), product]));
  const originalIds = new Set(existing.map((line) => String(line.cartId)));
  const addedIds: string[] = [];
  const changedLines: Array<{ id: string; quantity: number; checked: number }> = [];
  const quoteIds: string[] = [];
  const warnings: string[] = [];
  let restored = false;
  async function restore() {
    if (restored) return;
    restored = true;
    let cleanupFailed = false;
    for (const line of changedLines.reverse()) {
      try {
        await updateCart("/zy/cart/quantity", { cartId: line.id, quantity: line.quantity });
        await updateCart("/zy/cart/checked", { cartId: line.id, checked: line.checked });
      } catch { cleanupFailed = true; }
    }
    if (addedIds.length) {
      try { await apiRequest<unknown>("/zy/cart/remove", "POST", addedIds); }
      catch { cleanupFailed = true; }
    }
    if (cleanupFailed) throw new CheckoutError("临时购物车恢复失败，请检查原站购物车。", 502);
  }
  try {
    for (const item of items) {
      const product = byId.get(item.productId)!;
      const detail = details.get(item.productId);
      if (!detail) throw new CheckoutError(`${product.name}未出现在商品明细中，暂无法结算。`, 422);
      const sku = selectedSku(detail, product.price);
      if (sku.warning) warnings.push(sku.warning);
      const matches = existing.filter((line) => line.productName === product.name && cartSkuId(line) === sku.skuId && line.cartId);
      if (matches.length > 1) throw new CheckoutError(`${product.name}在购物车中有重复条目，暂无法安全试算。`, 409);
      if (matches.length === 1) {
        const line = matches[0];
        const id = String(line.cartId);
        const originalQuantity = Number(line.quantity) || 1;
        const originalChecked = line.checked === 0 ? 0 : 1;
        if (originalQuantity !== item.quantity || originalChecked !== 1) changedLines.push({ id, quantity: originalQuantity, checked: originalChecked });
        if (originalQuantity !== item.quantity) await updateCart("/zy/cart/quantity", { cartId: id, quantity: item.quantity });
        if (originalChecked !== 1) await updateCart("/zy/cart/checked", { cartId: id, checked: 1 });
        quoteIds.push(id);
      } else {
        const ids = await apiRequest<string[]>("/zy/cart/add", "POST", { productId: item.productId, quantity: item.quantity, serviceName: serviceName(detail.serviceInfo), skuId: sku.skuId });
        const id = String(ids[0] ?? "");
        if (!/^\d+$/.test(id)) throw new CheckoutError("购物车接口未返回有效条目 ID。");
        if (originalIds.has(id)) {
          const original = existing.find((line) => String(line.cartId) === id);
          if (original) changedLines.push({ id, quantity: Number(original.quantity) || 1, checked: original.checked === 0 ? 0 : 1 });
          throw new CheckoutError("购物车商品发生合并，请刷新原站购物车后重试。", 409);
        }
        addedIds.push(id);
        quoteIds.push(id);
      }
    }
    const query = new URLSearchParams({ cartIds: quoteIds.join(","), taxInfoType: "0", taxType: "0" });
    if (ticketIds) query.set("ticketIds", ticketIds);
    const amount = await apiRequest<PriceAmount>("/zy/cart/total", "GET", undefined, query);
    const appliedTicketIds = typeof amount.ticketIds === "string" ? amount.ticketIds.trim() : "";
    if (appliedTicketIds && !/^\d{1,24}(,\d{1,24})*$/.test(appliedTicketIds)) throw new CheckoutError("结算接口返回的优惠券 ID 不正确。", 502);
    if (ticketIds && appliedTicketIds !== ticketIds) throw new CheckoutError("所选优惠券已不可用，请重新选择。", 409);
    const total = number(amount.totalPrice);
    const discount = number(amount.yhPrice ?? 0);
    const serviceFee = number(amount.totalServePrice ?? 0);
    const officialFee = (amount.priceDetailsVos ?? []).reduce((sum, detail) => sum + number(detail.currencyGf ?? 0) * number(detail.quantity ?? 1), 0);
    const itemCount = number(amount.totalQuantity);
    if (itemCount !== items.reduce((sum, item) => sum + item.quantity, 0)) throw new CheckoutError("结算接口返回的商品数量与所选商品不一致。", 502);
    const quote: CheckoutQuote = { source: "test-api", total, discount, ticketIds: appliedTicketIds, tickets: availableTickets(amount.ticketList), itemCount, serviceFee, officialFee: Math.round(officialFee * 100) / 100, warnings };
    return { quote, cartIds: quoteIds, restore };
  } catch (error) {
    await restore();
    throw error;
  }
}

export async function getCheckoutQuote(items: CheckoutItem[], ticketIds = ""): Promise<CheckoutQuote> {
  return withCartLock(async () => {
    const prepared = await prepareCheckout(items, ticketIds);
    try { return prepared.quote; }
    finally { await prepared.restore(); }
  });
}
