import { NextResponse } from "next/server";
import { findRecommendations, makeAssistantReply } from "@/lib/service-recommendations";
import { prepareAttachments, validateAttachments, type AttachmentInput } from "@/services/attachments";
import { generateWithConfiguredModel } from "@/services/llm";
import { getProductCatalog } from "@/services/cyberantt-products";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let text = "";
  let files: AttachmentInput[];
  try {
    const form = await request.formData();
    const rawText = form.get("text");
    text = typeof rawText === "string" ? rawText.trim() : "";
    const uploaded = form.getAll("files").filter((value): value is File => typeof value === "object" && value !== null && "arrayBuffer" in value && "name" in value);
    files = uploaded.map((file) => ({ name: file.name, type: file.type, size: file.size, data: Buffer.alloc(0) }));
    validateAttachments(files);
    files = await Promise.all(uploaded.map(async (file) => ({ name: file.name, type: file.type, size: file.size, data: Buffer.from(await file.arrayBuffer()) })));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "附件请求格式无效。" }, { status: 400 });
  }

  if (!text && !files.length) return NextResponse.json({ error: "请输入问题或添加附件。" }, { status: 400 });
  if (text.length > 4000) return NextResponse.json({ error: "单条消息最多 4000 个字符。" }, { status: 413 });

  let prepared;
  try {
    prepared = await prepareAttachments(files);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? `无法读取附件：${error.message}` : "无法读取附件。" }, { status: 400 });
  }

  const query = [text || "请查看并分析我上传的附件。", prepared.documentText].filter(Boolean).join("\n\n");
  try {
    const catalog = await getProductCatalog();
    const recommendations = findRecommendations(query, catalog.products);
    const generated = await generateWithConfiguredModel(query, { images: prepared.images, catalog: catalog.products });
    if (generated) {
      const productIds = recommendations.length ? recommendations.map((product) => product.id) : generated.productIds;
      return NextResponse.json({ text: generated.text, productIds, mode: "model", model: generated.provider });
    }
    if (prepared.images.length) return NextResponse.json({ error: "图片已收到，但暂未配置视觉模型。请设置 CHAT_VISION_MODEL 并配置可用的大模型 API Key。" }, { status: 503 });
    return NextResponse.json({ text: makeAssistantReply(query, recommendations, catalog.source === "test-api"), productIds: recommendations.map((product) => product.id), mode: catalog.source });
  } catch (error) {
    console.error("Configured chat model failed:", error instanceof Error ? error.message : "unknown error");
    if (prepared.images.length) return NextResponse.json({ error: "图片已收到，但当前视觉模型无法读取。请检查 CHAT_VISION_MODEL 配置与模型权限。" }, { status: 503 });
    const catalog = await getProductCatalog();
    const recommendations = findRecommendations(query, catalog.products);
    return NextResponse.json({ text: `${makeAssistantReply(query, recommendations, catalog.source === "test-api")}（模型暂不可用，当前由基础规则回复。）`, productIds: recommendations.map((product) => product.id), mode: "local-fallback" });
  }

}
