import { NextResponse } from "next/server";
import { assertPaymentAvailable } from "@/services/cyberantt-payment";

export const runtime = "nodejs";

export async function GET() {
  try {
    await assertPaymentAvailable();
    return NextResponse.json({ available: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ available: false, reason: error instanceof Error ? error.message : "支付接口暂不可用。" }, { headers: { "Cache-Control": "no-store" } });
  }
}
