import { formatProductPrice, hasPriceMismatch, type Product } from "@/data/products";

export function PriceBreakdown({ product, quantity = 1, variant = "card" }: {
  product: Product;
  quantity?: number;
  variant?: "card" | "detail" | "order";
}) {
  return (
    <div className={`price-breakdown price-breakdown-${variant}`}>
      <span>代理费<strong>{formatProductPrice(product.serviceFee * quantity, product.currencyName)}</strong></span>
      <span>官费<strong>{formatProductPrice(product.officialFee * quantity, product.currencyName)}</strong></span>
      {hasPriceMismatch(product) && <em>费用明细与接口总价不一致，请咨询顾问</em>}
    </div>
  );
}
