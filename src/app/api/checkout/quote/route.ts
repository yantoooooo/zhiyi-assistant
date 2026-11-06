import { NextResponse } from "next/server";
import { CheckoutError, getCheckoutQuote, type CheckoutItem } from "@/services/cyberantt-checkout";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "请求内容不是有效 JSON。" }, { status: 400 }); }
  const items = body && typeof body === "object" && "items" in body ? (body as { items: unknown }).items : null;
  const ticketIds = body && typeof body === "object" && "ticketIds" in body ? (body as { ticketIds: unknown }).ticketIds : "";
  if (!Array.isArray(items) || items.length < 1 || items.length > 12) {
    return NextResponse.json({ error: "请选择 1 至 12 项商品。" }, { status: 400 });
  }
  if (typeof ticketIds !== "string" || (ticketIds && !/^\d{1,24}(,\d{1,24})*$/.test(ticketIds))) {
    return NextResponse.json({ error: "优惠券 ID 不正确。" }, { status: 400 });
  }
  const normalized: CheckoutItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!item || typeof item !== "object") return NextResponse.json({ error: "商品格式不正确。" }, { status: 400 });
    const { productId, quantity } = item as Record<string, unknown>;
    if (typeof productId !== "string" || !/^\d{1,24}$/.test(productId) || seen.has(productId) || !Number.isInteger(quantity) || Number(quantity) < 1 || Number(quantity) > 99) {
      return NextResponse.json({ error: "商品 ID 或数量不正确。" }, { status: 400 });
    }
    normalized.push({ productId, quantity: Number(quantity) });
    seen.add(productId);
  }
  try {
    const quote = await getCheckoutQuote(normalized, ticketIds);
    return NextResponse.json(quote, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof CheckoutError ? error.status : 502;
    const message = error instanceof CheckoutError ? error.message : "结算接口暂不可用，请稍后重试。";
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
