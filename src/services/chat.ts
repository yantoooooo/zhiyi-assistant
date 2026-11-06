import type { Message } from "@/types/chat";
import { createClientId } from "@/lib/client-id";

export type ChatResponse = {
  userMessage: Message;
  assistantMessage: Message;
};

/** Browser chat client. The server route selects a configured provider or local simulation. */
export async function respondToMessage(text: string, files: File[] = []): Promise<ChatResponse> {
  const query = text.trim();
  const body: FormData | string = files.length ? new FormData() : JSON.stringify({ text: query });
  let endpoint = "/api/chat";
  if (body instanceof FormData) {
    body.set("text", query);
    files.forEach((file) => body.append("files", file));
    endpoint = "/api/chat/attachments";
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 65_000);
  let response: Response;
  try {
    response = await fetch(endpoint, { method: "POST", headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" }, body, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("请求等待超时，请稍后重试；您的消息和附件名称仍保留在本地对话中。");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
  const payload = await response.json() as { text?: unknown; productIds?: unknown; error?: unknown };
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "聊天服务暂时不可用。");
  if (typeof payload.text !== "string") throw new Error("聊天服务返回了无效内容。");
  const productIds = Array.isArray(payload.productIds) ? payload.productIds.filter((id): id is string => typeof id === "string") : [];
  return {
    userMessage: { id: createClientId(), role: "user", text: query, attachments: files.map(({ name, type, size }) => ({ name, type, size })) },
    assistantMessage: {
      id: createClientId(),
      role: "assistant",
      text: payload.text,
      productIds,
    },
  };
}
