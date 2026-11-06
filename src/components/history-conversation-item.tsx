"use client";

import { LoaderCircle, MessageSquarePlus, Trash2 } from "lucide-react";
import type { PersistedConversation } from "@/types/chat";

type Props = {
  conversation: PersistedConversation;
  active: boolean;
  loading?: boolean;
  compact?: boolean;
  onOpen: () => void;
  onDelete: () => void;
};

export function HistoryConversationItem({ conversation, active, loading = false, compact = false, onOpen, onDelete }: Props) {
  return <div className={compact ? "compact-history-entry" : "history-entry"}>
    <button
      type="button"
      className={`${compact ? "compact-history-item" : "history-item"} ${active ? "active" : ""}`}
      onClick={onOpen}
      title={conversation.title}
      aria-busy={loading}
    >{loading ? <LoaderCircle size={14} className="typing-spinner" aria-hidden="true" /> : compact ? <MessageSquarePlus size={14} /> : <span className="history-dot" />}<span className="history-item-title">{conversation.title}</span>{loading && <span className="history-loading-label">加载中</span>}</button>
    <button
      type="button"
      className="history-delete"
      onClick={onDelete}
      aria-label={`删除对话：${conversation.title}`}
      title="删除对话"
    ><Trash2 size={14} /></button>
  </div>;
}
