export type PaymentMethod = "1" | "2";

export type PaymentOrder = {
  orderNo: string;
  paymentMethod: PaymentMethod;
  amount: number;
  expiresTime?: string;
  imageUrl?: string;
  codeError?: string;
  paymentSkipped?: boolean;
  paymentStatus?: "pending" | "paid";
  testPaymentError?: string;
  amountChanged?: boolean;
};

export type PaymentStatus = {
  status: "pending" | "paid";
  amount?: number;
  expiresTime?: string;
};
