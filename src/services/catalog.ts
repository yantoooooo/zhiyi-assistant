import type { Product } from "@/data/products";
import { getProductCatalog } from "@/services/cyberantt-products";

export type CatalogFilters = {
  query?: string;
  country?: string;
  category?: string;
};

export async function listProducts(filters: CatalogFilters = {}): Promise<Product[]> {
  const query = filters.query?.trim().toLocaleLowerCase();
  const catalog = await getProductCatalog();
  return catalog.products.filter((product) => {
    const matchesQuery = !query || `${product.name} ${product.description} ${product.country} ${product.category}`.toLocaleLowerCase().includes(query);
    const matchesCountry = !filters.country || product.country === filters.country;
    const matchesCategory = !filters.category || product.category === filters.category;
    return matchesQuery && matchesCountry && matchesCategory;
  });
}

export async function getProductById(id: string): Promise<Product | undefined> {
  const catalog = await getProductCatalog();
  return catalog.products.find((product) => product.id === id);
}
