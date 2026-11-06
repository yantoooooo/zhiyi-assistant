"use client";

import { useState } from "react";
import Image from "next/image";
import { Minus, Plus } from "lucide-react";
import { formatProductPrice, type Product } from "@/data/products";
import { flagImageSource } from "@/lib/flag-image";

type Props = {
  product: Product;
  index?: number;
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  onViewDetails: () => void;
};

export function ProductCard({ product, quantity, onQuantityChange, onViewDetails }: Props) {
  const [flagFailed, setFlagFailed] = useState(false);
  const selected = quantity > 0;
  const displayQuantity = Math.max(1, quantity);
  const flagSrc = flagImageSource(product.flagImage ?? "");
  const topLabels = product.topLable?.split(/[,，]/).map((label) => label.trim()).filter((label) => Boolean(label) && !/^数量\s*[:：]/.test(label)) ?? [];

  return (
    <article className={`product-card ${selected ? "selected" : ""}`}>
      <div className="product-card-top">
        <button className="product-title-action" type="button" onClick={onViewDetails} aria-label={`查看${product.name}详情`} title="查看商品详情"><span className="product-title-content">{flagSrc && !flagFailed && <Image className="product-country-flag" src={flagSrc} alt="" width={20} height={15} unoptimized onError={() => setFlagFailed(true)} />}<h3>{product.name}</h3></span></button>
        <span className="product-provider"><Image className="product-provider-logo" src="/brand/zhiyi-orange.png" alt="智蚁" width={151} height={66} /></span>
      </div>

      <div className="product-card-body">
        <div className="product-details" title={topLabels.length ? topLabels.join("\n") : undefined}>
          {topLabels.length ? topLabels.map((label, index) => <span key={`${index}-${label}`}>{label}</span>) : <>
            <span>服务类型：{product.category}</span>
            <span>国家：{product.country}</span>
            <span>服务内容：{product.description}</span>
            {product.category.includes("VAT") && <span>授权时长：1 年</span>}
          </>}
        </div>
        <div className="product-footer">
          <div><p className="product-price"><small>总价</small> {formatProductPrice(product.price * displayQuantity, product.currencyName)}</p><span className="price-label">{product.priceNote}</span></div>
          <div className="card-actions">
            {selected ? <div className="quantity-control card-quantity"><button type="button" onClick={() => onQuantityChange(quantity - 1)} aria-label={`减少${product.name}数量`}><Minus size={12} /></button><span>{quantity}</span><button type="button" onClick={() => onQuantityChange(quantity + 1)} aria-label={`增加${product.name}数量`}><Plus size={12} /></button></div>
              : <button className="add-button" type="button" onClick={() => onQuantityChange(1)} aria-label={`选择${product.name}`}><Plus size={18} /></button>}
          </div>
        </div>
      </div>
    </article>
  );
}
