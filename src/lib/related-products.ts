import type { Product } from "@/data/products";
import { findRecommendations } from "@/lib/service-recommendations";
import type { Message } from "@/types/chat";

function productKey(product: Product) {
  return `${product.name.normalize("NFKC").toLocaleLowerCase()}:${product.country.normalize("NFKC").toLocaleLowerCase()}`;
}

/** Pick follow-up products from the latest answer's service and country context. */
export function getRelatedProducts(messages: Message[], catalog: Product[], limit = 3): Product[] {
  const latestAssistant = messages.findLast((message) => message.role === "assistant");
  const latestQuestion = messages.findLast((message) => message.role === "user");
  if (!latestAssistant || !latestQuestion) return [];

  const byId = new Map(catalog.map((product) => [product.id, product]));
  const shownProducts = (latestAssistant.productIds ?? [])
    .map((id) => byId.get(id))
    .filter((product): product is Product => Boolean(product));
  const anchors = shownProducts.length ? shownProducts : findRecommendations(latestQuestion.text, catalog);
  if (!anchors.length) return [];

  const excludedIds = new Set(latestAssistant.productIds ?? []);
  const excludedNames = new Set(shownProducts.map(productKey));
  const scored = catalog.flatMap((product) => {
    if (excludedIds.has(product.id) || excludedNames.has(productKey(product))) return [];
    const relevance = Math.max(0, ...anchors.map((anchor) => {
      const sameCountry = product.country !== "未注明" && product.country === anchor.country;
      const sameCategory = product.category === anchor.category;
      return sameCountry && sameCategory ? 10 : sameCountry ? 7 : sameCategory ? 3 : 0;
    }));
    return relevance ? [{ product, relevance }] : [];
  });

  scored.sort((a, b) => b.relevance - a.relevance
    || Number(Boolean(b.product.popular)) - Number(Boolean(a.product.popular))
    || a.product.name.localeCompare(b.product.name, "zh-CN"));
  const seen = new Set<string>();
  return scored.filter(({ product }) => {
    const key = productKey(product);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit).map(({ product }) => product);
}
