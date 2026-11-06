import type { AccountOrder, AccountOrderLine, AccountProgress, AccountSection, Message } from "@/types/chat";
import { createClientId } from "@/lib/client-id";

type QueryKind = "orders" | "progress";
type QueryReply = { type?: unknown; requestId?: unknown; kind?: unknown; data?: unknown; error?: unknown };
type AccountScope = { label: string; country?: RegExp; service?: RegExp; registration: boolean };

const COUNTRIES: Array<{ label: string; pattern: RegExp }> = [
  { label: "意大利", pattern: /意大利|italy|italia/i },
  { label: "英国", pattern: /英国|英國|united kingdom|\bUK\b/i },
  { label: "德国", pattern: /德国|德國|germany/i },
  { label: "法国", pattern: /法国|法國|france/i },
  { label: "美国", pattern: /美国|美國|united states|\bUSA\b/i },
  { label: "西班牙", pattern: /西班牙|spain/i },
  { label: "日本", pattern: /日本|japan/i },
  { label: "香港", pattern: /香港|hong kong/i },
];

const SERVICES: Array<{ label: string; pattern: RegExp }> = [
  { label: "VAT", pattern: /VAT|增值税|税号/i },
  { label: "EPR", pattern: /EPR|包装法|电池法|WEEE/i },
  { label: "商标", pattern: /商标/i },
  { label: "专利", pattern: /专利/i },
  { label: "版权", pattern: /版权/i },
  { label: "公司注册", pattern: /公司注册|注册公司|香港公司/i },
];

function accountScope(text: string): AccountScope | null {
  const country = COUNTRIES.find((item) => item.pattern.test(text));
  const service = SERVICES.find((item) => item.pattern.test(text));
  if (!country && !service) return null;
  const registration = service?.label === "VAT" && /注册|申请税号/.test(text);
  return {
    label: [country?.label, service?.label, registration ? "注册" : ""].filter(Boolean).join(" "),
    country: country?.pattern,
    service: service?.pattern,
    registration,
  };
}

function matchesScope(description: string, scope: AccountScope): boolean {
  return (!scope.country || scope.country.test(description))
    && (!scope.service || scope.service.test(description))
    && (!scope.registration || /注册|税号/.test(description));
}

function matchesAccountRecord(row: Record<string, unknown>, kind: QueryKind, scope: AccountScope): boolean {
  if (kind === "progress") {
    return matchesScope([value(row.country), value(row.type), value(row.content)].join(" "), scope);
  }
  const lines = Array.isArray(row.profileOrderDiVoList) ? row.profileOrderDiVoList : [];
  const descriptions = lines.filter((line): line is Record<string, unknown> => Boolean(line && typeof line === "object"))
    .map((line) => [value(row.productName), value(line.productName),
      ...(Array.isArray(line.sizeInfoList) ? line.sizeInfoList.map((item) => value(item, 80)) : [])].join(" "));
  if (!descriptions.length) descriptions.push(value(row.productName));
  return descriptions.some((description) => matchesScope(description, scope));
}

function allowedOrigins(): string[] {
  const configured = process.env.NEXT_PUBLIC_CUSTOMER_PARENT_ORIGINS?.split(",") ?? [];
  const testWebsiteOrigin = "http://47.107.120.126:8080";
  return [...new Set(["https://www.cyberantt.com", "https://cyberantt.com", testWebsiteOrigin, ...configured.map((value) => value.trim())]
    .flatMap((value) => { try { const url = new URL(value); return url.protocol === "https:" || url.origin === testWebsiteOrigin ? [url.origin] : []; } catch { return []; } }))];
}

function value(input: unknown, maxLength = 100): string {
  return typeof input === "string" || typeof input === "number" ? String(input).trim().slice(0, maxLength) : "";
}

function records(input: unknown): Record<string, unknown>[] {
  if (!input || typeof input !== "object") return [];
  const rows = (input as { records?: unknown }).records;
  return Array.isArray(rows) ? rows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object")).slice(0, 10) : [];
}

function accountIntent(text: string): QueryKind[] {
  const kinds: QueryKind[] = [];
  if (/我的订单|查询订单|查看订单|查订单|订单列表|订单记录|订单状态/.test(text)) kinds.push("orders");
  if (/服务进度|办理进度|业务进度|资料审核进度|审核进度|进度查询|查询进度|查看进度/.test(text)) kinds.push("progress");
  return kinds;
}

export function isAccountQuery(text: string): boolean { return accountIntent(text).length > 0; }

async function requestWebsiteAccountData(kind: QueryKind): Promise<Record<string, unknown>[]> {
  if (window.parent === window) throw new Error("请在官网登录后打开智能小蚁，再查询个人订单和服务进度。");
  const origins = allowedOrigins();
  if (!origins.length) throw new Error("尚未配置安全的官网地址，暂不能查询个人数据。");
  const requestId = createClientId();
  return await new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => { cleanup(); reject(new Error("官网暂未响应查询，请确认已登录并已接入订单查询功能。")); }, 12_000);
    function cleanup() { window.clearTimeout(timer); window.removeEventListener("message", receive); }
    function receive(event: MessageEvent) {
      if (event.source !== window.parent || !origins.includes(event.origin)) return;
      const reply = event.data as QueryReply | null;
      if (!reply || reply.type !== "zhiyi.account.result" || reply.requestId !== requestId || reply.kind !== kind) return;
      cleanup();
      if (typeof reply.error === "string" && reply.error) { reject(new Error(reply.error.slice(0, 180))); return; }
      resolve(records(reply.data));
    }
    window.addEventListener("message", receive);
    for (const origin of origins) window.parent.postMessage({ type: "zhiyi.account.query", requestId, kind }, origin);
  });
}

