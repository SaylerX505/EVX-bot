import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  createCategory,
  createOffer,
  createPaymentMethod,
  deleteCategory,
  deleteOffer,
  deletePaymentMethod,
  ensureGuild,
  findCategory,
  findOffer,
  findPaymentMethod,
  getCategory,
  getGuildSettings,
  getOffer,
  getPaymentMethod,
  getOrderByCode,
  getOrderById,
  insertOrder,
  insertOrderEvent,
  listCategories,
  listOffers,
  listPaymentMethods,
  listOrders,
  updateCategory,
  updateGuildSettings,
  updateOffer,
  updatePaymentMethod,
  getOrderEvents,
  withTransaction,
  getOrderForUpdate,
  updateOrderStatus,
  deleteExpiredOrders,
  attachOrderMessage,
  type Category,
  type GuildSettings,
  type Offer,
  type Order,
  type OrderEvent,
  type PaymentMethod,
} from './db.js';
import { addDays, assertTransition, type OrderStatus } from './domain.js';

export const nameSchema = z.string().trim().min(1).max(80);
export const titleSchema = z.string().trim().min(1).max(256);
export const descriptionSchema = z.string().trim().min(1).max(4000);
export const emojiSchema = z.string().trim().max(100);
export const currencySchema = z.string().trim().regex(/^[A-Za-z]{3}$/).transform((v) => v.toUpperCase());
export const amountSchema = z.string().trim().regex(/^\d{1,13}(?:\.\d{1,3})?$/);
export const priceSchema = z.string().trim().regex(/^\d{1,14}(?:\.\d{1,2})?$/);
export const codeSchema = z.string().trim().min(2).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

function emojiOrNull(value: string | undefined): string | null {
  if (value === undefined) return null;
  const v = value.trim();
  if (!v || v.toLowerCase() === 'none') return null;
  return emojiSchema.parse(v);
}

export function normalizeCategoryInput(input: { name: string; emoji?: string | undefined; title: string; description: string; sortOrder?: number | undefined }) {
  return {
    name: nameSchema.parse(input.name),
    emoji: emojiOrNull(input.emoji),
    title: titleSchema.parse(input.title),
    description: descriptionSchema.parse(input.description),
    sortOrder: input.sortOrder ?? 0,
  };
}

export function normalizeOfferInput(input: { name: string; emoji?: string | undefined; title: string; description: string; amount: string; price: string; currency: string; sortOrder?: number | undefined }) {
  return {
    name: nameSchema.parse(input.name),
    emoji: emojiOrNull(input.emoji),
    title: titleSchema.parse(input.title),
    description: descriptionSchema.parse(input.description),
    amount: amountSchema.parse(input.amount),
    price: priceSchema.parse(input.price),
    currency: currencySchema.parse(input.currency),
    sortOrder: input.sortOrder ?? 0,
  };
}

export function normalizePaymentInput(input: { name: string; emoji?: string | undefined; details: string; sortOrder?: number | undefined }) {
  return {
    name: nameSchema.parse(input.name),
    emoji: emojiOrNull(input.emoji),
    details: descriptionSchema.parse(input.details),
    sortOrder: input.sortOrder ?? 0,
  };
}

export async function configureStore(
  guildId: string,
  input: { channelId?: string | undefined; title?: string | undefined; description?: string | undefined },
): Promise<GuildSettings> {
  return updateGuildSettings(guildId, {
    ...(input.channelId !== undefined ? { store_channel_id: input.channelId } : {}),
    ...(input.title !== undefined ? { store_title: titleSchema.parse(input.title) } : {}),
    ...(input.description !== undefined ? { store_description: descriptionSchema.parse(input.description) } : {}),
  });
}

export async function configureOrders(
  guildId: string,
  input: { ordersChannelId: string; logsChannelId: string; staffRoleId?: string | null },
): Promise<GuildSettings> {
  return updateGuildSettings(guildId, {
    orders_channel_id: input.ordersChannelId,
    order_logs_channel_id: input.logsChannelId,
    staff_role_id: input.staffRoleId ?? null,
  });
}

export async function addCategory(guildId: string, input: Parameters<typeof normalizeCategoryInput>[0]): Promise<Category> {
  await ensureGuild(guildId);
  return createCategory({ guildId, ...normalizeCategoryInput(input) });
}

export async function editCategory(guildId: string, id: string, input: {
  name?: string | undefined;
  emoji?: string | undefined;
  title?: string | undefined;
  description?: string | undefined;
  sortOrder?: number | undefined;
  enabled?: boolean | undefined;
}): Promise<Category | null> {
  return updateCategory(guildId, id, {
    ...(input.name !== undefined ? { name: nameSchema.parse(input.name) } : {}),
    ...(input.emoji !== undefined ? { emoji: emojiOrNull(input.emoji) } : {}),
    ...(input.title !== undefined ? { title: titleSchema.parse(input.title) } : {}),
    ...(input.description !== undefined ? { description: descriptionSchema.parse(input.description) } : {}),
    ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
  });
}

export async function addOffer(guildId: string, categoryId: string, input: Parameters<typeof normalizeOfferInput>[0]): Promise<Offer> {
  const category = await getCategory(guildId, categoryId);
  if (!category) throw new Error('Store option/category not found.');
  return createOffer({ categoryId, ...normalizeOfferInput(input) });
}

