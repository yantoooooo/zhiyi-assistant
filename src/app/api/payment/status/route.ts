import { NextResponse } from "next/server";
import { CheckoutError } from "@/services/cyberantt-checkout";
import { getPaymentStatus } from "@/services/cyberantt-payment";
import type { PaymentMethod } from "@/types/payment";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "请求内容不是有效 JSON。" }, { status: 400 }); }
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  if (typeof input.orderNo !== "string" || !/^[A-Za-z0-9-]{1,80}$/.test(input.orderNo) || (input.paymentMethod !== "1" && input.paymentMethod !== "2")) {
    return NextResponse.json({ error: "订单号或支付方式不正确。" }, { status: 400 });
  }
  try {
    return NextResponse.json(await getPaymentStatus(input.orderNo, input.paymentMethod as PaymentMethod), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof CheckoutError ? error.message : "支付状态暂不可用。" }, { status: error instanceof CheckoutError ? error.status : 502 });
  }
}
