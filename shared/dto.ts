export type PublicUser = {
  id: string;
  username: string;
  createdAt: string;
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
  totalCents: number;
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
