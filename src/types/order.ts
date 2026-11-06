export type OrderLine = {
  id: string;
  name: string;
  quantity: number;
  amount: number | null;
  typeCode: string;
};

export type OrderDetails = {
  orderNo: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  amount: number | null;
  discount: number | null;
  pendingMaterials: number | null;
  lines: OrderLine[];
};

export type VatMaterialFields = {
  companyName: string;
  companyNameEn: string;
  companyYyzzNo: string;
  companyAddrCn: string;
  companyAddrEn: string;
  companyLegal: string;
  companyLegalEn: string;
  companyContactsMobile: string;
  companyContactsNameEmail: string;
};

export type VatMaterialDraft = {
  taskId: string;
  country: string;
  status: string;
  fields: VatMaterialFields;
  lockedFields: string[];
};
