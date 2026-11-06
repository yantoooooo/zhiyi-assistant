"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { formatProductPrice, type Product } from "@/data/products";
import type { OrderDetails, VatMaterialDraft, VatMaterialFields } from "@/types/order";
import type { PaymentOrder } from "@/types/payment";

type Props = {
  order: PaymentOrder;
  paymentStatus: "pending" | "paid";
  products: Product[];
  quantities: Record<string, number>;
};

const FIELDS: Array<{ key: keyof VatMaterialFields; label: string; long?: boolean }> = [
  { key: "companyName", label: "公司名称（中文）" },
  { key: "companyNameEn", label: "公司名称（英文）" },
  { key: "companyYyzzNo", label: "营业执照编号" },
  { key: "companyAddrCn", label: "公司地址（中文）", long: true },
  { key: "companyAddrEn", label: "公司地址（英文）", long: true },
  { key: "companyLegal", label: "法人姓名" },
  { key: "companyLegalEn", label: "法人英文名" },
  { key: "companyContactsMobile", label: "联系人手机号" },
  { key: "companyContactsNameEmail", label: "联系邮箱" },
];

export function OrderInformation({ order, paymentStatus, products, quantities }: Props) {
  const [details, setDetails] = useState<OrderDetails | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(true);
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [materials, setMaterials] = useState<VatMaterialDraft | null>(null);
  const [fields, setFields] = useState<VatMaterialFields | null>(null);
  const [materialError, setMaterialError] = useState("");
  const [materialLoading, setMaterialLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const hasVat = products.some((product) => product.category === "VAT服务" && /注册/.test(product.name));
  const basePath = `/api/orders/${encodeURIComponent(order.orderNo)}`;

  useEffect(() => {
    let active = true;
    setDetailLoading(true);
    void fetch(basePath, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as OrderDetails & { error?: string };
        if (!response.ok) throw new Error(result.error || "订单详情暂不可用。");
        return result;
      })
      .then((result) => { if (active) { setDetails(result); setDetailError(""); } })
      .catch((error) => { if (active) setDetailError(error instanceof Error ? error.message : "订单详情暂不可用。"); })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [basePath, paymentStatus]);

  async function openMaterials() {
    if (materialLoading) return;
    setMaterialsOpen(true);
    setMaterialLoading(true);
    setMaterialError("");
    try {
      const response = await fetch(`${basePath}/vat-materials`, { cache: "no-store" });
      const result = await response.json() as VatMaterialDraft & { error?: string };
      if (!response.ok) throw new Error(result.error || "VAT 资料暂不可用。");
      setMaterials(result);
      setFields(result.fields);
      setSaved(false);
    } catch (error) {
      setMaterialError(error instanceof Error ? error.message : "VAT 资料暂不可用。");
    } finally { setMaterialLoading(false); }
  }

  async function saveMaterials() {
    if (!fields || saving) return;
    setSaving(true);
    setMaterialError("");
    setSaved(false);
    try {
      const response = await fetch(`${basePath}/vat-materials`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields), cache: "no-store",
      });
      const result = await response.json() as { saved?: boolean; error?: string };
      if (!response.ok || !result.saved) throw new Error(result.error || "保存失败，请稍后重试。");
      setSaved(true);
    } catch (error) { setMaterialError(error instanceof Error ? error.message : "保存失败，请稍后重试。"); }
    finally { setSaving(false); }
  }

  return <section className="order-information" aria-label="我的订单信息">
    <div className="order-information-heading"><strong>我的订单信息</strong><span>{paymentStatus === "paid" ? "已创建 · 已支付" : "已创建 · 待支付确认"}</span></div>
    <div className="order-information-meta"><span>订单号</span><strong>{order.orderNo}</strong></div>
    {details && <>
      <div className="order-information-meta"><span>订单状态</span><strong>{details.status}</strong></div>
      {details.createdAt && <div className="order-information-meta"><span>创建时间</span><strong>{details.createdAt}</strong></div>}
      {details.pendingMaterials != null && <div className="order-information-meta"><span>待填写资料</span><strong>{details.pendingMaterials} 项</strong></div>}
      {details.lines.map((line) => <div className="order-information-line" key={line.id || line.name}><span>{line.name} × {line.quantity}</span><strong>{line.amount == null ? "—" : formatProductPrice(line.amount)}</strong></div>)}
      {details.discount != null && <div className="order-information-meta"><span>优惠</span><strong>−{formatProductPrice(details.discount)}</strong></div>}
    </>}
    {!details && products.map((product) => <div className="order-information-line" key={product.id}><span>{product.name} × {quantities[product.id] ?? 1}</span><strong>{formatProductPrice(product.price * (quantities[product.id] ?? 1))}</strong></div>)}
    <div className="order-information-total"><span>订单金额</span><strong>{formatProductPrice(details?.amount ?? order.amount)}</strong></div>
    {detailLoading && <p className="payment-polling"><LoaderCircle size={13} className="typing-spinner" /> 正在读取接口订单详情…</p>}
    {detailError && <p className="order-information-hint">接口详情暂不可用，以上保留了本次创建订单的基本信息：{detailError}</p>}
    {hasVat ? paymentStatus === "paid"
      ? <a className="payment-retry order-fill-button" href="https://test-2026.cyberantt.com/workbench/vat" target="_blank" rel="noopener noreferrer">前往工作台</a>
      : (!materialsOpen || (!materials && !materialLoading)) && <button className="payment-retry order-fill-button" onClick={() => void openMaterials()} disabled={materialLoading}>{materialLoading ? "正在读取资料…" : materialsOpen ? "重试读取 VAT 资料" : "填写 VAT 注册资料"}</button>
      : <p className="order-information-hint">该商品的资料填写接口尚未接入。</p>}
    {paymentStatus !== "paid" && materialsOpen && <div className="vat-materials">
      {materialError && <p className="payment-error" role="alert">{materialError}</p>}
      {materials && fields && <>
        <div className="vat-materials-heading"><strong>VAT 注册基础资料</strong><span>{materials.country || "未注明地区"}{materials.status ? ` · ${materials.status}` : ""}</span></div>
        <div className="vat-materials-fields">{FIELDS.map(({ key, label, long }) => <label key={key} className={long ? "vat-field-wide" : ""}><span>{label}</span>{long
          ? <textarea value={fields[key]} maxLength={500} disabled={materials.lockedFields.includes(key)} onChange={(event) => { setFields({ ...fields, [key]: event.target.value }); setSaved(false); }} />
          : <input value={fields[key]} maxLength={500} disabled={materials.lockedFields.includes(key)} onChange={(event) => { setFields({ ...fields, [key]: event.target.value }); setSaved(false); }} />}</label>)}</div>
        <p className="order-information-hint">仅保存以上基础字段；附件、店铺、股东和税号等资料仍需在原平台补充并最终确认。</p>
        {saved && <p className="payment-success">基础资料已保存。</p>}
        <button className="confirm-order" onClick={() => void saveMaterials()} disabled={saving}>{saving ? "正在保存…" : "保存基础资料"}</button>
      </>}
    </div>}
  </section>;
}
