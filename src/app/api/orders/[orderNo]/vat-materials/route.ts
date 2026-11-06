import { NextResponse } from "next/server";
import { CheckoutError } from "@/services/cyberantt-checkout";
import { getVatMaterials, saveVatMaterials } from "@/services/cyberantt-orders";
import type { VatMaterialFields } from "@/types/order";

export const runtime = "nodejs";

const FIELD_KEYS: (keyof VatMaterialFields)[] = [
  "companyName", "companyNameEn", "companyYyzzNo", "companyAddrCn", "companyAddrEn",
  "companyLegal", "companyLegalEn", "companyContactsMobile", "companyContactsNameEmail",
];

function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof CheckoutError ? error.message : "VAT 资料接口暂不可用。" },
    { status: error instanceof CheckoutError ? error.status : 502, headers: { "Cache-Control": "no-store" } });
}

export async function GET(_request: Request, context: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await context.params;
  try { return NextResponse.json(await getVatMaterials(orderNo), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return failure(error); }
}

export async function POST(request: Request, context: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await context.params;
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "资料格式不正确。" }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "资料格式不正确。" }, { status: 400 });
  const input = body as Record<string, unknown>;
  const fields = {} as VatMaterialFields;
  for (const key of FIELD_KEYS) {
    const value = input[key];
    if (typeof value !== "string" || value.length > 500) return NextResponse.json({ error: `${key} 格式不正确或过长。` }, { status: 400 });
    fields[key] = value;
  }
  if (fields.companyContactsNameEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.companyContactsNameEmail.trim())) {
    return NextResponse.json({ error: "联系邮箱格式不正确。" }, { status: 400 });
  }
  try {
    await saveVatMaterials(orderNo, fields);
    return NextResponse.json({ saved: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
