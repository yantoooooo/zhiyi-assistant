import { request as httpsRequest } from "node:https";
import type { Product } from "@/data/products";

const DEFAULT_API_BASE = "https://test-2026.cyberantt.com/dev-api";
type ApiType = "1" | "2" | "3";
const TOP_LEVEL_TYPES: ApiType[] = ["1", "2", "3"];
const CACHE_MS = 60_000;
const TEST_API_HOST = "test-2026.cyberantt.com";
const TEST_PRODUCT_PATH = "/dev-api/zy/workbench/getRemenList";

type CyberanttProduct = {
  id?: unknown;
  productType?: unknown;
  productTitle?: unknown;
  productGuojia?: unknown;
  productImg?: unknown;
  productImage?: unknown;
  mapImg?: unknown;
  productContent?: unknown;
  topLable?: unknown;
  otherPriceInfo?: unknown;
  patentServePrice?: unknown;
  patentGfPrice?: unknown;
  patentTotalPrice?: unknown;
  hot?: unknown;
};

type ProductResponse = {
  code?: unknown;
  flag?: unknown;
  data?: unknown;
};

export type CatalogResult = {
  products: Product[];
  source: "test-api" | "unavailable";
  notice?: string;
};

let cache: { expiresAt: number; value: CatalogResult } | undefined;
let pending: Promise<CatalogResult> | undefined;

function text(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function categoryFor(item: CyberanttProduct, apiType: ApiType): string {
  const title = text(item.productTitle).toLocaleLowerCase();
  const productType = text(item.productType);
  if (apiType === "3") return "海外公司";
  if (apiType === "2") {
    if (productType === "1001" || /授权代表|欧代|欧盟代表/.test(title)) return "授权代表";
    if (productType.startsWith("9") || /epr|包装法|weee|deee|电池法|家具法|印刷法|玩具法|纺织法|生产者责任/.test(title)) return "EPR服务";
    if (productType.startsWith("8") || /vat|增值税|gst|jct|oss/.test(title)) return "VAT服务";
    return "跨境合规服务";
  }
  if (apiType === "1") {
    if (/商标/.test(title)) return "商标服务";
    if (/外观/.test(title)) return "外观专利";
    if (/专利/.test(title)) return "专利服务";
    if (/版权|著作权/.test(title)) return "版权服务";
    return "知识产权";
  }
  return "企业服务";
}

function normalizeProduct(value: unknown, apiType: ApiType): Product | null {
  if (!value || typeof value !== "object") return null;
  const item = value as CyberanttProduct;
  const id = text(item.id);
  const name = text(item.productTitle);
  const country = text(item.productGuojia);
  const serviceFeeText = text(item.patentServePrice);
  const officialFeeText = text(item.patentGfPrice);
  const priceText = text(item.patentTotalPrice);
  const serviceFee = Number(serviceFeeText);
  const officialFee = Number(officialFeeText);
  const rawPrice = Number(priceText);
  if (!id || !name || !serviceFeeText || !officialFeeText || !priceText
    || !Number.isFinite(serviceFee) || serviceFee < 0
    || !Number.isFinite(officialFee) || officialFee < 0
    || !Number.isFinite(rawPrice) || rawPrice < 0) return null;

  const descriptionParts = [text(item.productContent), text(item.otherPriceInfo)].filter(Boolean);
  return {
    id,
    name,
    description: descriptionParts.join(" · ") || `${name}服务`,
    topLable: text(item.topLable),
    country: country || "未注明",
    category: categoryFor(item, apiType),
    serviceFee,
    officialFee,
    price: rawPrice,
    currencyCode: "CNY",
    currencyName: "人民币",
    priceNote: "人民币参考价",
    productType: text(item.productType),
    apiType,
    image: text(item.productImg),
    flagImage: text(item.mapImg) || text(item.productImage),
    popular: Number(item.hot) === 1,
    dataSource: "test-api",
  };
}

function unavailableCatalog(notice: string): CatalogResult {
  return { products: [], source: "unavailable", notice };
}

function allowInvalidTestCertificate(url: URL): boolean {
  return process.env.NODE_ENV === "development"
    && process.env.CYBERANTT_ALLOW_INVALID_TEST_CERT === "true"
    && url.protocol === "https:"
    && url.hostname === TEST_API_HOST
    && url.pathname === TEST_PRODUCT_PATH;
}

function fetchWithInvalidTestCertificate(url: URL, authorization: string, signal: AbortSignal): Promise<ProductResponse> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(url, {
      method: "GET",
      headers: { Authorization: authorization },
      rejectUnauthorized: false,
      signal,
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 5_000_000) {
          request.destroy(new Error("Product API response exceeded 5 MB"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        if ((response.statusCode ?? 0) < 200 || (response.statusCode ?? 0) >= 300) {
          reject(new Error(`HTTP ${response.statusCode ?? 0}`));
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as ProductResponse);
        } catch (error) {
          reject(error);
        }
      });
      response.on("error", reject);
    });
    request.on("error", reject);
    request.end();
  });
}

async function loadCatalog(): Promise<CatalogResult> {
  const token = process.env.CYBERANTT_API_TOKEN?.trim();
  if (!token) {
    return unavailableCatalog("商品接口尚未配置，暂时无法加载商品。");
  }

  const baseUrl = (process.env.CYBERANTT_API_BASE_URL || DEFAULT_API_BASE).replace(/\/+$/, "");
  const authValue = token.replace(/^Bearer\s+/i, "");
  const settled = await Promise.allSettled(TOP_LEVEL_TYPES.map(async (type) => {
    const url = new URL(`${baseUrl}/zy/workbench/getRemenList`);
    url.searchParams.set("type", type);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      let payload: ProductResponse;
      if (allowInvalidTestCertificate(url)) {
        payload = await fetchWithInvalidTestCertificate(url, authValue, controller.signal);
      } else {
        const response = await fetch(url, {
          headers: { Authorization: authValue },
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        payload = await response.json() as ProductResponse;
      }
      const rows = Array.isArray(payload.data) ? payload.data : [];
      if (payload.flag === false || (payload.code != null && Number(payload.code) !== 200)) {
        throw new Error(`API returned code ${String(payload.code)}`);
      }
      return rows.map((row) => normalizeProduct(row, type)).filter((product): product is Product => product !== null && !product.name.startsWith("测试"));
    } finally {
      clearTimeout(timeout);
    }
  }));

  const liveProducts = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const uniqueProducts = [...new Map(liveProducts.map((product) => [product.id, product])).values()];
  if (!uniqueProducts.length) {
    const failures = settled.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length) console.warn("Cyberantt product API unavailable:", failures.map((result) => result.reason instanceof Error ? result.reason.message : "unknown error").join("; "));
    return unavailableCatalog(failures.length ? "商品接口暂不可用，暂时无法加载商品。" : "暂无可用商品。");
  }
  const partialFailure = settled.some((result) => result.status === "rejected");
  return {
    products: uniqueProducts,
    source: "test-api",
    notice: partialFailure ? "部分商品分类暂不可用，当前仅显示已获取的商品。" : undefined,
  };
}

export async function getProductCatalog(): Promise<CatalogResult> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  if (!pending) {
    pending = loadCatalog()
      .catch((error: unknown) => {
        console.error("Cyberantt product catalog unavailable:", error instanceof Error ? error.message : "unknown error");
        return unavailableCatalog("商品接口连接失败，暂时无法加载商品。");
      })
      .then((value) => {
        cache = { expiresAt: Date.now() + CACHE_MS, value };
        return value;
      })
      .finally(() => { pending = undefined; });
  }
  return pending;
}
