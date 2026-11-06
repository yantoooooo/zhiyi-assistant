import type { Message, PersistedConversation, PersistedWorkspace } from "@/types/chat";

const STORAGE_KEY = "zhiyi-demo-chat-v2";
const LEGACY_STORAGE_KEYS = ["zhiyi-demo-chat-v1", "eufuwu-demo-chat-v1"];

function sanitizeMessages(value: unknown): Message[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((message): message is Message => Boolean(message && typeof message === "object")
      && typeof (message as Message).id === "string"
      && ((message as Message).role === "user" || (message as Message).role === "assistant")
      && typeof (message as Message).text === "string"
      && (message as Message).accountPrivate !== true)
    .map((message) => {
      const validProductIds = Array.isArray(message.productIds) ? message.productIds.filter((id): id is string => typeof id === "string").slice(0, 30) : [];
      const attachments = Array.isArray(message.attachments)
        ? message.attachments.filter((item) => item && typeof item.name === "string" && typeof item.type === "string" && typeof item.size === "number").slice(0, 5).map(({ name, type, size }) => ({ name: name.slice(0, 180), type: type.slice(0, 120), size: Math.max(0, Math.min(size, 20 * 1024 * 1024)) }))
        : undefined;
      const selectedQuantities = sanitizeQuantities(message.selectedQuantities);
      return {
        ...message,
        attachments,
        productIds: validProductIds.length ? validProductIds : undefined,
        selectedQuantities: Object.fromEntries(Object.entries(selectedQuantities).filter(([id]) => validProductIds.includes(id))),
      };
    });
}

function sanitizeQuantities(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([id, quantity]) => typeof id === "string" && typeof quantity === "number" && Number.isFinite(quantity) && quantity > 0)
    .map(([id, quantity]) => [id, Math.min(99, Math.floor(quantity as number))]));
}

function titleFromMessages(messages: Message[]) {
  return messages.find((message) => message.role === "user")?.text.slice(0, 48) || "新对话";
}

function migrateSelections(messages: Message[], legacyQuantities: unknown): Message[] {
  const quantities = sanitizeQuantities(legacyQuantities);
  if (!Object.keys(quantities).length) return messages;
  const updated = messages.map((message) => ({ ...message, selectedQuantities: { ...message.selectedQuantities } }));
  for (const [productId, quantity] of Object.entries(quantities)) {
    const lastRecommendation = updated.findLast((message) => message.role === "assistant" && message.productIds?.includes(productId));
    if (lastRecommendation) lastRecommendation.selectedQuantities![productId] = quantity;
  }
  return updated;
}

function latestSelectedRecommendation(messages: Message[]): string | null {
  return [...messages].reverse().find((message) => message.role === "assistant" && Object.keys(message.selectedQuantities ?? {}).length > 0)?.id ?? null;
}

function sanitizeConversation(value: unknown): PersistedConversation | null {
  if (!value || typeof value !== "object") return null;
  const conversation = value as Partial<PersistedConversation> & { quantities?: unknown; orderConfirmed?: unknown };
  if (typeof conversation.id !== "string") return null;
  const storedMessages = migrateSelections(sanitizeMessages(conversation.messages), conversation.quantities);
  const untouchedWelcome = conversation.id === "welcome-conversation"
    && storedMessages.length === 2
    && storedMessages[0].id === "welcome-user"
    && storedMessages[1].id === "welcome-assistant"
    && Object.keys(storedMessages[1].selectedQuantities ?? {}).length === 0;
  const messages = untouchedWelcome ? [] : storedMessages;
  const confirmedOrderMessageId = typeof conversation.confirmedOrderMessageId === "string"
    ? conversation.confirmedOrderMessageId
    : conversation.orderConfirmed ? latestSelectedRecommendation(messages) : null;
  return {
    id: conversation.id,
    title: untouchedWelcome ? "新对话" : typeof conversation.title === "string" ? conversation.title : titleFromMessages(messages),
    updatedAt: typeof conversation.updatedAt === "number" ? conversation.updatedAt : 0,
    messages,
    confirmedOrderMessageId: messages.some((message) => message.id === confirmedOrderMessageId) ? confirmedOrderMessageId : null,
  };
}

export function loadWorkspace(): PersistedWorkspace | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const value: unknown = JSON.parse(raw);
      if (value && typeof value === "object") {
        const state = value as Partial<PersistedWorkspace>;
        const conversations = Array.isArray(state.conversations)
          ? state.conversations.map(sanitizeConversation).filter((item): item is PersistedConversation => item !== null)
          : [];
        if (conversations.length) {
          const activeConversationId = conversations.some((item) => item.id === state.activeConversationId)
            ? state.activeConversationId as string
            : conversations[0].id;
          return { conversations, activeConversationId };
        }
      }
    }

    for (const key of LEGACY_STORAGE_KEYS) {
      const legacyRaw = window.localStorage.getItem(key);
      if (!legacyRaw) continue;
      const legacy: unknown = JSON.parse(legacyRaw);
      if (!legacy || typeof legacy !== "object") continue;
      const state = legacy as { messages?: unknown; quantities?: unknown; orderConfirmed?: unknown };
      const messages = migrateSelections(sanitizeMessages(state.messages), state.quantities);
      const conversation: PersistedConversation = {
        id: "migrated-conversation",
        title: titleFromMessages(messages),
        updatedAt: Date.now(),
        messages,
        confirmedOrderMessageId: state.orderConfirmed ? latestSelectedRecommendation(messages) : null,
      };
      return { conversations: [conversation], activeConversationId: conversation.id };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveWorkspace(state: PersistedWorkspace) {
  try {
    const safeState = {
      ...state,
      conversations: state.conversations.map((conversation) => ({
        ...conversation,
        messages: conversation.messages.filter((message) => !message.accountPrivate),
      })),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safeState));
  } catch {
    // Storage may be unavailable in private browsing or when the quota is full.
  }
}
