import { NextResponse } from "next/server";
import { findRecommendations, makeAssistantReply } from "@/lib/service-recommendations";
import { generateWithConfiguredModel } from "@/services/llm";
import { getProductCatalog } from "@/services/cyberantt-products";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求内容不是有效 JSON。" }, { status: 400 });
  }

  const text = body && typeof body === "object" && "text" in body && typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "请输入需要咨询的内容。" }, { status: 400 });
  if (text.length > 4000) return NextResponse.json({ error: "单条消息最多 4000 个字符。" }, { status: 413 });

  try {
    const catalog = await getProductCatalog();
    const recommendations = findRecommendations(text, catalog.products);
    const generated = await generateWithConfiguredModel(text, { catalog: catalog.products });
    if (generated) return NextResponse.json({ text: generated.text, productIds: recommendations.map((product) => product.id), mode: "model", model: generated.provider });
    return NextResponse.json({ text: makeAssistantReply(text, recommendations, catalog.source === "test-api"), productIds: recommendations.map((product) => product.id), mode: catalog.source });
  } catch (error) {
    console.error("Configured chat model failed:", error instanceof Error ? error.message : "unknown error");
    const catalog = await getProductCatalog();
    const recommendations = findRecommendations(text, catalog.products);
    return NextResponse.json({
      text: `${makeAssistantReply(text, recommendations, catalog.source === "test-api")}（模型暂不可用，当前由基础规则回复。）`,
      productIds: recommendations.map((product) => product.id),
      mode: catalog.source === "test-api" ? "test-api-fallback" : "local-fallback",
    });
  }
}
