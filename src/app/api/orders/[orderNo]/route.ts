import { NextResponse } from "next/server";
import { CheckoutError } from "@/services/cyberantt-checkout";
import { getOrderDetails } from "@/services/cyberantt-orders";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await context.params;
  try {
    return NextResponse.json(await getOrderDetails(orderNo), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof CheckoutError ? error.message : "订单信息暂不可用。" },
      { status: error instanceof CheckoutError ? error.status : 502, headers: { "Cache-Control": "no-store" } });
  }
}
