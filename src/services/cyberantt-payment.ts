import { apiRequest, CheckoutError, prepareCheckout, withCartLock, type CheckoutItem } from "@/services/cyberantt-checkout";
import type { PaymentMethod, PaymentOrder, PaymentStatus } from "@/types/payment";

type CreateOrderData = { orderNo?: string; orderPayType?: string; expiresTime?: string; orderTotalPrice?: string };
type UnifiedOrderData = { imgUrl?: string; orderPayType?: string };
type PayStatusData = { status?: string; orderMoney?: string; expiresTime?: string };

const attempts = new Map<string, { fingerprint: string; promise: Promise<PaymentOrder> }>();
const knownOrders = new Map<string, { method: PaymentMethod; amount: number }>();

export function hasKnownOrder(orderNo: string): boolean { return knownOrders.has(orderNo); }

async function ensureKnownOrder(orderNo: string, method: PaymentMethod) {
  const cached = knownOrders.get(orderNo);
  if (cached) {
    if (cached.method !== method) throw new CheckoutError("支付方式与订单不匹配。", 400);
    return;
  }
  const page = await apiRequest<{ records?: Array<{ orderNo?: string; orderPayType?: string; patentTotalPrice?: string }> }>(
    "/zy/profile/order/list", "POST", { orderType: "0", pageIndex: 1, pageSize: 20, searchKey: orderNo },
  );
  const match = (page.records ?? []).find((item) => item.orderNo === orderNo);
  if (!match) throw new CheckoutError("当前账号的订单列表中未找到该订单。", 404);
  if (match.orderPayType && match.orderPayType !== method) throw new CheckoutError("支付方式与订单不匹配。", 400);
  knownOrders.set(orderNo, { method, amount: Number(match.patentTotalPrice) || 0 });
}

export async function assertPaymentAvailable(): Promise<void> {
  if (process.env.NODE_ENV !== "development") throw new CheckoutError("当前环境暂不支持在线支付。", 503);
  if (!process.env.CYBERANTT_API_TOKEN?.trim()) throw new CheckoutError("支付接口尚未配置，暂不可用。", 503);
  const base = new URL(`${(process.env.CYBERANTT_API_BASE_URL || "https://test-2026.cyberantt.com/dev-api").replace(/\/+$/, "")}/`);
  if (base.protocol !== "https:") throw new CheckoutError("支付接口需要有效的 HTTPS 连接，当前地址不可用于支付。", 503);
  try {
    const response = await fetch(new URL("v2/api-docs", base), { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await response.body?.cancel();
  } catch {
    throw new CheckoutError("支付接口 HTTPS 证书无效或接口不可达，暂不能创建订单或获取付款码。", 503);
  }
}

function validImageUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 200_000) return undefined;
  if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch { return undefined; }
}

export async function createPaymentOrder(items: CheckoutItem[], method: PaymentMethod, expectedTotal: number, requestId: string, ticketIds = "", skipPayment = false): Promise<PaymentOrder> {
  await assertPaymentAvailable();
  const fingerprint = JSON.stringify({ items, method, expectedTotal, ticketIds, skipPayment });
  const existing = attempts.get(requestId);
  if (existing) {
    if (existing.fingerprint !== fingerprint) throw new CheckoutError("同一提交编号对应不同订单内容，请刷新结算页面。", 409);
    return existing.promise;
  }
  const promise = withCartLock(async () => {
    const prepared = await prepareCheckout(items, ticketIds);
    if (Math.abs(prepared.quote.total - expectedTotal) >= 0.01) {
      await prepared.restore();
      throw new CheckoutError("结算价格已变化，请重新核对金额后再创建订单。", 409);
    }
    let orderCreated = false;
    try {
      const created = await apiRequest<CreateOrderData>("/zy/pay/createOrder", "POST", {
        cartIds: prepared.cartIds,
        orderPayType: method,
        taxInfoType: "0",
        taxType: "0",
        ...(prepared.quote.ticketIds ? { ticketIds: prepared.quote.ticketIds } : {}),
      });
      const orderNo = String(created.orderNo ?? "");
      if (!/^[A-Za-z0-9-]{1,80}$/.test(orderNo)) throw new CheckoutError("订单已提交，但接口未返回有效订单号，请到原站订单中心核对。", 502);
      orderCreated = true;
      const actualAmount = Number(created.orderTotalPrice);
      const amount = Number.isFinite(actualAmount) && actualAmount >= 0 ? actualAmount : prepared.quote.total;
      knownOrders.set(orderNo, { method, amount });
      const result: PaymentOrder = { orderNo, paymentMethod: method, amount, expiresTime: created.expiresTime, paymentSkipped: skipPayment, amountChanged: Math.abs(amount - expectedTotal) >= 0.01 };
      if (skipPayment) {
        try {
          await apiRequest<boolean>("/zy/pay/exeNotify.client", "POST", undefined, new URLSearchParams({ orderNo }));
          const payment = await getPaymentStatus(orderNo, method);
          result.paymentStatus = payment.status;
          if (payment.status !== "paid") result.testPaymentError = "支付请求已提交，等待接口确认支付状态。";
        } catch (error) {
          result.testPaymentError = error instanceof CheckoutError ? error.message : "订单已创建，但支付结果暂无法确认。";
        }
        return result;
      }
      try {
        const code = await apiRequest<UnifiedOrderData>("/zy/pay/unifiedorder.client", "POST", { orderNo, orderPayType: method });
        result.imageUrl = validImageUrl(code.imgUrl);
        if (!result.imageUrl) result.codeError = "付款码暂不可用，请在原站订单中心继续支付。";
      } catch {
        result.codeError = "订单已创建，但付款码获取失败，请在原站订单中心继续支付。";
      }
      return result;
    } catch (error) {
      if (!orderCreated) {
        try { await prepared.restore(); }
        catch { throw new CheckoutError("订单提交结果不确定，且购物车恢复失败。请先核对原站订单与购物车。", 502); }
      }
      if (error instanceof CheckoutError && error.status === 409) throw error;
      throw new CheckoutError("订单提交结果不确定，请先在原站订单中心核对，避免重复下单。", 502);
    }
  });
  attempts.set(requestId, { fingerprint, promise });
  return promise;
}

export async function retryPaymentCode(orderNo: string, method: PaymentMethod): Promise<{ imageUrl?: string; codeError?: string }> {
  await assertPaymentAvailable();
  await ensureKnownOrder(orderNo, method);
  const result = await apiRequest<UnifiedOrderData>("/zy/pay/unifiedorder.client", "POST", { orderNo, orderPayType: method });
  const imageUrl = validImageUrl(result.imgUrl);
  return imageUrl ? { imageUrl } : { codeError: "付款码暂不可用，请在原站订单中心继续支付。" };
}

export async function getPaymentStatus(orderNo: string, method: PaymentMethod): Promise<PaymentStatus> {
  await assertPaymentAvailable();
  await ensureKnownOrder(orderNo, method);
  const result = await apiRequest<PayStatusData>("/zy/pay/queryOrderPayStatus", "POST", { orderNo, orderPayType: method });
  const amount = result.orderMoney == null ? undefined : Number(result.orderMoney);
  return {
    status: result.status === "1" ? "paid" : "pending",
    amount: amount != null && Number.isFinite(amount) ? amount : undefined,
    expiresTime: result.expiresTime,
  };
}
