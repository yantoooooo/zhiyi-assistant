import type { Product } from "@/data/products";

const recommendationLimit = 8;
const broadTerms = ["有哪些服务", "所有服务", "全部", "服务列表", "服务目录", "产品列表", "商品列表"];
const serviceCategories = ["VAT服务", "EPR服务", "授权代表", "商标服务", "外观专利", "专利服务", "版权服务", "海外公司"];

const categoryMatchers: Array<{ categories: string[]; keywords: string[] }> = [
  { categories: ["VAT服务"], keywords: ["vat", "增值税", "gst", "jct", "oss", "税号"] },
  { categories: ["EPR服务"], keywords: ["epr", "包装法", "weee", "deee", "电池法", "家具法", "印刷法", "玩具法", "纺织法", "纸张法", "塑料法", "环保法", "生产者责任"] },
  { categories: ["授权代表"], keywords: ["授权代表", "欧盟代表", "欧代", "授权人", "authorized representative"] },
  { categories: ["商标服务"], keywords: ["商标", "品牌", "trademark"] },
  { categories: ["外观专利", "专利服务"], keywords: ["专利", "外观设计", "patent"] },
  { categories: ["版权服务"], keywords: ["版权", "著作权", "copyright"] },
  { categories: ["海外公司"], keywords: ["海外公司", "境外公司", "离岸公司", "公司注册", "注册公司", "公司年审", "公司注销", "开公司", "成立公司", "设立公司", "海外开公司"] },
  { categories: ["商标服务", "外观专利", "专利服务", "版权服务", "知识产权"], keywords: ["知识产权", "ipr"] },
];

const operationMatchers = ["转代理", "注册", "申报", "注销", "年审", "续展", "转让", "答辩", "异议", "宣誓", "变更", "撤销", "登记"];
const countryAliases: Record<string, string> = { 澳洲: "澳大利亚", 欧洲: "欧盟", 迪拜: "阿联酋", uae: "阿联酋" };
const ignoredTerms = ["我想", "想要", "请问", "帮我", "推荐", "服务", "商品", "怎么", "如何", "了解", "一下", "可以", "需要", "办理", "申请", "价格", "费用", "多少"];

function normalized(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function orderRecommendations(catalog: Product[], query: string, operations: string[], categoryGroups: string[] = [], countryGroups: string[] = []) {
  const compactQuery = normalized(query);
  const lowerQuery = query.normalize("NFKC").toLocaleLowerCase();
  const score = (product: Product) => {
    const name = normalized(product.name);
    const exactName = name.length >= 4 && compactQuery.includes(name);
    const operationScore = operations.filter((operation) => name.includes(operation)).length;
    const nameKeywordScore = categoryMatchers
      .flatMap(({ keywords }) => keywords)
      .filter((keyword) => lowerQuery.includes(keyword) && product.name.toLocaleLowerCase().includes(keyword)).length;
    return (exactName ? 100 : 0) + nameKeywordScore * 20 + operationScore * 10 + (product.popular ? 1 : 0);
  };
  const seen = new Set<string>();
  const ranked = [...catalog]
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name, "zh-CN"))
    .filter((product) => {
      const key = `${normalized(product.name)}:${normalized(product.country)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (categoryGroups.length <= 1 && countryGroups.length <= 1) return ranked.slice(0, recommendationLimit);

  const categories = categoryGroups.length ? categoryGroups : [null];
  const countries = countryGroups.length ? countryGroups : [null];
  const buckets = categories.flatMap((category) => countries.map((country) =>
    ranked.filter((product) => (!category || product.category === category) && (!country || product.country === country))));
  const selected: Product[] = [];
  const selectedIds = new Set<string>();
  while (selected.length < recommendationLimit && buckets.some((bucket) => bucket.length)) {
    for (const bucket of buckets) {
      const product = bucket.shift();
      if (!product || selectedIds.has(product.id)) continue;
      selected.push(product);
      selectedIds.add(product.id);
      if (selected.length === recommendationLimit) break;
    }
  }
  return selected;
}

export function findRecommendations(query: string, catalog: Product[]): Product[] {
  const text = query.normalize("NFKC").toLocaleLowerCase();
  const compactQuery = normalized(query);
  const categories = new Set(categoryMatchers
    .filter(({ keywords }) => keywords.some((keyword) => text.includes(keyword)))
    .flatMap(({ categories: matched }) => matched));
  const countries = new Set(catalog
    .map((product) => product.country)
    .filter((country) => country && country !== "未注明" && text.includes(country.toLocaleLowerCase())));
  Object.entries(countryAliases).forEach(([alias, country]) => {
    if (text.includes(alias) && catalog.some((product) => product.country === country)) countries.add(country);
  });
  const operations = operationMatchers.filter((operation) => compactQuery.includes(operation));
  const exactNames = catalog.filter((product) => {
    const name = normalized(product.name);
    return name.length >= 4 && compactQuery.includes(name);
  });

  if (!categories.size && !countries.size && broadTerms.some((term) => text.includes(term))) {
    const featured = serviceCategories
      .map((category) => orderRecommendations(catalog.filter((product) => product.category === category), query, [])[0])
      .filter((product): product is Product => Boolean(product));
    return featured.slice(0, recommendationLimit);
  }

  if (exactNames.length) {
    return orderRecommendations(exactNames, query, operations);
  }

  if (categories.size || countries.size) {
    let matched = catalog.filter((product) =>
      (!categories.size || categories.has(product.category))
      && (!countries.size || countries.has(product.country)));
    if (operations.length) {
      matched = matched.filter((product) => operations.every((operation) => normalized(product.name).includes(operation)));
    }
    return orderRecommendations(matched, query, operations, [...categories], [...countries]);
  }

  const tokens = text.split(/[\s,，。！？、]+/)
    .filter((token) => token.length > 1 && !ignoredTerms.includes(token))
    .map(normalized);
  const matched = catalog.filter((product) => {
    const searchable = normalized(`${product.name} ${product.description} ${product.country} ${product.category}`);
    return tokens.some((token) => searchable.includes(token));
  });
  return orderRecommendations(matched, query, operations);
}

export function makeAssistantReply(query: string, recommendations: Product[], catalogAvailable = true) {
  if (!catalogAvailable) {
    return "商品接口暂不可用，目前无法推荐商品或展示价格。您可以继续咨询服务办理问题，商品信息请稍后重试。";
  }
  if (!recommendations.length) {
    return "暂时没有找到直接匹配的商品。请告诉我您需要 VAT、EPR、授权代表、商标、专利、版权或海外公司中的哪类服务，以及目标国家，我会为您筛选。";
  }

  const locations = [...new Set(recommendations.map((product) => product.country))];
  const locationText = locations.length && locations.length <= 3 ? `，覆盖${locations.join("、")}` : "";
  const categories = [...new Set(recommendations.map((product) => product.category))];
  const topic = categories.length === 1 ? categories[0] : "相关企业服务";
  return `已根据“${query.slice(0, 30)}”为您筛选 ${recommendations.length} 项${topic}${locationText}。展示价格仅供参考，实际价格以结算确认结果为准。`;
}