async function requestTestAccountData(kind: QueryKind): Promise<Record<string, unknown>[]> {
  const response = await fetch(`/api/account/query?kind=${kind}`, { cache: "no-store" });
  const body = await response.json() as { data?: unknown; error?: string };
  if (!response.ok) throw new Error(body.error || "账号查询暂不可用。");
  return records(body.data);
}

function amount(input: unknown): number | null {
  if (input === null || input === undefined || input === "") return null;
  const parsed = Number(input);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function orderLine(input: Record<string, unknown>): AccountOrderLine {
  const sizeInfo = Array.isArray(input.sizeInfoList)
    ? input.sizeInfoList.map((item) => value(item, 80)).filter(Boolean).join(" · ")
    : "";
  return {
    name: value(input.productName, 140) || "企业服务",
    image: value(input.productImage, 300),
    packageName: "—",
    specification: sizeInfo || "—",
    unitPrice: amount(input.price),
    quantity: amount(input.quantity),
    amount: amount(input.amount),
  };
}

function normalizeOrders(rows: Record<string, unknown>[]): AccountOrder[] {
  return rows.map((row) => {
    const rawLines = Array.isArray(row.profileOrderDiVoList) ? row.profileOrderDiVoList : [];
    const lines = rawLines.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")).map(orderLine);
    return {
      orderNo: value(row.orderNo, 80) || "编号待更新",
      createdAt: value(row.createTime, 30),
      expiresAt: value(row.expiresTime, 30),
      status: value(row.status, 40) || "状态待更新",
      total: amount(row.patentTotalPrice),
      lines: lines.length ? lines : [{
        name: value(row.productName, 140) || "企业服务",
        image: "",
        packageName: "—",
        specification: "—",
        unitPrice: null,
        quantity: amount(row.quantity),
        amount: amount(row.patentTotalPrice),
      }],
    };
  });
}

function normalizeProgress(rows: Record<string, unknown>[]): AccountProgress[] {
  return rows.map((row, index) => ({
    id: value(row.id, 80) || `progress-${index}`,
    companyName: value(row.cname, 120) || value(row.companyName, 120) || value(row.companyNameCn, 120) || "接口未返回",
    country: value(row.country, 60) || "—",
    serviceType: value(row.type, 140) || value(row.content, 140) || "企业服务",
    serviceNo: value(row.orderNo, 80) || "接口未返回",
    status: value(row.statusName, 80) || value(row.statusLabel, 80) || value(row.status, 80) || "状态待更新",
    applicationNo: value(row.sn, 80) || "暂未取得",
    registrationNo: value(row.regSn, 80) || "暂未取得",
  }));
}

export async function respondToAccountQuery(text: string, source?: "configured-test-token"): Promise<Message> {
  const kinds = accountIntent(text);
  const scope = accountScope(text);
  const invoiceNote = /发票/.test(text) ? " 发票信息暂未由当前查询接口提供，请到官网订单中心查看。" : "";
  const settled = await Promise.allSettled(kinds.map((kind) => source === "configured-test-token" ? requestTestAccountData(kind) : requestWebsiteAccountData(kind)));
  const sections: AccountSection[] = settled.map((result, index) => {
    const kind = kinds[index];
    if (result.status === "rejected") return { kind, text: `${kind === "orders" ? "订单" : "服务进度"}查询失败：${result.reason instanceof Error ? result.reason.message : "请稍后重试。"}` };
    const matched = scope ? result.value.filter((row) => matchesAccountRecord(row, kind, scope)) : result.value;
    if (kind === "orders") return {
      kind,
      text: (scope
        ? `当前账号最近 ${result.value.length} 笔订单中，找到 ${matched.length} 笔与“${scope.label}”相关的订单。${matched.length ? "" : "如需查找更早的订单，请到官网订单中心搜索或提供订单号。"}`
        : result.value.length ? `当前账号最近的订单（${result.value.length}）` : "当前账号暂无订单记录。") + invoiceNote,
      orders: normalizeOrders(matched),
    };
    const progress = normalizeProgress(matched);
    return { kind, text: scope
      ? `当前账号最近 ${result.value.length} 项服务进度中，找到 ${progress.length} 项与“${scope.label}”相关的记录。${progress.length ? "" : "如需查找更早的记录，请到官网服务进度页面搜索。"}`
      : progress.length ? `当前账号最近的服务进度（${progress.length}）` : "当前账号暂无服务进度记录。", progress };
  });
  return { id: createClientId(), role: "assistant", text: sections.map((section) => section.text).join("\n\n"), accountPrivate: true, accountSections: sections };
}
