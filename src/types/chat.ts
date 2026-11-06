export type AccountOrderLine = {
  name: string;
  image: string;
  packageName: string;
  specification: string;
  unitPrice: number | null;
  quantity: number | null;
  amount: number | null;
};

export type AccountOrder = {
  orderNo: string;
  createdAt: string;
  expiresAt?: string;
  status: string;
  total: number | null;
  lines: AccountOrderLine[];
};

export type AccountProgress = {
  id: string;
  companyName: string;
  country: string;
  serviceType: string;
  serviceNo: string;
  status: string;
  applicationNo: string;
  registrationNo: string;
};

export type AccountSection = {
  kind: "orders" | "progress";
  text: string;
  orders?: AccountOrder[];
  progress?: AccountProgress[];
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  productIds?: string[];
  selectedQuantities?: Record<string, number>;
  attachments?: Array<{ name: string; type: string; size: number }>;
  accountPrivate?: boolean;
  accountSections?: AccountSection[];
};

export type PersistedWorkspace = {
  conversations: PersistedConversation[];
  activeConversationId: string;
};

export type PersistedConversation = {
  id: string;
  title: string;
  updatedAt: number;
  messages: Message[];
  confirmedOrderMessageId?: string | null;
};
