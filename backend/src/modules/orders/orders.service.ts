import type {
  Order as OrderDTO,
  OrderItem as OrderItemDTO,
} from "../../types/dto.js";
import * as repo from "./orders.repo.js";
import type { OrderWithItems } from "./orders.repo.js";

function toDTO(order: OrderWithItems): OrderDTO {
  const items: OrderItemDTO[] = order.items.map((item) => ({
    id: item.id,
    orderId: item.orderId,
    productId: item.productId,
    name: item.name,
    unitPriceCents: item.unitPriceCents,
    qty: item.qty,
  }));
  return {
    id: order.id,
    userId: order.userId,
    status: order.status,
    totalCents: order.totalCents,
    createdAt: order.createdAt.toISOString(),
    items,
  };
}

export async function createOrder(userId: string) {
  const result = await repo.checkoutFromCart(userId);
  if (!result.ok) return result;
  return { ok: true as const, order: toDTO(result.order) };
}

export async function listOrders(userId: string): Promise<OrderDTO[]> {
  const orders = await repo.listForUser(userId);
  return orders.map(toDTO);
}

export async function getOrder(
  userId: string,
  id: string,
): Promise<OrderDTO | null> {
  const order = await repo.findByIdForUser(id, userId);
  return order ? toDTO(order) : null;
}