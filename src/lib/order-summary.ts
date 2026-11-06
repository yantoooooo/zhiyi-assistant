import { type Product } from "@/data/products";

export type OrderSummary = {
  selected: Product[];
  itemCount: number;
  groups: Array<{ currencyCode: string; currencyName: string; serviceFeeSubtotal: number; officialFeeSubtotal: number; subtotal: number; discount: number; total: number }>;
};

export function calculateOrderSummary(quantities: Record<string, number>, catalog: Product[], allowedProductIds?: readonly string[]): OrderSummary {
  const allowedIds = allowedProductIds ? new Set(allowedProductIds) : null;
  const selected = catalog.filter((product) => (!allowedIds || allowedIds.has(product.id)) && (quantities[product.id] ?? 0) > 0);
  const itemCount = selected.reduce((sum, product) => sum + (quantities[product.id] ?? 0), 0);
  const currencies = new Map<string, { currencyName: string; serviceFeeSubtotal: number; officialFeeSubtotal: number; subtotal: number }>();
  for (const product of selected) {
    const quantity = quantities[product.id] ?? 0;
    const group = currencies.get(product.currencyCode) ?? { currencyName: product.currencyName, serviceFeeSubtotal: 0, officialFeeSubtotal: 0, subtotal: 0 };
    group.serviceFeeSubtotal += product.serviceFee * quantity;
    group.officialFeeSubtotal += product.officialFee * quantity;
    group.subtotal += product.price * quantity;
    currencies.set(product.currencyCode, group);
  }
  const groups = [...currencies].map(([currencyCode, group]) => {
    const subtotal = Math.round(group.subtotal * 100) / 100;
    const discount = 0;
    return {
      currencyCode,
      currencyName: group.currencyName,
      serviceFeeSubtotal: Math.round(group.serviceFeeSubtotal * 100) / 100,
      officialFeeSubtotal: Math.round(group.officialFeeSubtotal * 100) / 100,
      subtotal,
      discount,
      total: Math.max(0, subtotal - discount),
    };
  });
  return { selected, itemCount, groups };
}
