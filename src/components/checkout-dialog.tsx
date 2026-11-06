"use client";

import { useEffect, useState } from "react";
import { CircleHelp, FileText, LoaderCircle, ShieldCheck, X } from "lucide-react";
import { PriceBreakdown } from "@/components/price-breakdown";
import { PaymentPanel } from "@/components/payment-panel";
import { formatProductPrice, type Product } from "@/data/products";
import type { OrderSummary } from "@/lib/order-summary";
import type { CheckoutQuote } from "@/types/checkout";

type Props = {
  selected: Product[];
  quantities: Record<string, number>;
  groups: OrderSummary["groups"];
  itemCount: number;
  checkoutMessageId: string;
  catalogSource: "test-api" | "unavailable";
  quote: CheckoutQuote | null;
  loading: boolean;
  error: string;
  requestedTicketIds: string;
  onTicketSelect: (ticketIds: string) => void;
  onQuantityChange: (productId: string, quantity: number) => void;
  onClose: () => void;
  onRetry: () => void;
};

export function CheckoutDialog({ selected, quantities, groups, itemCount, checkoutMessageId, catalogSource, quote, loading, error, requestedTicketIds, onTicketSelect, onQuantityChange, onClose, onRetry }: Props) {
  const [paymentStep, setPaymentStep] = useState(false);
  const needsQuote = catalogSource === "test-api" && selected.every((product) => product.dataSource === "test-api");
  const displayedTotalDiffers = quote && Math.abs(groups.reduce((sum, group) => sum + group.subtotal, 0) - quote.discount - quote.total) >= 0.01;
  const items = selected.map((product) => ({ productId: product.id, quantity: quantities[product.id] ?? 0 }));
  const sessionKey = `${checkoutMessageId}:${JSON.stringify(items)}:${quote?.ticketIds ?? ""}`;
  const appliedTicketId = quote?.ticketIds;
  const appliedTicket = quote?.tickets.find((ticket) => ticket.id === appliedTicketId);
  useEffect(() => { setPaymentStep(false); }, [sessionKey]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="order-modal checkout-modal" role="dialog" aria-modal="true" aria-labelledby="order-title">
      <div className="modal-heading"><div><span className="modal-icon"><FileText size={17} /></span><div><h2 id="order-title">订单结算</h2><p>请核对所选商品、数量与接口结算金额</p></div></div><button className="modal-close" onClick={onClose} aria-label="关闭"><X size={18} /></button></div>
      <div className="checkout-modal-body">
      <div className="order-lines">{selected.map((product) => <div className="order-line" key={product.id}>
        <div className="order-product"><strong>{product.name}</strong><span>{product.country} · {product.priceNote}</span><PriceBreakdown product={product} quantity={quantities[product.id] ?? 0} variant="order" /></div>
        <strong className="order-price">商品总价 {formatProductPrice(product.price * (quantities[product.id] ?? 0), product.currencyName)}</strong>
        <div className="quantity-control"><button disabled={paymentStep} onClick={() => onQuantityChange(product.id, (quantities[product.id] ?? 0) - 1)} aria-label={`减少${product.name}数量`}>−</button><span>{quantities[product.id] ?? 0}</span><button disabled={paymentStep} onClick={() => onQuantityChange(product.id, (quantities[product.id] ?? 0) + 1)} aria-label={`增加${product.name}数量`}>+</button></div>
      </div>)}</div>
      {needsQuote && <div className="checkout-api-state" role="status" aria-live="polite">
        {loading ? <><LoaderCircle size={15} className="typing-spinner" /> 正在获取结算价格与优惠…</> : error ? <><CircleHelp size={15} /> <span>{error}</span><button onClick={onRetry}>重试</button></> : quote ? <><ShieldCheck size={15} /> 已获取结算金额</> : null}
      </div>}
      {needsQuote && <div className="checkout-ticket-section">
        <div className="checkout-ticket-heading"><strong>优惠券</strong>{requestedTicketIds && !paymentStep && <button type="button" onClick={() => onTicketSelect("")}>恢复系统推荐</button>}</div>
        {quote ? <>
          <p className="checkout-ticket-status">{appliedTicket ? `已选择：${appliedTicket.name}${requestedTicketIds ? "" : "（系统推荐）"}` : quote.ticketIds ? `已选择 ${quote.ticketIds.split(",").length} 张优惠券` : "当前没有选中优惠券"}</p>
          {quote.tickets.length ? <div className="checkout-ticket-list">{quote.tickets.map((ticket) => <button type="button" className={`checkout-ticket ${quote.ticketIds === ticket.id ? "selected" : ""}`} aria-pressed={quote.ticketIds === ticket.id} disabled={paymentStep || loading} key={ticket.id} onClick={() => onTicketSelect(ticket.id)}>
            <span className="checkout-ticket-name">{ticket.name}</span>
            {ticket.benefitLabel && <span className="checkout-ticket-benefit">{ticket.benefitLabel}</span>}
            {ticket.scopeInfo && <span>{ticket.scopeInfo}</span>}
            {ticket.remark && <span>{ticket.remark}</span>}
            {ticket.useEndTime && <small>有效期至 {ticket.useEndTime.slice(0, 10)}</small>}
          </button>)}</div> : <p className="checkout-ticket-empty">当前商品暂无可选优惠券。</p>}
        </> : <p className="checkout-ticket-empty">{loading ? "正在查询可用优惠券…" : "获取结算金额后显示可用优惠券。"}</p>}
      </div>}
      <div className="order-totals">{quote && needsQuote ? <div className="currency-breakdown">
        <div className="fee-total-line"><span>代理费（接口）</span><strong>{formatProductPrice(quote.serviceFee)}</strong></div>
        <div className="fee-total-line"><span>官费人民币金额（接口）</span><strong>{formatProductPrice(quote.officialFee)}</strong></div>
        <div className="fee-total-line"><span>优惠金额（接口）</span><strong>{quote.discount > 0 ? "−" : ""}{formatProductPrice(quote.discount)}</strong></div>
        <div className="total-line currency-total"><span>结算总价 · 人民币</span><strong>{formatProductPrice(quote.total)}</strong></div>
      </div> : groups.map((group) => <div className="currency-breakdown" key={group.currencyCode}>
        <div className="fee-total-line"><span>代理费合计</span><strong>{formatProductPrice(group.serviceFeeSubtotal, group.currencyName)}</strong></div>
        <div className="fee-total-line"><span>官费合计</span><strong>{formatProductPrice(group.officialFeeSubtotal, group.currencyName)}</strong></div>
        <div className="fee-total-line"><span>优惠金额</span><strong>等待结算接口确认</strong></div>
        <div className="total-line currency-total"><span>商品总价 · {group.currencyName}</span><strong>{formatProductPrice(group.subtotal, group.currencyName)}</strong></div>
      </div>)}</div>
      {displayedTotalDiffers && <p className="checkout-warning">接口结算总价与商品展示价计算值不同，请以本次接口结算金额为准。</p>}
      {quote?.warnings.map((warning) => <p className="checkout-warning" key={warning}>{warning}</p>)}
      <p className="order-notice"><ShieldCheck size={14} />{quote ? "金额以本次结算结果为准；下一步可选择支付方式。" : "接口结算金额暂未取得；上方商品价格仅供参考。"}</p>
      {paymentStep && quote && needsQuote ? <PaymentPanel items={items} products={selected} quantities={quantities} quote={quote} sessionKey={sessionKey} onBack={() => setPaymentStep(false)} onQuoteChanged={onRetry} /> : <><button className="confirm-order" disabled={!itemCount || !needsQuote || loading || !quote} onClick={() => { if (quote && needsQuote) setPaymentStep(true); }}>下一步：选择支付方式</button><p className="order-footnote">创建订单将在下一步由您确认</p></>}
      </div>
    </section>
  </div>;
}
