"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { ArrowRight, ArrowUp, Check, CircleHelp, History, LoaderCircle, Maximize2, MessageSquarePlus, Minimize2, Paperclip, Plus, ShieldCheck, X } from "lucide-react";
import Image from "next/image";
import { ProductCard } from "@/components/product-card";
import { PriceBreakdown } from "@/components/price-breakdown";
import { CheckoutDialog } from "@/components/checkout-dialog";
import { ChatLanding } from "@/components/chat-landing";
import { AssistantAnswer } from "@/components/assistant-answer";
import { AccountQueryAnswer } from "@/components/account-query-answer";
import { DeleteConversationDialog } from "@/components/delete-conversation-dialog";
import { HistoryConversationItem } from "@/components/history-conversation-item";
import { formatProductPrice, type Product } from "@/data/products";
import { calculateOrderSummary } from "@/lib/order-summary";
import { hideProductIds } from "@/lib/answer-visibility";
import { createClientId } from "@/lib/client-id";
import { getRelatedProducts } from "@/lib/related-products";
import { useCustomerProfile } from "@/hooks/use-customer-profile";
import { loadWorkspace, saveWorkspace } from "@/lib/workspace-storage";
import { respondToMessage } from "@/services/chat";
import { isAccountQuery, respondToAccountQuery } from "@/services/account-queries";
import type { Message, PersistedConversation } from "@/types/chat";
import type { CheckoutQuote } from "@/types/checkout";

const initialMessages: Message[] = [];
const initialConversation: PersistedConversation = {
  id: "welcome-conversation",
  title: "新对话",
  updatedAt: 0,
  messages: initialMessages,
  confirmedOrderMessageId: null,
};

function formatTotals(groups: Array<{ currencyCode: string; currencyName: string; total: number }>) {
  return groups.map((group) => formatProductPrice(group.total, group.currencyName)).join(" / ");
}

