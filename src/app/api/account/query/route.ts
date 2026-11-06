import { NextRequest, NextResponse } from "next/server";
import { apiRequest, CheckoutError } from "@/services/cyberantt-checkout";

export const dynamic = "force-dynamic";

type Page = { records?: unknown[] };

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "当前环境暂不支持账号查询" }, { status: 403 });
  }
  const kind = request.nextUrl.searchParams.get("kind");
  if (kind !== "orders" && kind !== "progress") {
    return NextResponse.json({ error: "查询类型无效" }, { status: 400 });
  }
  try {
    const path = kind === "orders" ? "/zy/profile/order/list" : "/zy/workbench/progressList";
    const params = kind === "orders"
      ? { orderType: "0", pageIndex: 1, pageSize: 10, searchKey: "" }
      : { pageIndex: 1, pageSize: 10, searchKey: "" };
    const data = await apiRequest<Page>(path, "POST", params);
    return NextResponse.json({ data: { records: Array.isArray(data.records) ? data.records.slice(0, 10) : [] } }, {
      headers: { "Cache-Control": "no-store, private" },
    });
  } catch (error) {
    const message = error instanceof CheckoutError ? error.message : "账号查询暂不可用，请稍后重试。";
    const status = error instanceof CheckoutError ? error.status : 502;
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store, private" } });
  }
}
