"use client";

import type { RefObject } from "react";
import { ArrowUp, Building2, ClipboardList, FileSearch, Paperclip, ReceiptText, RefreshCw, ShieldCheck, Stamp, X } from "lucide-react";

const quickStarts = [
  {
    title: "开店前要办什么",
    description: "说出国家、平台和品类，告诉你 VAT、EPR、产品认证哪些要办、先办哪个",
    prompt: "我想在德国亚马逊销售儿童玩具，开店前需要办理哪些合规手续？VAT、EPR 和产品认证应该先办哪个？",
    icon: ShieldCheck,
    color: "blue",
  },
  {
    title: "报 VAT 要准备什么",
    description: "按国家和申报期，列出要导出的销售报表、退款记录和库存凭证",
    prompt: "我在英国亚马逊卖服装，第一次申报 VAT。需要导出哪些销售报表？退货、退款和库存记录怎么整理？",
    icon: ClipboardList,
    color: "teal",
  },
  {
    title: "看懂平台 / 税局来信",
    description: "贴上通知原文，帮你拆出：要你做什么、交什么材料、哪天截止",
    prompt: "我在法国亚马逊卖美妆产品，收到一封平台合规通知。可以帮我看懂要做什么、交什么材料、哪天截止吗？我会补充通知原文。",
    icon: FileSearch,
    color: "orange",
  },
  {
    title: "注册商标前准备",
    description: "确认品牌名、商品类别和国家，注册前先查有没有撞名",
    prompt: "我想在美国注册一个宠物用品品牌商标。申请前怎样查近似商标？商品类别该怎么选？",
    icon: Stamp,
    color: "cyan",
  },
  {
    title: "注册香港 / 海外公司",
    description: "确定注册地和用途，列出股东董事资料，以及注册后每年的年审和记账",
    prompt: "我计划注册香港公司，通过独立站向美国销售家居用品。要准备哪些股东和董事资料？注册后每年要办什么？",
    icon: Building2,
    color: "indigo",
  },
  {
    title: "服务快到期了",
    description: "核对是哪个公司、哪项服务、续多久，再确认报价",
    prompt: "我在西班牙亚马逊销售电子配件，包装法 EPR 服务快到期了。续费前要核对哪些信息，怎样确认报价？",
    icon: RefreshCw,
    color: "blue",
  },
  {
    title: "查订单和办理进度",
    description: "了解在哪里查询订单状态、资料审核进度和发票",
    prompt: "我想查看最近的订单状态、资料审核进度和发票",
    icon: ReceiptText,
    color: "orange",
  },
] as const;

type Props = {
  draft: string;
  selectedFiles: File[];
  sending: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onDraftChange: (value: string) => void;
  onAttach: () => void;
  onRemoveFile: (index: number) => void;
  onSend: () => void;
  onPrompt: (prompt: string) => void;
};

export function ChatLanding({ draft, selectedFiles, sending, inputRef, onDraftChange, onAttach, onRemoveFile, onSend, onPrompt }: Props) {
  return <div className="chat-landing">
    <h1>您好，我是跨境合规助手<span>小蚁</span></h1>
    <p className="landing-subtitle">告诉我卖到哪个国家、用什么平台、卖什么商品，我帮你理清要办哪些手续、先办哪个。</p>
    <form className="landing-composer" onSubmit={(event) => { event.preventDefault(); onSend(); }}>
      <textarea
        ref={inputRef}
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            onSend();
          }
        }}
        placeholder="说说你要在哪个国家、哪个平台卖什么，例如：“我想在德国亚马逊卖儿童玩具”"
        aria-label="输入咨询内容"
        disabled={sending}
      />
      {selectedFiles.length > 0 && <div className="landing-attached-files">{selectedFiles.map((file, index) => <span className="attached-file" key={`${file.name}-${file.size}-${index}`}><Paperclip size={13} /><span title={file.name}>{file.name}</span><button type="button" aria-label={`移除${file.name}`} onClick={() => onRemoveFile(index)}><X size={13} /></button></span>)}</div>}
      <div className="landing-composer-actions">
        <button className="landing-attach" type="button" aria-label="上传附件" title="上传附件" onClick={onAttach} disabled={sending}><Paperclip size={19} /></button>
        <button className="landing-send" type="submit" aria-label="发送" disabled={sending || (!draft.trim() && selectedFiles.length === 0)}><ArrowUp size={20} /></button>
      </div>
    </form>
    <section className="quick-start" aria-label="快速开始">
      <h2>快速开始</h2>
      <div className="quick-start-grid">{quickStarts.map(({ title, description, prompt, icon: Icon, color }) =>
        <button className="quick-start-card" type="button" key={title} onClick={() => onPrompt(prompt)} disabled={sending}>
          <span className={`quick-start-icon quick-start-icon-${color}`}><Icon size={19} /></span>
          <span className="quick-start-copy"><strong>{title}</strong><span>{description}</span></span>
        </button>
      )}</div>
    </section>
  </div>;
}
