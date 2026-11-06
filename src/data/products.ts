export type Product = {
  id: string;
  name: string;
  description: string;
  topLable?: string;
  country: string;
  category: string;
  serviceFee: number;
  officialFee: number;
  price: number;
  currencyCode: string;
  currencyName: string;
  priceNote: string;
  productType: string;
  apiType?: "1" | "2" | "3";
  image: string;
  flagImage?: string;
  popular: boolean;
  dataSource?: "test-api";
};

export function formatProductPrice(amount: number, currencyName = "人民币") {
  const formatted = amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currencyName === "人民币" ? `¥${formatted}` : `${formatted} ${currencyName}`;
}

export function hasPriceMismatch(product: Product) {
  return Math.abs(product.serviceFee + product.officialFee - product.price) >= 0.01;
}
