export type PublicUser = {
  id: string;
  username: string;
  role: "admin" | "customer";
  createdAt: string;
};

export type PublicCoupon = {
  code: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  expiresAt: string | null;
};

export type PublicAddress = {
  id: string;
  cep: string;
  street: string;
  number: string;
  city: string;
  state: string;
  complement: string | null;
};

export type Product = {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  color: string;
  stockQty: number;
  active: boolean;
  createdAt: string;
};

export type CartItem = {
  id: string;
  userId: string;
  productId: string;
  qty: number;
  product: Product;
};

export type Cart = {
  items: CartItem[];
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  coupon: PublicCoupon | null;
  shippingAddress: PublicAddress | null;
};

export type OrderItem = {
  id: string;
  orderId: string;
  productId: string;
  name: string;
  unitPriceCents: number;
  qty: number;
};

export type Order = {
  id: string;
  userId: string;
  status: string;
  totalCents: number;
  createdAt: string;
  items: OrderItem[];
};
