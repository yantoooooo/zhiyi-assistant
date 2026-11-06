"use client";

import { useEffect, useState } from "react";
import { Check, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { formatProductPrice } from "@/data/products";
import { createClientId } from "@/lib/client-id";
import type { Product } from "@/data/products";
import { OrderInformation } from "@/components/order-information";
import type { CheckoutQuote } from "@/types/checkout";
import type { PaymentMethod, PaymentOrder, PaymentStatus } from "@/types/payment";

type Props = {
  items: Array<{ productId: string; quantity: number }>;
  products: Product[];
  quantities: Record<string, number>;
  quote: CheckoutQuote;
  sessionKey: string;
  onBack: () => void;
  onQuoteChanged: () => void;
};

const STORAGE_KEY = "cyberantt-pending-test-payment";

export function PaymentPanel({ items, products, quantities, quote, sessionKey, onBack, onQuoteChanged }: Props) {
  const [method, setMethod] = useState<PaymentMethod>("1");
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [status, setStatus] = useState<PaymentStatus["status"]>("pending");
  const [pending, setPending] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState("");
  const [statusError, setStatusError] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);
  const [qrBroken, setQrBroken] = useState(false);
  const [restored, setRestored] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [availabilityReason, setAvailabilityReason] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/payment/availability", { cache: "no-store" })
      .then(async (response) => await response.json() as { available?: boolean; reason?: string })
      .then((result) => { if (active) { setAvailable(result.available === true); setAvailabilityReason(result.reason || ""); } })
      .catch(() => { if (active) { setAvailable(false); setAvailabilityReason("暂时无法检查支付接口状态。"); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null") as { sessionKey?: string; order?: PaymentOrder } | null;
      if (saved?.sessionKey === sessionKey && saved.order?.orderNo) {
        setOrder(saved.order);
        setMethod(saved.order.paymentMethod);
        setStatus(saved.order.paymentStatus ?? "pending");
      }
    } catch { /* Ignore stale browser session data. */ }
    setRestored(true);
  }, [sessionKey]);

  useEffect(() => {
    if (!order || status === "paid") return;
    let active = true;
    let attempts = 0;
    async function checkStatus() {
      if (!order) return;
      try {
        const response = await fetch("/api/payment/status", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderNo: order.orderNo, paymentMethod: order.paymentMethod }), cache: "no-store",
        });
        const result = await response.json() as PaymentStatus & { error?: string };
        if (!response.ok) throw new Error(result.error || "支付状态暂不可用。");
        if (active) { setStatus(result.status); setStatusError(""); }
      } catch (cause) {
        if (active) setStatusError(cause instanceof Error ? cause.message : "支付状态暂不可用。");
      }
    }
    const timer = window.setInterval(() => {
      attempts += 1;
      if (attempts > 75) { window.clearInterval(timer); return; }
      void checkStatus();
    }, 4000);
    return () => { active = false; window.clearInterval(timer); };
  }, [order, status]);

  async function createOrder(skipPayment = false) {
    if (pending || attempted || order || (!skipPayment && available !== true)) return;
    setPending(true);
    setAttempted(true);
    setError("");
    let safeToRetry = false;
    try {
      const response = await fetch("/api/payment/create", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, paymentMethod: method, expectedTotal: quote.total, ticketIds: quote.ticketIds, requestId: createClientId(), skipPayment }),
        cache: "no-store",
      });
      const result = await response.json() as PaymentOrder & { error?: string };
      if (!response.ok) {
        safeToRetry = [400, 409, 503].includes(response.status);
        if (response.status === 409) onQuoteChanged();
        if (response.status === 503) {
          setAvailable(false);
          setAvailabilityReason(result.error || "支付接口暂不可用。");
        }
        throw new Error(result.error || "订单提交失败。");
      }
      setOrder(result);
      setStatus(result.paymentStatus ?? "pending");
      setQrBroken(false);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionKey, order: result }));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "订单提交结果不确定，请到原站订单中心核对。";
      setError(skipPayment ? `未创建订单：${message}` : message);
    } finally {
      setPending(false);
      if (safeToRetry) setAttempted(false);
    }
  }

  async function retryCode() {
    if (!order || codeLoading) return;
    setCodeLoading(true);
    try {
      const response = await fetch("/api/payment/code", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNo: order.orderNo, paymentMethod: order.paymentMethod }), cache: "no-store",
      });
      const result = await response.json() as { imageUrl?: string; codeError?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "付款码暂不可用。");
      const updated = { ...order, imageUrl: result.imageUrl, codeError: result.codeError };
      setOrder(updated);
      setQrBroken(false);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionKey, order: updated }));
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "付款码暂不可用。"); }
    finally { setCodeLoading(false); }
  }

  if (!restored) return <div className="payment-panel"><LoaderCircle size={16} className="typing-spinner" /> 正在恢复订单信息…</div>;

  return <div className="payment-panel">
    {!order ? <>
      <div className="payment-panel-heading"><strong>选择支付方式</strong><span>结算金额 · {formatProductPrice(quote.total)}</span></div>
      <div className="payment-methods">
        <label><input type="radio" name="payment-method" checked={method === "1"} onChange={() => setMethod("1")} /> 微信支付</label>
        <label><input type="radio" name="payment-method" checked={method === "2"} onChange={() => setMethod("2")} /> 支付宝</label>
      </div>
      <p className="checkout-warning">请先核对结算金额。确认后会创建订单并获取付款码。</p>
      {available === null && <p className="payment-polling"><LoaderCircle size={13} className="typing-spinner" /> 正在检查支付接口…</p>}
      {available === false && <p className="payment-error" role="alert">{availabilityReason || "支付接口暂不可用。"}</p>}
      {error && <p className="payment-error" role="alert">{error}</p>}
      <div className="payment-actions"><button className="detail-secondary" onClick={onBack} disabled={pending}>返回修改</button><button className="confirm-order" disabled={pending || attempted || available !== true} onClick={() => void createOrder()}>{pending ? <><LoaderCircle size={15} className="typing-spinner" /> 正在创建订单…</> : "创建订单并获取付款码"}</button></div>
      {process.env.NODE_ENV === "development" && <div className="payment-skip"><button type="button" onClick={() => void createOrder(true)} disabled={pending || attempted}>{pending ? "正在创建并确认预览订单…" : "跳过支付并创建预览订单"}</button><span>仅供本地开发预览，支付状态以接口查询结果为准。</span></div>}
    </> : <>
      <div className="payment-panel-heading"><strong>{status === "paid" ? "支付成功，订单已生成" : order.paymentSkipped ? "预览订单已生成，等待支付确认" : "订单已创建，等待支付"}</strong><span>{formatProductPrice(order.amount)}</span></div>
      <p className="payment-order-no">订单号：<strong>{order.orderNo}</strong></p>
      {order.amountChanged && <p className="payment-error">创建订单接口金额与结算试算不同，请以订单详情金额为准。</p>}
      {status === "paid" ? <p className="payment-success"><Check size={16} /> 接口已确认支付成功</p> : <>
        {order.paymentSkipped ? <p className="order-information-hint">订单已生成，正在核对支付状态；本次未获取付款码。</p> : order.imageUrl && !qrBroken && <div className="payment-qr">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={order.imageUrl} alt={`${order.paymentMethod === "1" ? "微信" : "支付宝"}付款码`} onError={() => setQrBroken(true)} />
        </div>}
        {!order.paymentSkipped && (order.codeError || qrBroken || !order.imageUrl) && <p className="payment-error">{order.codeError || "付款码图片加载失败，请在原站订单中心继续支付。"}</p>}
        {order.testPaymentError && <p className="payment-error" role="alert">{order.testPaymentError}</p>}
        <p className="payment-polling"><RefreshCw size={13} /> 正在查询支付结果{statusError ? ` · ${statusError}` : ""}</p>
        {!order.paymentSkipped && <button className="payment-retry" onClick={() => void retryCode()} disabled={codeLoading}>{codeLoading ? "正在获取…" : "重新获取付款码"}</button>}
      </>}
      {!order.paymentSkipped && <p className="payment-note"><ShieldCheck size={13} /> 付款由支付渠道处理，当前页面不收集支付密码。</p>}
      <OrderInformation order={order} paymentStatus={status} products={products} quantities={quantities} />
    </>}
  </div>;
}
