export type CheckoutTicket = {
  id: string;
  name: string;
  benefitLabel?: string;
  scopeInfo?: string;
  remark?: string;
  useEndTime?: string;
};

export type CheckoutQuote = {
  source: "test-api";
  total: number;
  discount: number;
  ticketIds: string;
  tickets: CheckoutTicket[];
  itemCount: number;
  serviceFee: number;
  officialFee: number;
  warnings: string[];
};
