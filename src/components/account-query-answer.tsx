"use client";

import { Fragment, useId, useState } from "react";
import Image from "next/image";
import { Copy, FileText } from "lucide-react";
import { flagImageSource } from "@/lib/flag-image";
import type { AccountOrder, AccountProgress, AccountSection } from "@/types/chat";

function money(value: number | null): string {
  return value === null ? "—" : `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function date(value: string): string {
  return value ? value.replace("T", " ").slice(0, 19) : "—";
}

function flag(name: string): string | null {
  const countries: Array<[RegExp, string]> = [
    [/英国|英國/, "🇬🇧"], [/法国|法國/, "🇫🇷"], [/德国|德國/, "🇩🇪"],
    [/美国|美國/, "🇺🇸"], [/意大利/, "🇮🇹"], [/西班牙/, "🇪🇸"],
    [/日本/, "🇯🇵"], [/加拿大/, "🇨🇦"], [/澳大利亚|澳洲/, "🇦🇺"],
  ];
  return countries.find(([pattern]) => pattern.test(name))?.[1] ?? null;
}

const ORDER_STATUS_TABS = ["待付款", "支付待确认", "已取消", "已付款", "已完成", "已退款"];

function statusCategory(status: string): string {
  if (/^(待付款|待支付|未付款)$/.test(status)) return "待付款";
  if (/^(支付待确认|待支付确认)$/.test(status)) return "支付待确认";
  if (/^已?取消$/.test(status)) return "已取消";
  if (/^已付款$/.test(status)) return "已付款";
  if (/^已完成$/.test(status)) return "已完成";
  if (/^已退款$/.test(status)) return "已退款";
  return status;
}

function AccountOrderList({ orders }: { orders: AccountOrder[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(() => new Set());
  const [selectedStatus, setSelectedStatus] = useState("全部");
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const counts = new Map<string, number>();
  orders.forEach((order) => {
    const category = statusCategory(order.status);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  });
  const tabs = ["全部", ...ORDER_STATUS_TABS, ...[...counts.keys()].filter((status) => !ORDER_STATUS_TABS.includes(status))];
  const visibleOrders = selectedStatus === "全部" ? orders : orders.filter((order) => statusCategory(order.status) === selectedStatus);

  async function copyOrderNo(orderNo: string) {
    try {
      await navigator.clipboard.writeText(orderNo);
      setCopied(orderNo);
      setCopyFailed(null);
      window.setTimeout(() => setCopied(null), 2200);
    } catch {
      setCopied(null);
      setCopyFailed(orderNo);
      window.setTimeout(() => setCopyFailed(null), 2200);
    }
  }

  return <div className="account-orders" role="region" aria-label="我的订单列表">
    <div className="account-order-tabs" aria-label="按订单状态筛选">
      {tabs.map((tab) => <button key={tab} type="button" className={selectedStatus === tab ? "active" : ""} aria-pressed={selectedStatus === tab} onClick={() => setSelectedStatus(tab)}>{tab}{tab === "全部" ? "" : ` (${counts.get(tab) ?? 0})`}</button>)}
    </div>
    <p className="account-order-scope">当前显示 {orders.length} 笔订单；状态数量按这批订单统计。</p>
    {!visibleOrders.length && <div className="account-orders-empty">当前加载的订单中暂无“{selectedStatus}”记录。</div>}
    {visibleOrders.map((order) => {
      const key = `${order.orderNo}-${order.createdAt}`;
      const isExpanded = expandedOrder === key;
      const canCopy = order.orderNo !== "编号待更新";
      const total = order.total ?? order.lines.reduce<number | null>((sum, item) => sum === null || item.amount === null ? null : sum + item.amount, 0);
      return <article className="account-order" key={key}>
        <div className="account-order-meta">
          <time>{date(order.createdAt)}</time>
          <span className="account-order-number">订单号：<strong>{order.orderNo}</strong>{canCopy && <button type="button" className="account-order-copy" onClick={() => void copyOrderNo(order.orderNo)} aria-label={`复制订单号 ${order.orderNo}`} title="复制订单号"><Copy size={13} /></button>}{copied === order.orderNo && <small role="status">已复制</small>}{copyFailed === order.orderNo && <small role="alert">复制失败</small>}</span>
          <span className="account-order-mobile-status">{order.status}</span>
        </div>
        <div className="account-order-table-scroll"><table className="account-order-table">
          <colgroup><col className="account-order-col-service" /><col className="account-order-col-spec" /><col className="account-order-col-quantity" /><col className="account-order-col-amount" /><col className="account-order-col-status" /><col className="account-order-col-action" /></colgroup>
          <thead><tr><th scope="col">服务名称</th><th scope="col">规格</th><th scope="col">数量</th><th scope="col">金额</th><th scope="col">订单状态</th><th scope="col">操作</th></tr></thead>
          <tbody>{order.lines.map((line, lineIndex) => <tr key={`${key}-${lineIndex}`}>
            <td className="account-order-service" data-label="服务名称"><span className="account-order-image" aria-hidden="true">{flagImageSource(line.image) && !brokenImages.has(line.image) ? <Image src={flagImageSource(line.image)!} alt="" width={58} height={58} unoptimized onError={() => setBrokenImages((current) => new Set(current).add(line.image))} /> : flag(line.name) ?? <FileText size={24} />}</span><span className="account-order-service-copy"><strong title={line.name}>{line.name}</strong>{line.packageName !== "—" && <small>{line.packageName}</small>}</span></td>
            <td className="account-order-spec" data-label="规格">{line.specification}</td>
            <td className="account-order-quantity" data-label="数量">{line.quantity ?? "—"}</td>
            {lineIndex === 0 && <><td className="account-order-amount" data-label="金额" rowSpan={order.lines.length}>{money(total)}</td><td className="account-order-status" data-label="订单状态" rowSpan={order.lines.length}>{order.status}</td><td className="account-order-action" data-label="操作" rowSpan={order.lines.length}><button type="button" onClick={() => setExpandedOrder(isExpanded ? null : key)} aria-expanded={isExpanded}>订单详情</button></td></>}
          </tr>)}</tbody>
        </table></div>
        {isExpanded && <div className="account-order-detail"><div><span>订单号</span><strong>{order.orderNo}</strong></div><div><span>创建时间</span><strong>{date(order.createdAt)}</strong></div><div><span>订单状态</span><strong>{order.status}</strong></div><div><span>订单金额</span><strong className="account-order-detail-amount">{money(total)}</strong></div>{order.expiresAt && <div><span>支付截止时间</span><strong>{date(order.expiresAt)}</strong></div>}{statusCategory(order.status) === "待付款" && <p>如需支付，请在官网订单中心打开该订单。</p>}</div>}
      </article>;
    })}
  </div>;
}

function AccountProgressList({ progress }: { progress: AccountProgress[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const idPrefix = useId();

  return <div className="account-progress" role="region" aria-label="服务进度列表">
    <table>
      <thead><tr><th scope="col">公司名称</th><th scope="col">国家/地区</th><th scope="col">服务类型</th><th scope="col">服务单号</th><th scope="col">当前状态</th><th scope="col">操作</th></tr></thead>
      <tbody>{progress.map((item, index) => {
        const key = `${item.id}-${index}`;
        const isExpanded = expanded === key;
        const detailId = `${idPrefix}-account-progress-detail-${index}`;
        return <Fragment key={key}>
          <tr className="account-progress-row">
            <td data-label="公司名称" className="account-progress-company" title={item.companyName}>{item.companyName}</td>
            <td data-label="国家/地区">{item.country}</td>
            <td data-label="服务类型">{item.serviceType}</td>
            <td data-label="服务单号" className="account-progress-no">{item.serviceNo}</td>
            <td data-label="当前状态"><span className="account-progress-status">{item.status}</span></td>
            <td data-label="操作"><button type="button" aria-expanded={isExpanded} aria-controls={isExpanded ? detailId : undefined} onClick={() => setExpanded(isExpanded ? null : key)}>{isExpanded ? "收起进度" : "查看进度"}</button></td>
          </tr>
          {isExpanded && <tr className="account-progress-detail-row" id={detailId}><td colSpan={6}>
            <div className="account-progress-detail"><div><span>当前进度</span><strong>{item.status}</strong></div><div><span>申请号</span><strong>{item.applicationNo}</strong></div><div><span>注册号</span><strong>{item.registrationNo}</strong></div><div><span>业务记录ID</span><strong>{item.id}</strong></div></div>
          </td></tr>}
        </Fragment>;
      })}</tbody>
    </table>
  </div>;
}

export function AccountQueryAnswer({ sections, fallback }: { sections?: AccountSection[]; fallback: string }) {
  if (!sections?.length) return <div className="assistant-answer account-query-answer">{fallback}</div>;
  return <div className="assistant-answer account-query-answer">
    {sections.map((section, index) => <section className="account-query-section" key={`${section.kind}-${index}`}>
      <p className="account-query-intro">{section.text}</p>
      {section.kind === "orders" && Boolean(section.orders?.length) && <AccountOrderList orders={section.orders!} />}
      {section.kind === "progress" && Boolean(section.progress?.length) && <AccountProgressList progress={section.progress!} />}
    </section>)}
  </div>;
}
