import { NextResponse } from "next/server";
import { getProductCatalog } from "@/services/cyberantt-products";

export const runtime = "nodejs";

export async function GET() {
  const catalog = await getProductCatalog();
  return NextResponse.json(catalog, {
    headers: { "Cache-Control": "no-store" },
  });
}