export function ChatWorkspace() {
  const customerProfile = useCustomerProfile();
  const [conversations, setConversations] = useState<PersistedConversation[]>([initialConversation]);
  const [activeConversationId, setActiveConversationId] = useState(initialConversation.id);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [historyPending, startHistoryTransition] = useTransition();
  const [pendingConversationId, setPendingConversationId] = useState<string | null>(null);
  const [showOrder, setShowOrder] = useState(false);
  const [checkoutMessageId, setCheckoutMessageId] = useState<string | null>(null);
  const [quoteState, setQuoteState] = useState<{ key: string; quote: CheckoutQuote } | null>(null);
  const [requestedTicketIds, setRequestedTicketIds] = useState("");
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [quoteRetry, setQuoteRetry] = useState(0);
  const [confirmedMessageId, setConfirmedMessageId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [compactMode, setCompactMode] = useState(true);
  const [widgetClosed, setWidgetClosed] = useState(true);
  const [compactHistoryOpen, setCompactHistoryOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PersistedConversation | null>(null);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [detailMessageId, setDetailMessageId] = useState<string | null>(null);
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [catalogSource, setCatalogSource] = useState<"test-api" | "unavailable">("unavailable");
  const [catalogNotice, setCatalogNotice] = useState("正在连接商品接口…");
  const [sending, setSending] = useState(false);
  const [revealing, setRevealing] = useState<{ messageId: string; text: string; visible: number; total: number } | null>(null);
  const sendingRef = useRef(false);
  const wasRevealingRef = useRef(false);
  const followRevealRef = useRef(true);
  const activeConversationIdRef = useRef(initialConversation.id);
  const accountIdentityRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const landingInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const latestMessageId = messages.at(-1)?.id;
  const showLanding = !compactMode && messages.length === 0;
  const accountIdentity = customerProfile ? `${customerProfile.id ?? ""}|${customerProfile.maskedMobile ?? ""}|${customerProfile.name}` : null;
  const currentConversation = useMemo<PersistedConversation>(() => ({
    id: activeConversationId,
    title: messages.find((message) => message.role === "user")?.text.slice(0, 48) || "新对话",
    updatedAt: conversations.find((conversation) => conversation.id === activeConversationId)?.updatedAt ?? 0,
    messages,
    confirmedOrderMessageId: confirmedMessageId,
  }), [activeConversationId, messages, confirmedMessageId, conversations]);
  const recentConversations = useMemo(() => conversations.map((conversation) => conversation.id === activeConversationId ? currentConversation : conversation), [conversations, activeConversationId, currentConversation]);

  useEffect(() => {
    if (accountIdentityRef.current && accountIdentityRef.current !== accountIdentity) {
      setMessages((current) => current.filter((message) => !message.accountPrivate));
      setConversations((current) => current.map((conversation) => ({ ...conversation, messages: conversation.messages.filter((message) => !message.accountPrivate) })));
    }
    accountIdentityRef.current = accountIdentity;
  }, [accountIdentity]);

  useEffect(() => {
    const saved = loadWorkspace();
    if (saved) {
      setConversations(saved.conversations);
      setActiveConversationId(saved.activeConversationId);
      activeConversationIdRef.current = saved.activeConversationId;
      const active = saved.conversations.find((conversation) => conversation.id === saved.activeConversationId);
      if (active) {
        setMessages(active.messages);
        setConfirmedMessageId(active.confirmedOrderMessageId ?? null);
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveWorkspace({ conversations: recentConversations, activeConversationId });
  }, [hydrated, recentConversations, activeConversationId]);

  useEffect(() => {
    if (pendingConversationId === activeConversationId && !historyPending) setPendingConversationId(null);
  }, [pendingConversationId, activeConversationId, historyPending]);

  useEffect(() => {
    if (window.parent !== window) {
      window.parent.postMessage({ type: "zhiyi.widget.view", view: widgetClosed ? "closed" : compactMode ? "compact" : "full" }, "*");
    }
  }, [widgetClosed, compactMode]);

  useEffect(() => {
    if (!showOrder && !detailProduct && !deleteTarget) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { setShowOrder(false); setDetailProduct(null); setDeleteTarget(null); }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showOrder, detailProduct, deleteTarget]);

  useLayoutEffect(() => {
    if (!hydrated || !conversationRef.current) return;
    if (showLanding) { conversationRef.current.scrollTop = 0; return; }
    conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
  }, [hydrated, activeConversationId, compactMode, showLanding, widgetClosed]);

  useLayoutEffect(() => {
    if (!hydrated || !conversationRef.current) return;
    conversationRef.current.querySelectorAll<HTMLElement>("[data-product-rail]").forEach((rail) => {
      rail.scrollLeft = 0;
    });
  }, [hydrated, activeConversationId, compactMode, latestMessageId, widgetClosed]);

  useEffect(() => {
    if (!hydrated || !conversationRef.current || !latestMessageId) return;
    conversationRef.current.scrollTo({ top: conversationRef.current.scrollHeight, behavior: "smooth" });
  }, [latestMessageId, hydrated]);

  const revealingMessageId = revealing?.messageId;
  const revealingTotal = revealing?.total ?? 0;
  useEffect(() => {
    if (!revealingMessageId || !revealingTotal) return;
    const step = Math.max(1, Math.ceil(revealingTotal / 95));
    const timer = window.setInterval(() => {
      setRevealing((current) => {
        if (!current || current.messageId !== revealingMessageId) return current;
        const visible = Math.min(current.total, current.visible + step);
        return visible === current.total ? null : { ...current, visible };
      });
    }, 35);
    return () => window.clearInterval(timer);
  }, [revealingMessageId, revealingTotal]);

  useLayoutEffect(() => {
    const container = conversationRef.current;
    if (!hydrated || !container) return;
    if (revealing) {
      if (!wasRevealingRef.current) {
        followRevealRef.current = true;
      } else if (container.scrollHeight - container.scrollTop - container.clientHeight > 160) {
        followRevealRef.current = false;
      }
      if (followRevealRef.current) container.scrollTop = container.scrollHeight;
    } else if (wasRevealingRef.current && followRevealRef.current) {
      container.scrollTop = container.scrollHeight;
    }
    wasRevealingRef.current = Boolean(revealing);
  }, [hydrated, revealing]);

  useEffect(() => {
    let active = true;
    void fetch("/api/products", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json() as { products?: Product[]; source?: "test-api" | "unavailable"; notice?: string };
      })
      .then((result) => {
        if (!active || !Array.isArray(result.products)) return;
        setCatalogProducts(result.products);
        setCatalogSource(result.source === "test-api" ? "test-api" : "unavailable");
        setCatalogNotice(result.notice ?? (result.source === "test-api" ? "" : "商品接口暂不可用，暂时无法加载商品。"));
      })
      .catch(() => { if (active) { setCatalogProducts([]); setCatalogSource("unavailable"); setCatalogNotice("商品接口暂不可用，暂时无法加载商品。"); } });
    return () => { active = false; };
  }, []);

  const summariesByMessage = useMemo(() => new Map(messages
    .filter((message) => message.role === "assistant" && message.productIds?.length)
    .map((message) => [message.id, calculateOrderSummary(message.selectedQuantities ?? {}, catalogProducts, message.productIds)])), [messages, catalogProducts]);
  const relatedProducts = useMemo(() => getRelatedProducts(messages, catalogProducts), [messages, catalogProducts]);
  const checkoutMessage = messages.find((message) => message.id === checkoutMessageId);
  const checkoutSummary = checkoutMessageId ? summariesByMessage.get(checkoutMessageId) : undefined;
  const { selected = [], itemCount = 0, groups = [] } = checkoutSummary ?? {};
  const checkoutItems = selected.map((product) => ({ productId: product.id, quantity: checkoutMessage?.selectedQuantities?.[product.id] ?? 0 }));
  const quoteRequestKey = JSON.stringify({ items: checkoutItems, ticketIds: requestedTicketIds });
  const quote = quoteState?.key === quoteRequestKey ? quoteState.quote : null;
  const needsQuote = catalogSource === "test-api" && selected.length > 0 && selected.every((product) => product.dataSource === "test-api");
  useEffect(() => {
    if (!showOrder || !needsQuote) return;
    let active = true;
    const controller = new AbortController();
    setQuoteLoading(true);
    setQuoteError("");
    setQuoteState(null);
    void fetch("/api/checkout/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: quoteRequestKey,
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      const result = await response.json() as CheckoutQuote & { error?: string };
      if (!response.ok) throw new Error(result.error || `结算接口返回 HTTP ${response.status}`);
      return result;
    }).then((result) => { if (active) setQuoteState({ key: quoteRequestKey, quote: result }); })
      .catch((error) => { if (active) setQuoteError(error instanceof Error ? error.message : "结算接口暂不可用，请稍后重试。"); })
      .finally(() => { if (active) setQuoteLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [showOrder, quoteRequestKey, needsQuote, quoteRetry]);
  const catalogPriceLabel = "人民币参考价";
  const detailDisplayQuantity = Math.max(1, detailProduct && detailMessageId
    ? (messages.find((message) => message.id === detailMessageId)?.selectedQuantities?.[detailProduct.id] ?? 0)
    : 0);
  function updateQuantity(messageId: string, productId: string, next: number) {
    if (confirmedMessageId === messageId) setConfirmedMessageId(null);
    if (showOrder && checkoutMessageId === messageId) setRequestedTicketIds("");
    setMessages((current) => current.map((message) => {
      if (message.id !== messageId || message.role !== "assistant" || !message.productIds?.includes(productId)) return message;
      const selectedQuantities = { ...message.selectedQuantities };
      const value = Math.max(0, Math.min(99, next));
      if (value === 0) delete selectedQuantities[productId];
      else selectedQuantities[productId] = value;
      return { ...message, selectedQuantities };
    }));
  }

  function handleFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    const allowed = /\.(pdf|docx|txt|md|csv|jpe?g|png|webp|gif)$/i;
    const accepted = picked.filter((file) => {
      if (!allowed.test(file.name)) { showToast(`暂不支持 ${file.name}，请选择图片、PDF、Word 或文本文件`); return false; }
      if (file.size > 10 * 1024 * 1024) { showToast(`${file.name} 超过 10 MB 限制`); return false; }
      return true;
    });
    setSelectedFiles((current) => {
      const merged = [...current, ...accepted];
      if (merged.length > 5) { showToast("一次最多上传 5 个附件"); return merged.slice(0, 5); }
      if (merged.reduce((sum, file) => sum + file.size, 0) > 20 * 1024 * 1024) { showToast("附件总大小不能超过 20 MB"); return current; }
      return merged;
    });
  }

  async function sendMessage(event?: FormEvent<HTMLFormElement>, text = draft) {
    event?.preventDefault();
    const query = text.trim();
    const filesToSend = selectedFiles;
    if (!query && !filesToSend.length) {
      if (showLanding) landingInputRef.current?.focus();
      else inputRef.current?.focus();
      return;
    }
    if (sendingRef.current) return;
    setRevealing(null);
    const requestConversationId = activeConversationId;
    const accountQuery = isAccountQuery(query) && filesToSend.length === 0;
    const requestAccountIdentity = accountIdentityRef.current;
    const userMessage: Message = { id: createClientId(), role: "user", text: query, attachments: filesToSend.map(({ name, type, size }) => ({ name, type, size })) };
    sendingRef.current = true;
    setSending(true);
    setDraft("");
    setSelectedFiles([]);
    setConversations((current) => {
      const active = current.find((conversation) => conversation.id === requestConversationId) ?? currentConversation;
      return [{ ...active, updatedAt: Date.now() }, ...current.filter((conversation) => conversation.id !== requestConversationId)];
    });
    setMessages((current) => [...current, userMessage]);
    try {
      const assistantMessage = accountQuery
        ? requestAccountIdentity ? await respondToAccountQuery(query, customerProfile?.source) : { id: createClientId(), role: "assistant" as const, text: "请先在官网登录，再从官网打开智能小蚁查询个人订单和服务进度。", accountPrivate: true }
        : (await respondToMessage(query, filesToSend)).assistantMessage;
      if (activeConversationIdRef.current === requestConversationId && (!accountQuery || accountIdentityRef.current === requestAccountIdentity)) {
        if (!assistantMessage.accountPrivate) {
          const textForDisplay = hideProductIds(assistantMessage.text, [...(assistantMessage.productIds ?? []), ...catalogProducts.map((product) => product.id)]);
          const total = Array.from(textForDisplay).length;
          if (total > 2) setRevealing({ messageId: assistantMessage.id, text: textForDisplay, visible: Math.min(2, total), total });
        }
        setMessages((current) => [...current, assistantMessage]);
      }
    } catch (error) {
      if (activeConversationIdRef.current === requestConversationId) {
        setMessages((current) => [...current,
          { id: createClientId(), role: "assistant", text: error instanceof Error ? `${error.message} 您的消息和附件名称已保留在本地对话中。` : "暂时无法生成回复，请稍后重试。您的消息已保留在本地对话中。" },
        ]);
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  function startNewChat() {
    setRevealing(null);
    const newConversation: PersistedConversation = {
      id: createClientId(),
      title: "新对话",
      updatedAt: Date.now(),
      messages: [],
      confirmedOrderMessageId: null,
    };
    setConversations((current) => [newConversation, ...current.map((conversation) => conversation.id === activeConversationId ? currentConversation : conversation)]);
    activeConversationIdRef.current = newConversation.id;
    setActiveConversationId(newConversation.id);
    setMessages([]);
    setShowOrder(false);
    setCheckoutMessageId(null);
    setConfirmedMessageId(null);
    window.setTimeout(() => { if (compactMode) inputRef.current?.focus(); else landingInputRef.current?.focus(); }, 0);
  }

  function openConversation(conversation: PersistedConversation) {
    if (conversation.id === activeConversationId) { setCompactHistoryOpen(false); return; }
    if (historyPending) return;
    if (conversation.id === pendingConversationId) return;
    setRevealing(null);
    setPendingConversationId(conversation.id);
    activeConversationIdRef.current = conversation.id;
    startHistoryTransition(() => {
      setConversations((current) => current.map((item) => item.id === activeConversationId ? currentConversation : item));
      setActiveConversationId(conversation.id);
      setMessages(conversation.messages);
      setConfirmedMessageId(conversation.confirmedOrderMessageId ?? null);
      setShowOrder(false);
      setCheckoutMessageId(null);
      setCompactHistoryOpen(false);
    });
  }

  function deleteConversation() {
    if (!deleteTarget) return;
    const remaining = recentConversations.filter((conversation) => conversation.id !== deleteTarget.id);
    if (deleteTarget.id === activeConversationId) {
      setRevealing(null);
      const next = remaining[0] ?? { id: createClientId(), title: "新对话", updatedAt: Date.now(), messages: [], confirmedOrderMessageId: null };
      activeConversationIdRef.current = next.id;
      setActiveConversationId(next.id);
      setMessages(next.messages);
      setConfirmedMessageId(next.confirmedOrderMessageId ?? null);
      setShowOrder(false);
      setCheckoutMessageId(null);
    }
    setConversations(remaining);
    setCompactHistoryOpen(false);
    setDeleteTarget(null);
    showToast("历史对话已删除");
  }

  function openOrderSummary(messageId: string | null) {
    const summary = messageId ? summariesByMessage.get(messageId) : null;
    if (!summary?.itemCount) {
      showToast("请先选择至少一项服务");
      return;
    }
    setCheckoutMessageId(messageId);
    setRequestedTicketIds("");
    setShowOrder(true);
  }

  function openWidget() {
    setCompactMode(true);
    setWidgetClosed(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function closeWidget() {
    setWidgetClosed(true);
    setCompactHistoryOpen(false);
    setShowOrder(false);
    setDetailProduct(null);
  }

  return widgetClosed ? (
    <main className="widget-launcher-shell" id="top">
      <button className="widget-launcher" type="button" onClick={openWidget} aria-label="打开智能小蚁问答" title="问小蚁">
        <span className="widget-launcher-logo" aria-hidden="true"><Image src="/brand/zhiyi-icon-white.png" alt="" width={38} height={39} /></span>
        <span className="widget-launcher-label">问小蚁</span>
        <span className="widget-launcher-dots" aria-hidden="true"><span /><span /><span /><span /><span /></span>
      </button>
    </main>
  ) : (
    <main className={`app-shell ${compactMode ? "compact-mode" : ""}`} id="top">
      <aside className="sidebar">
        <a className="brand" href="#top" aria-label="智蚁首页"><Image src="/brand/zhiyi-icon-orange.png" alt="" width={32} height={33} priority /><span className="brand-name">智蚁<span>AI SERVICE</span></span></a>
        <button className="new-chat" onClick={startNewChat}><MessageSquarePlus size={17} /> 新对话</button>
        <div className="history-heading"><span>历史对话 <small className="history-storage-note">本机保存</small></span><span className="history-count">{hydrated ? recentConversations.length : "…"}</span></div>
        <div className="history-list">{!hydrated ? <div className="history-loading" role="status"><LoaderCircle size={15} className="typing-spinner" />正在加载历史对话…</div> : recentConversations.map((conversation) => <HistoryConversationItem key={conversation.id} conversation={conversation} active={activeConversationId === conversation.id} loading={historyPending && pendingConversationId === conversation.id} onOpen={() => openConversation(conversation)} onDelete={() => setDeleteTarget(conversation)} />)}</div>
        <div className="sidebar-bottom"><a className="help-card" href="https://work.weixin.qq.com/ca/cawcde1a9ca59467e6" target="_blank" rel="noopener noreferrer"><span className="help-icon">?</span><div><strong>需要帮助？</strong><small>联系专属服务顾问</small></div></a><div className="profile"><span className="avatar">{customerProfile?.name.slice(0, 1) ?? "访"}</span><span><strong>{customerProfile?.name ?? "访客"}</strong><small>{customerProfile?.source === "configured-test-token" ? `账号预览 · ${customerProfile.maskedMobile ?? "已登录"}` : customerProfile?.companyName || customerProfile?.maskedMobile || (customerProfile ? "企业客户" : "未关联官网账号")}</small></span></div></div>
      </aside>
      <section className={`main-panel ${compactMode ? "compact-window" : ""} ${showLanding ? "full-empty" : ""}`}>
        <header className="topbar"><div className="breadcrumb">{compactMode ? <span className="compact-brand-lockup"><Image src="/brand/zhiyi-icon-orange.png" alt="" width={28} height={29} priority /><span><strong>智蚁</strong><small>AI SERVICE</small></span></span> : <strong>新对话</strong>}</div><div className="topbar-right">{compactMode ? <><button className="compact-header-action" onClick={startNewChat} aria-label="新对话" title="新对话"><Plus size={18} /></button><button className={`compact-header-action ${compactHistoryOpen ? "selected" : ""}`} onClick={() => setCompactHistoryOpen((open) => !open)} aria-label="历史对话" title="历史对话"><History size={17} /></button><button className="compact-header-action" onClick={() => { setCompactMode(false); setCompactHistoryOpen(false); setShowOrder(false); setDetailProduct(null); }} aria-label="完整工作区" title="完整工作区"><Maximize2 size={18} /></button><button className="compact-header-action compact-close-action" onClick={closeWidget} aria-label="关闭问答小窗" title="关闭"><X size={19} /></button></> : <button className="compact-toggle" onClick={() => { setCompactMode(true); setShowOrder(false); setDetailProduct(null); }} aria-label="切换小窗问答" title="小窗问答"><Minimize2 size={16} /><span>小窗问答</span></button>}</div>{compactMode && compactHistoryOpen && <div className="compact-history-popover"><div className="compact-history-heading"><strong>历史对话 <small className="history-storage-note">本机保存</small></strong><span>{hydrated ? recentConversations.length : "…"}</span></div>{!hydrated ? <div className="history-loading" role="status"><LoaderCircle size={15} className="typing-spinner" />正在加载历史对话…</div> : recentConversations.map((conversation) => <HistoryConversationItem key={conversation.id} conversation={conversation} active={activeConversationId === conversation.id} loading={historyPending && pendingConversationId === conversation.id} compact onOpen={() => openConversation(conversation)} onDelete={() => setDeleteTarget(conversation)} />)}</div>}</header>
        <input ref={fileInputRef} className="hidden-file-input" type="file" accept=".pdf,.docx,.txt,.md,.csv,.jpg,.jpeg,.png,.webp,.gif" multiple onChange={handleFilesSelected} />
        <div className={`conversation-scroll ${showLanding ? "landing-scroll" : ""}`} ref={conversationRef}>
          {showLanding ? <ChatLanding draft={draft} selectedFiles={selectedFiles} sending={sending} inputRef={landingInputRef} onDraftChange={setDraft} onAttach={() => fileInputRef.current?.click()} onRemoveFile={(index) => setSelectedFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} onSend={() => { void sendMessage(); }} onPrompt={(prompt) => {
            setDraft(prompt);
            window.requestAnimationFrame(() => {
              landingInputRef.current?.focus();
              landingInputRef.current?.setSelectionRange(prompt.length, prompt.length);
            });
          }} /> : <div className="conversation">
            {messages.map((message) => message.role === "user" ? (
              <div className="message user-message" id={`message-${message.id}`} key={message.id}><span>{message.text}{Boolean(message.attachments?.length) && <small className="message-attachments">{message.attachments?.map((attachment) => <span className="message-attachment" key={`${attachment.name}-${attachment.size}`}><Paperclip size={12} />{attachment.name}</span>)}</small>}</span></div>
            ) : (() => {
              const messageSummary = summariesByMessage.get(message.id);
              const availableProductIds = (message.productIds ?? []).filter((id) => catalogProducts.some((product) => product.id === id));
              const isRevealing = revealing?.messageId === message.id;
              const visibleText = isRevealing ? Array.from(revealing.text).slice(0, revealing.visible).join("") : message.text;
              return <div className="assistant-row" key={message.id}><span className="assistant-avatar"><Image src="/brand/zhiyi-icon-orange.png" alt="" width={20} height={21} /></span><div className="assistant-body"><div className="assistant-meta"><strong>智能小蚁</strong><span>刚刚</span><span className="meta-dot">·</span><span className="response-time">{isRevealing ? "正在输出" : "已为您整理"}</span></div>{message.accountPrivate ? <AccountQueryAnswer sections={message.accountSections} fallback={message.text} /> : <AssistantAnswer text={visibleText} productIds={[...(message.productIds ?? []), ...catalogProducts.map((product) => product.id)]} />}
                {isRevealing && <span className="answer-writing" role="status">正在输出…</span>}
                {!isRevealing && availableProductIds.length > 0 && (!compactMode || message.id !== "welcome-assistant") && <><div className="recommendation-header"><div><span className="recommendation-icon"><Image src="/brand/zhiyi-icon-orange.png" alt="" width={20} height={21} /></span><div><strong>为您推荐的服务</strong><span>根据您的需求精选 · {availableProductIds.length} 项服务</span></div></div><span className="recommendation-disclaimer">{catalogPriceLabel}</span></div><div className="product-grid" data-product-rail>{availableProductIds.map((productId) => { const product = catalogProducts.find((item) => item.id === productId); return product ? <ProductCard key={product.id} product={product} quantity={message.selectedQuantities?.[product.id] ?? 0} onQuantityChange={(next) => updateQuantity(message.id, product.id, next)} onViewDetails={() => { setDetailProduct(product); setDetailMessageId(message.id); }} /> : null; })}</div></>}
                {!isRevealing && availableProductIds.length > 0 && <div className="selection-strip"><div className="selection-left"><span className="selection-check"><Check size={13} /></span><span>{messageSummary?.itemCount ? `已选择 ${messageSummary.itemCount} 项服务 · ${messageSummary.groups.length > 1 ? `${messageSummary.groups.length} 种币种` : formatTotals(messageSummary.groups)}` : "选择您感兴趣的服务"}</span><span className="selection-muted">· {catalogPriceLabel}</span></div><button className="selection-button" onClick={() => openOrderSummary(message.id)} disabled={!messageSummary?.itemCount}>订单结算 <ArrowRight size={15} /></button></div>}
              </div></div>;
            })())}
            {sending && <div className="assistant-row typing-row" role="status" aria-live="polite"><span className="assistant-avatar"><Image src="/brand/zhiyi-icon-orange.png" alt="" width={20} height={21} /></span><div className="assistant-body"><div className="assistant-meta"><strong>智能小蚁</strong><span className="meta-dot">·</span><span className="response-time">正在生成回复</span></div><div className="typing-indicator"><LoaderCircle size={16} className="typing-spinner" /><span>正在为您整理服务建议…</span></div></div></div>}
            {messages.length === 0 && <div className="empty-chat"><span className="assistant-avatar"><Image src="/brand/zhiyi-icon-orange.png" alt="" width={20} height={21} /></span><h2>开始一段新对话</h2><p>告诉我您需要 VAT、知识产权或跨境税务服务，我会为您匹配商品。</p><div className="empty-prompts"><button onClick={() => void sendMessage(undefined, "我想办理英国 VAT 注册")}>英国 VAT 注册 <ArrowRight size={13} /></button><button onClick={() => void sendMessage(undefined, "我想注册美国商标")}>美国商标注册 <ArrowRight size={13} /></button></div></div>}
            {!sending && !revealing && relatedProducts.length > 0 && <div className="suggestion-row"><span>您可能还想了解</span>{relatedProducts.map((product) => <button key={product.id} title={product.name} onClick={() => void sendMessage(undefined, `我想了解${product.name}，请介绍这项服务的内容和办理条件。`)}>{product.name} <ArrowRight size={13} /></button>)}</div>}
          </div>}
        </div>
        {!showLanding && <div className="composer-wrap"><div className="attached-files">{selectedFiles.map((file, index) => <span className="attached-file" key={`${file.name}-${file.size}-${index}`}><Paperclip size={13} /><span title={file.name}>{file.name}</span><button type="button" aria-label={`移除${file.name}`} onClick={() => setSelectedFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}><X size={13} /></button></span>)}</div><form className="composer" onSubmit={(event) => { void sendMessage(event); }}><button className="composer-plus" type="button" aria-label="添加附件" onClick={() => fileInputRef.current?.click()} disabled={sending}><Plus size={18} /></button><input ref={inputRef} className="composer-input" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={sending ? "正在整理服务推荐..." : "描述您的需求，例如：我想注册美国商标..."} aria-label="输入消息" disabled={sending} /><button className="attach-button" type="button" aria-label="上传附件" onClick={() => fileInputRef.current?.click()} disabled={sending}><Paperclip size={17} /></button><button className="send-button" type="submit" aria-label="发送" disabled={sending || (!draft.trim() && !selectedFiles.length)}><ArrowUp size={17} /></button></form><div className="composer-footer"><span><span className="online-dot" />智能小蚁在线</span><span>{catalogSource === "test-api" ? "商品价格仅供参考" : catalogNotice} <span className="footer-divider">·</span> <CircleHelp size={12} /></span></div></div>}
      </section>

      {detailProduct && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailProduct(null); }}><section className="order-modal detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title"><div className="modal-heading"><div><span className="modal-icon"><ShieldCheck size={17} /></span><div><h2 id="detail-title">商品详情</h2><p>{detailProduct.priceNote}</p></div></div><button className="modal-close" onClick={() => setDetailProduct(null)} aria-label="关闭"><X size={18} /></button></div><div className="detail-product-title"><span className="product-category">{detailProduct.category}</span><h3>{detailProduct.name}</h3><p>{detailProduct.description || "商品说明以服务顾问确认为准。"}</p></div><div className="detail-facts"><div><span>服务国家/地区</span><strong>{detailProduct.country}</strong></div><div><span>服务类型</span><strong>{detailProduct.category}</strong></div><div><span>{detailProduct.priceNote}</span><PriceBreakdown product={detailProduct} quantity={detailDisplayQuantity} variant="detail" /><strong className="detail-price">总价 {formatProductPrice(detailProduct.price * detailDisplayQuantity, detailProduct.currencyName)}</strong></div></div><p className="order-notice"><CircleHelp size={14} />展示金额仅供参考，实际价格以结算确认结果为准。</p><div className="detail-actions"><button className="detail-secondary" onClick={() => setDetailProduct(null)}>关闭</button><button className="confirm-order" onClick={() => { if (detailMessageId) updateQuantity(detailMessageId, detailProduct.id, Math.max(1, messages.find((message) => message.id === detailMessageId)?.selectedQuantities?.[detailProduct.id] ?? 0)); setDetailProduct(null); }}>加入已选服务</button></div></section></div>}
      {showOrder && <CheckoutDialog selected={selected} quantities={checkoutMessage?.selectedQuantities ?? {}} groups={groups} itemCount={itemCount} checkoutMessageId={checkoutMessageId ?? ""} catalogSource={catalogSource} quote={quote} loading={quoteLoading} error={quoteError} requestedTicketIds={requestedTicketIds} onTicketSelect={setRequestedTicketIds} onQuantityChange={(productId, next) => { if (checkoutMessageId) updateQuantity(checkoutMessageId, productId, next); }} onClose={() => setShowOrder(false)} onRetry={() => setQuoteRetry((count) => count + 1)} />}
      {confirmedMessageId && (summariesByMessage.get(confirmedMessageId)?.itemCount ?? 0) > 0 && <div className="order-confirmed"><span className="confirmed-icon"><Check size={15} /></span><span>结算信息已在本地确认，未支付</span><strong>{quote && checkoutMessageId === confirmedMessageId ? formatProductPrice(quote.total) : "重新查看结算"}</strong><button onClick={() => openOrderSummary(confirmedMessageId)}>查看</button></div>}
      {deleteTarget && <DeleteConversationDialog title={deleteTarget.title} onCancel={() => setDeleteTarget(null)} onConfirm={deleteConversation} />}
      {toast && <div className="toast-message" role="status">{toast}</div>}
    </main>
  );
}
