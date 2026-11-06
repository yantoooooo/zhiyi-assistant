import { NextResponse } from "next/server";
import { CheckoutError, type CheckoutItem } from "@/services/cyberantt-checkout";
import { createPaymentOrder } from "@/services/cyberantt-payment";
import type { PaymentMethod } from "@/types/payment";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "请求内容不是有效 JSON。" }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "订单内容不正确。" }, { status: 400 });
  const input = body as Record<string, unknown>;
  const method = input.paymentMethod;
  const requestId = input.requestId;
  const expectedTotal = input.expectedTotal;
  const items = input.items;
  const skipPayment = input.skipPayment === true;
  const ticketIds = input.ticketIds ?? "";
  if ((method !== "1" && method !== "2") || typeof requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(requestId)
    || typeof expectedTotal !== "number" || !Number.isFinite(expectedTotal) || expectedTotal < 0 || !Array.isArray(items) || items.length < 1 || items.length > 12
    || typeof ticketIds !== "string" || (ticketIds && !/^\d{1,24}(,\d{1,24})*$/.test(ticketIds))) {
    return NextResponse.json({ error: "支付方式或订单参数不正确。" }, { status: 400 });
  }
  const normalized: CheckoutItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!item || typeof item !== "object") return NextResponse.json({ error: "商品格式不正确。" }, { status: 400 });
    const { productId, quantity } = item as Record<string, unknown>;
    if (typeof productId !== "string" || !/^\d{1,24}$/.test(productId) || seen.has(productId) || !Number.isInteger(quantity) || Number(quantity) < 1 || Number(quantity) > 99) {
      return NextResponse.json({ error: "商品 ID 或数量不正确。" }, { status: 400 });
    }
    seen.add(productId);
    normalized.push({ productId, quantity: Number(quantity) });
  }
  try {
    const order = await createPaymentOrder(normalized, method as PaymentMethod, expectedTotal, requestId, ticketIds, skipPayment);
    return NextResponse.json(order, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof CheckoutError ? error.status : 502;
    const message = error instanceof CheckoutError ? error.message : "订单提交失败，请先到原站订单中心核对。";
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
