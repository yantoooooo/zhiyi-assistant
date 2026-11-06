import { apiRequest, CheckoutError } from "@/services/cyberantt-checkout";
import { assertPaymentAvailable, hasKnownOrder } from "@/services/cyberantt-payment";
import type { OrderDetails, VatMaterialDraft, VatMaterialFields } from "@/types/order";

type RawOrderLine = { id?: string; productName?: string; quantity?: number; amount?: string; typeCode?: string };
type RawOrder = {
  orderNo?: string; status?: string; createTime?: string; expiresTime?: string;
  patentTotalPrice?: string; yhPrice?: string; dtxzl?: string; profileOrderDiVoList?: RawOrderLine[];
};
type VatTask = { id?: string; orderNo?: string; country?: string; status?: string; yjTypeCode?: string; yjType?: string };
type TodoDict = { dictLabel?: string; dictValue?: string; children?: TodoDict[] };
type Page<T> = { records?: T[]; pages?: number };
type RawVat = Partial<VatMaterialFields> & { id?: string; donotModifyAttrs?: string; [key: string]: unknown };

const FIELD_KEYS: (keyof VatMaterialFields)[] = [
  "companyName", "companyNameEn", "companyYyzzNo", "companyAddrCn", "companyAddrEn",
  "companyLegal", "companyLegalEn", "companyContactsMobile", "companyContactsNameEmail",
];
const VAT_DTO_KEYS = new Set([
  ...FIELD_KEYS, "companyClrq", "companyDjjg", "companyLegalAddr", "companyLegalAddrEn",
  "companyLegalBirth", "companyLegalCardBack", "companyLegalCardFront", "companyLegalCardNum",
  "companyLegalCardType", "companyLegalCgbl", "companyLegalFrdbqzFile", "companyLegalHz",
  "companyLegalMing", "companyLegalXing", "companySqrId", "companyYyzz", "companyZcAddr",
  "companyZcd", "companyZczb", "companyZip", "companyZzqfrq", "donotModifyAttrs",
  "eoriList", "gdList", "hasEoriNo", "hasVatNo", "id", "qwshsxrq", "resumeStepCode",
  "sfsqEori", "sqrId", "taxNoList", "vatItemParam",
]);

function money(value: unknown): number | null {
  if (value == null || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function lockedFields(value: unknown): string[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string");
  } catch { /* The API may return a delimited field list. */ }
  return value.split(/[,;|\s]+/).map((key) => key.replace(/[^A-Za-z0-9_]/g, "")).filter(Boolean);
}

async function assertOrder(orderNo: string) {
  if (!/^[A-Za-z0-9-]{1,80}$/.test(orderNo)) throw new CheckoutError("订单号格式不正确。", 400);
  await assertPaymentAvailable();
  if (hasKnownOrder(orderNo)) return;
  const page = await apiRequest<Page<RawOrder>>("/zy/profile/order/list", "POST", { orderType: "0", pageIndex: 1, pageSize: 20, searchKey: orderNo });
  if (!(page.records ?? []).some((order) => order.orderNo === orderNo)) throw new CheckoutError("当前账号的订单列表中未找到该订单。", 404);
}

export async function getOrderDetails(orderNo: string): Promise<OrderDetails> {
  await assertOrder(orderNo);
  const raw = await apiRequest<RawOrder>("/zy/profile/order/queryInfoByOrderNo", "GET", undefined, new URLSearchParams({ orderNo }));
  if (raw.orderNo && raw.orderNo !== orderNo) throw new CheckoutError("订单接口返回了不匹配的订单号。", 502);
  return {
    orderNo, status: String(raw.status ?? "待更新"), createdAt: String(raw.createTime ?? ""),
    expiresAt: String(raw.expiresTime ?? ""), amount: money(raw.patentTotalPrice),
    discount: money(raw.yhPrice), pendingMaterials: money(raw.dtxzl),
    lines: (raw.profileOrderDiVoList ?? []).map((line) => ({
      id: String(line.id ?? ""), name: String(line.productName ?? "商品"),
      quantity: Number.isFinite(Number(line.quantity)) ? Number(line.quantity) : 1,
      amount: money(line.amount), typeCode: String(line.typeCode ?? ""),
    })),
  };
}

async function getVatTask(orderNo: string): Promise<VatTask> {
  await assertOrder(orderNo);
  const dictionary = await apiRequest<TodoDict[]>("/zy/workbench/ved/todoListDict", "GET", undefined, new URLSearchParams({ typeCode: "2" }));
  const codes = new Set<string>(["90"]);
  const collect = (rows: TodoDict[]) => {
    for (const row of rows) {
      if (/待填写|待提交资料|填写资料/.test(row.dictLabel ?? "") && row.dictValue) codes.add(row.dictValue);
      if (row.children) collect(row.children);
    }
  };
  collect(Array.isArray(dictionary) ? dictionary : []);
  for (const status of codes) {
    const page = await apiRequest<Page<VatTask>>("/zy/workbench/ved/todoList", "POST", { pageIndex: 1, pageSize: 100, status });
    const task = (page.records ?? []).find((item) => item.orderNo === orderNo && item.id && (item.yjTypeCode === "8" || /VAT|税号/i.test(item.yjType ?? "")));
    if (task) return task;
  }
  throw new CheckoutError("当前订单暂无可填写的 VAT 注册事项。未付款订单可能需要先完成付款，或等待工作台生成业务记录。", 404);
}

async function getVatInfo(taskId: string): Promise<RawVat> {
  return apiRequest<RawVat>("/zy/vat/taxNo/queryInfo", "GET", undefined, new URLSearchParams({ id: taskId }));
}

export async function getVatMaterials(orderNo: string): Promise<VatMaterialDraft> {
  const task = await getVatTask(orderNo);
  const taskId = String(task.id);
  const info = await getVatInfo(taskId);
  const fields = Object.fromEntries(FIELD_KEYS.map((key) => [key, typeof info[key] === "string" ? info[key] : ""])) as VatMaterialFields;
  return {
    taskId, country: String(task.country ?? ""), status: String(task.status ?? ""), fields,
    lockedFields: lockedFields(info.donotModifyAttrs).filter((key) => FIELD_KEYS.includes(key as keyof VatMaterialFields)),
  };
}

export async function saveVatMaterials(orderNo: string, fields: VatMaterialFields): Promise<void> {
  const task = await getVatTask(orderNo);
  const taskId = String(task.id);
  const current = await getVatInfo(taskId);
  const locked = new Set(lockedFields(current.donotModifyAttrs));
  const payload = Object.fromEntries(Object.entries(current).filter(([key]) => VAT_DTO_KEYS.has(key) && current[key] != null));
  payload.id = taskId;
  for (const key of FIELD_KEYS) {
    if (locked.has(key)) continue;
    payload[key] = fields[key].trim();
  }
  await apiRequest<unknown>("/zy/vat/taxNo/registerVat", "POST", payload);
}