export async function editOffer(guildId: string, id: string, input: {
  name?: string | undefined;
  emoji?: string | undefined;
  title?: string | undefined;
  description?: string | undefined;
  amount?: string | undefined;
  price?: string | undefined;
  currency?: string | undefined;
  sortOrder?: number | undefined;
  enabled?: boolean | undefined;
}): Promise<Offer | null> {
  return updateOffer(guildId, id, {
    ...(input.name !== undefined ? { name: nameSchema.parse(input.name) } : {}),
    ...(input.emoji !== undefined ? { emoji: emojiOrNull(input.emoji) } : {}),
    ...(input.title !== undefined ? { title: titleSchema.parse(input.title) } : {}),
    ...(input.description !== undefined ? { description: descriptionSchema.parse(input.description) } : {}),
    ...(input.amount !== undefined ? { amount: amountSchema.parse(input.amount) } : {}),
    ...(input.price !== undefined ? { price: priceSchema.parse(input.price) } : {}),
    ...(input.currency !== undefined ? { currency: currencySchema.parse(input.currency) } : {}),
    ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
  });
}

export async function addPayment(guildId: string, input: Parameters<typeof normalizePaymentInput>[0]): Promise<PaymentMethod> {
  await ensureGuild(guildId);
  return createPaymentMethod({ guildId, ...normalizePaymentInput(input) });
}

export async function editPayment(guildId: string, id: string, input: {
  name?: string | undefined;
  emoji?: string | undefined;
  details?: string | undefined;
  sortOrder?: number | undefined;
  enabled?: boolean | undefined;
}): Promise<PaymentMethod | null> {
  return updatePaymentMethod(guildId, id, {
    ...(input.name !== undefined ? { name: nameSchema.parse(input.name) } : {}),
    ...(input.emoji !== undefined ? { emoji: emojiOrNull(input.emoji) } : {}),
    ...(input.details !== undefined ? { details: descriptionSchema.parse(input.details) } : {}),
    ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
  });
}

export {
  ensureGuild,
  getGuildSettings,
  updateGuildSettings,
  listCategories,
  getCategory,
  findCategory,
  deleteCategory,
  listOffers,
  getOffer,
  findOffer,
  deleteOffer,
  listPaymentMethods,
  getPaymentMethod,
  findPaymentMethod,
  deletePaymentMethod,
  getOrderByCode,
  getOrderById,
  getOrderEvents,
  listOrders,
  attachOrderMessage,
  deleteExpiredOrders,
};

export type CreateOrderInput = {
  guildId: string;
  code: string;
  offerId: string;
  customerId: string;
  createdById: string;
  paymentMethodId?: string;
  amount?: string;
  price?: string;
};

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const code = codeSchema.parse(input.code);
  const amountOverride = input.amount === undefined ? undefined : amountSchema.parse(input.amount);
  const priceOverride = input.price === undefined ? undefined : priceSchema.parse(input.price);

  const offerData = await getOffer(input.guildId, input.offerId);
  if (!offerData || !offerData.offer.enabled || !offerData.category.enabled) {
    throw new Error('That offer is no longer available.');
  }

  let payment: PaymentMethod | null = null;
  if (input.paymentMethodId) {
    payment = await getPaymentMethod(input.guildId, input.paymentMethodId);
    if (!payment || !payment.enabled) throw new Error('That payment method is no longer available.');
  }

  const now = new Date();
  const expiresAt = addDays(now, 30);

  return withTransaction(async (client) => {
    const order = await insertOrder(client, {
      id: randomUUID(),
      guild_id: input.guildId,
      code,
      category_id: offerData.category.id,
      offer_id: offerData.offer.id,
      category_name_snapshot: offerData.category.name,
      offer_name_snapshot: offerData.offer.name,
      title_snapshot: offerData.offer.title,
      description_snapshot: offerData.offer.description,
      amount: amountOverride ?? offerData.offer.amount,
      price: priceOverride ?? offerData.offer.price,
      currency: offerData.offer.currency,
      payment_method_id: payment?.id ?? null,
      payment_method_snapshot: payment?.name ?? null,
      payment_details_snapshot: payment?.details ?? null,
      customer_id: input.customerId,
      created_by_id: input.createdById,
      claimed_by_id: null,
      closed_by_id: null,
      cancelled_by_id: null,
      status: 'OPENED',
      order_channel_message_id: null,
      created_at: now,
      updated_at: now,
      closed_at: null,
      cancelled_at: null,
      expires_at: expiresAt,
    });
    await insertOrderEvent(client, {
      id: randomUUID(),
      order_id: order.id,
      guild_id: input.guildId,
      event_type: 'ORDER_OPENED',
      from_status: null,
      to_status: 'OPENED',
      actor_id: input.createdById,
      metadata: {},
      created_at: now,
    });
    return order;
  });
}

export async function transitionOrder(
  guildId: string,
  orderId: string,
  actorId: string,
  target: Exclude<OrderStatus, 'OPENED'>,
): Promise<Order> {
  return withTransaction(async (client) => {
    const current = await getOrderForUpdate(client, guildId, orderId);
    if (!current) throw new Error('Order not found. It may have expired.');

    assertTransition(current.status, target);
    const now = new Date();
    const updated = await updateOrderStatus(client, guildId, orderId, current.status, target, actorId, now);
    if (!updated) throw new Error('Order changed before this action completed. Please try again.');

    await insertOrderEvent(client, {
      id: randomUUID(),
      order_id: updated.id,
      guild_id: guildId,
      event_type: 'ORDER_' + target,
      from_status: current.status,
      to_status: target,
      actor_id: actorId,
      metadata: {},
      created_at: now,
    });
    return updated;
  });
}
