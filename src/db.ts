import { Pool, type PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import type { OrderStatus } from './domain.js';
import { config } from './config.js';

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
});

pool.on('error', (error: Error) => {
  console.error('[postgres] idle client error', error);
});

export type GuildSettings = {
  guild_id: string;
  store_channel_id: string | null;
  store_message_id: string | null;
  store_title: string;
  store_description: string;
  orders_channel_id: string | null;
  order_logs_channel_id: string | null;
  staff_role_id: string | null;
};

export type Category = {
  id: string;
  guild_id: string;
  name: string;
  emoji: string | null;
  title: string;
  description: string;
  enabled: boolean;
  sort_order: number;
};

export type Offer = {
  id: string;
  category_id: string;
  name: string;
  emoji: string | null;
  title: string;
  description: string;
  amount: string;
  price: string;
  currency: string;
  enabled: boolean;
  sort_order: number;
};

export type PaymentMethod = {
  id: string;
  guild_id: string;
  name: string;
  emoji: string | null;
  details: string;
  enabled: boolean;
  sort_order: number;
};

export type Order = {
  id: string;
  guild_id: string;
  code: string;
  category_id: string | null;
  offer_id: string | null;
  category_name_snapshot: string;
  offer_name_snapshot: string;
  title_snapshot: string;
  description_snapshot: string;
  amount: string;
  price: string;
  currency: string;
  payment_method_id: string | null;
  payment_method_snapshot: string | null;
  payment_details_snapshot: string | null;
  customer_id: string;
  created_by_id: string;
  claimed_by_id: string | null;
  closed_by_id: string | null;
  cancelled_by_id: string | null;
  status: OrderStatus;
  order_channel_message_id: string | null;
  created_at: Date;
  updated_at: Date;
  closed_at: Date | null;
  cancelled_at: Date | null;
  expires_at: Date;
};

export type OrderEvent = {
  id: string;
  order_id: string;
  guild_id: string;
  event_type: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  actor_id: string;
  metadata: Record<string, unknown>;
  created_at: Date;
};

export type DbClient = PoolClient;

export async function withTransaction<T>(callback: (client: DbClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}

export async function ensureGuild(guildId: string): Promise<void> {
  await pool.query(
    'INSERT INTO guild_settings(guild_id) VALUES($1) ON CONFLICT(guild_id) DO NOTHING',
    [guildId],
  );
}

export async function getGuildSettings(guildId: string): Promise<GuildSettings | null> {
  await ensureGuild(guildId);
  const result = await pool.query<GuildSettings>(
    'SELECT * FROM guild_settings WHERE guild_id=$1',
    [guildId],
  );
  return result.rows[0] ?? null;
}

const SETTINGS_COLUMNS = {
  store_channel_id: 'store_channel_id',
  store_message_id: 'store_message_id',
  store_title: 'store_title',
  store_description: 'store_description',
  orders_channel_id: 'orders_channel_id',
  order_logs_channel_id: 'order_logs_channel_id',
  staff_role_id: 'staff_role_id',
} as const;

export async function updateGuildSettings(
  guildId: string,
  values: Partial<Pick<GuildSettings, keyof typeof SETTINGS_COLUMNS>>,
): Promise<GuildSettings> {
  await ensureGuild(guildId);
  const keys = Object.keys(values) as Array<keyof typeof SETTINGS_COLUMNS>;
  if (keys.length === 0) {
    return (await getGuildSettings(guildId)) as GuildSettings;
  }
  const params: unknown[] = [guildId];
  const sets = keys.map((key, index) => {
    params.push(values[key]);
    return SETTINGS_COLUMNS[key] + '=$' + (index + 2);
  });
  const result = await pool.query<GuildSettings>(
    'UPDATE guild_settings SET ' + sets.join(', ') + ', updated_at=now() WHERE guild_id=$1 RETURNING *',
    params,
  );
  return result.rows[0] as GuildSettings;
}

export async function listCategories(guildId: string, enabledOnly = false): Promise<Category[]> {
  const result = await pool.query<Category>(
    'SELECT * FROM store_categories WHERE guild_id=$1 ' +
      (enabledOnly ? 'AND enabled=true ' : '') +
      'ORDER BY sort_order ASC, name ASC',
    [guildId],
  );
  return result.rows;
}

export async function getCategory(guildId: string, id: string): Promise<Category | null> {
  const result = await pool.query<Category>(
    'SELECT * FROM store_categories WHERE guild_id=$1 AND id=$2',
    [guildId, id],
  );
  return result.rows[0] ?? null;
}

export async function findCategory(guildId: string, value: string): Promise<Category | null> {
  const result = await pool.query<Category>(
    'SELECT * FROM store_categories WHERE guild_id=$1 AND lower(name)=lower($2) LIMIT 1',
    [guildId, value],
  );
  return result.rows[0] ?? null;
}

export async function createCategory(input: {
  guildId: string;
  name: string;
  emoji: string | null;
  title: string;
  description: string;
  sortOrder: number;
}): Promise<Category> {
  const result = await pool.query<Category>(
    'INSERT INTO store_categories(id,guild_id,name,emoji,title,description,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [randomUUID(), input.guildId, input.name, input.emoji, input.title, input.description, input.sortOrder],
  );
  return result.rows[0] as Category;
}

export async function updateCategory(guildId: string, id: string, values: Record<string, unknown>): Promise<Category | null> {
  const allowed = ['name', 'emoji', 'title', 'description', 'enabled', 'sort_order'] as const;
  const keys = Object.keys(values).filter((key): key is typeof allowed[number] => allowed.includes(key as typeof allowed[number]));
  if (!keys.length) return getCategory(guildId, id);
  const params: unknown[] = [guildId, id];
  const sets = keys.map((key, index) => {
    params.push(values[key]);
    return key + '=$' + (index + 3);
  });
  const result = await pool.query<Category>(
    'UPDATE store_categories SET ' + sets.join(', ') + ', updated_at=now() WHERE guild_id=$1 AND id=$2 RETURNING *',
    params,
  );
  return result.rows[0] ?? null;
}

export async function deleteCategory(guildId: string, id: string): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM store_categories WHERE guild_id=$1 AND id=$2',
    [guildId, id],
  );
  return result.rowCount === 1;
}

export async function listOffers(guildId: string, categoryId: string, enabledOnly = false): Promise<Offer[]> {
  const result = await pool.query<Offer>(
    'SELECT o.* FROM store_offers o ' +
      'INNER JOIN store_categories c ON c.id=o.category_id ' +
      'WHERE c.guild_id=$1 AND o.category_id=$2 ' +
      (enabledOnly ? 'AND o.enabled=true AND c.enabled=true ' : '') +
      'ORDER BY o.sort_order ASC, o.name ASC',
    [guildId, categoryId],
  );
  return result.rows;
}

export async function getOffer(guildId: string, id: string): Promise<{ offer: Offer; category: Category } | null> {
  const result = await pool.query<Offer & { category_id: string; guild_id: string; category_name: string; category_emoji: string | null; category_title: string; category_description: string; category_enabled: boolean; category_sort_order: number }>(
    'SELECT o.*, c.id AS category_id, c.guild_id, c.name AS category_name, c.emoji AS category_emoji, c.title AS category_title, c.description AS category_description, c.enabled AS category_enabled, c.sort_order AS category_sort_order ' +
      'FROM store_offers o INNER JOIN store_categories c ON c.id=o.category_id WHERE c.guild_id=$1 AND o.id=$2',
    [guildId, id],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    offer: {
      id: row.id,
      category_id: row.category_id,
      name: row.name,
      emoji: row.emoji,
      title: row.title,
      description: row.description,
      amount: row.amount,
      price: row.price,
      currency: row.currency,
      enabled: row.enabled,
      sort_order: row.sort_order,
    },
    category: {
      id: row.category_id,
      guild_id: row.guild_id,
      name: row.category_name,
      emoji: row.category_emoji,
      title: row.category_title,
      description: row.category_description,
      enabled: row.category_enabled,
      sort_order: row.category_sort_order,
    },
  };
}

export async function findOffer(guildId: string, value: string): Promise<{ offer: Offer; category: Category } | null> {
  const result = await pool.query<Offer & { category_id: string; guild_id: string; category_name: string; category_emoji: string | null; category_title: string; category_description: string; category_enabled: boolean; category_sort_order: number }>(
    'SELECT o.*, c.id AS category_id, c.guild_id, c.name AS category_name, c.emoji AS category_emoji, c.title AS category_title, c.description AS category_description, c.enabled AS category_enabled, c.sort_order AS category_sort_order ' +
      'FROM store_offers o INNER JOIN store_categories c ON c.id=o.category_id ' +
      'WHERE c.guild_id=$1 AND (o.id::text=$2 OR lower(o.name)=lower($2)) LIMIT 1',
    [guildId, value],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    offer: {
      id: row.id,
      category_id: row.category_id,
      name: row.name,
      emoji: row.emoji,
      title: row.title,
      description: row.description,
      amount: row.amount,
      price: row.price,
      currency: row.currency,
      enabled: row.enabled,
      sort_order: row.sort_order,
    },
    category: {
      id: row.category_id,
      guild_id: row.guild_id,
      name: row.category_name,
      emoji: row.category_emoji,
      title: row.category_title,
      description: row.category_description,
      enabled: row.category_enabled,
      sort_order: row.category_sort_order,
    },
  };
}

export async function createOffer(input: {
  categoryId: string;
  name: string;
  emoji: string | null;
  title: string;
  description: string;
  amount: string;
  price: string;
  currency: string;
  sortOrder: number;
}): Promise<Offer> {
  const result = await pool.query<Offer>(
    'INSERT INTO store_offers(id,category_id,name,emoji,title,description,amount,price,currency,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
    [randomUUID(), input.categoryId, input.name, input.emoji, input.title, input.description, input.amount, input.price, input.currency, input.sortOrder],
  );
  return result.rows[0] as Offer;
}

export async function updateOffer(guildId: string, id: string, values: Record<string, unknown>): Promise<Offer | null> {
  const allowed = ['name', 'emoji', 'title', 'description', 'amount', 'price', 'currency', 'enabled', 'sort_order'] as const;
  const keys = Object.keys(values).filter((key): key is typeof allowed[number] => allowed.includes(key as typeof allowed[number]));
  if (!keys.length) {
    const row = await findOffer(guildId, id);
    return row?.offer ?? null;
  }
  const params: unknown[] = [guildId, id];
  const sets = keys.map((key, index) => {
    params.push(values[key]);
    return 'o.' + key + '=$' + (index + 3);
  });
  const result = await pool.query<Offer>(
    'UPDATE store_offers o SET ' + sets.join(', ') + ', updated_at=now() ' +
      'WHERE o.id=$2 AND o.category_id IN (SELECT id FROM store_categories WHERE guild_id=$1) RETURNING o.*',
    params,
  );
  return result.rows[0] ?? null;
}

export async function deleteOffer(guildId: string, id: string): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM store_offers WHERE id=$2 AND category_id IN (SELECT id FROM store_categories WHERE guild_id=$1)',
    [guildId, id],
  );
  return result.rowCount === 1;
}

export async function listPaymentMethods(guildId: string, enabledOnly = false): Promise<PaymentMethod[]> {
  const result = await pool.query<PaymentMethod>(
    'SELECT * FROM payment_methods WHERE guild_id=$1 ' +
      (enabledOnly ? 'AND enabled=true ' : '') +
      'ORDER BY sort_order ASC, name ASC',
    [guildId],
  );
  return result.rows;
}

export async function getPaymentMethod(guildId: string, id: string): Promise<PaymentMethod | null> {
  const result = await pool.query<PaymentMethod>(
    'SELECT * FROM payment_methods WHERE guild_id=$1 AND id=$2',
    [guildId, id],
  );
  return result.rows[0] ?? null;
}

export async function findPaymentMethod(guildId: string, value: string): Promise<PaymentMethod | null> {
  const result = await pool.query<PaymentMethod>(
    'SELECT * FROM payment_methods WHERE guild_id=$1 AND lower(name)=lower($2) LIMIT 1',
    [guildId, value],
  );
  return result.rows[0] ?? null;
}

export async function createPaymentMethod(input: {
  guildId: string;
  name: string;
  emoji: string | null;
  details: string;
  sortOrder: number;
}): Promise<PaymentMethod> {
  const result = await pool.query<PaymentMethod>(
    'INSERT INTO payment_methods(id,guild_id,name,emoji,details,sort_order) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
    [randomUUID(), input.guildId, input.name, input.emoji, input.details, input.sortOrder],
  );
  return result.rows[0] as PaymentMethod;
}

export async function updatePaymentMethod(guildId: string, id: string, values: Record<string, unknown>): Promise<PaymentMethod | null> {
  const allowed = ['name', 'emoji', 'details', 'enabled', 'sort_order'] as const;
  const keys = Object.keys(values).filter((key): key is typeof allowed[number] => allowed.includes(key as typeof allowed[number]));
  if (!keys.length) return getPaymentMethod(guildId, id);
  const params: unknown[] = [guildId, id];
  const sets = keys.map((key, index) => {
    params.push(values[key]);
    return key + '=$' + (index + 3);
  });
  const result = await pool.query<PaymentMethod>(
    'UPDATE payment_methods SET ' + sets.join(', ') + ', updated_at=now() WHERE guild_id=$1 AND id=$2 RETURNING *',
    params,
  );
  return result.rows[0] ?? null;
}

export async function deletePaymentMethod(guildId: string, id: string): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM payment_methods WHERE guild_id=$1 AND id=$2',
    [guildId, id],
  );
  return result.rowCount === 1;
}

export async function insertOrder(
  client: DbClient,
  row: Omit<Order, 'created_at' | 'updated_at' | 'closed_at' | 'cancelled_at'> & {
    created_at: Date;
    updated_at: Date;
    closed_at: Date | null;
    cancelled_at: Date | null;
  },
): Promise<Order> {
  const result = await client.query<Order>(
    'INSERT INTO orders(id,guild_id,code,category_id,offer_id,category_name_snapshot,offer_name_snapshot,title_snapshot,description_snapshot,amount,price,currency,payment_method_id,payment_method_snapshot,payment_details_snapshot,customer_id,created_by_id,status,created_at,updated_at,expires_at) ' +
      'VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *',
    [
      row.id, row.guild_id, row.code, row.category_id, row.offer_id, row.category_name_snapshot,
      row.offer_name_snapshot, row.title_snapshot, row.description_snapshot, row.amount, row.price,
      row.currency, row.payment_method_id, row.payment_method_snapshot, row.payment_details_snapshot,
      row.customer_id, row.created_by_id, row.status, row.created_at, row.updated_at, row.expires_at,
    ],
  );
  return result.rows[0] as Order;
}

export async function insertOrderEvent(
  client: DbClient,
  input: Omit<OrderEvent, 'created_at'> & { created_at: Date },
): Promise<OrderEvent> {
  const result = await client.query<OrderEvent>(
    'INSERT INTO order_events(id,order_id,guild_id,event_type,from_status,to_status,actor_id,metadata,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
    [input.id, input.order_id, input.guild_id, input.event_type, input.from_status, input.to_status, input.actor_id, input.metadata, input.created_at],
  );
  return result.rows[0] as OrderEvent;
}

export async function getOrderByCode(guildId: string, code: string): Promise<Order | null> {
  const result = await pool.query<Order>(
    'SELECT * FROM orders WHERE guild_id=$1 AND lower(code)=lower($2) LIMIT 1',
    [guildId, code],
  );
  return result.rows[0] ?? null;
}

export async function getOrderById(guildId: string, id: string): Promise<Order | null> {
  const result = await pool.query<Order>(
    'SELECT * FROM orders WHERE guild_id=$1 AND id=$2',
    [guildId, id],
  );
  return result.rows[0] ?? null;
}

export async function getOrderEvents(guildId: string, orderId: string): Promise<OrderEvent[]> {
  const result = await pool.query<OrderEvent>(
    'SELECT * FROM order_events WHERE guild_id=$1 AND order_id=$2 ORDER BY created_at DESC',
    [guildId, orderId],
  );
  return result.rows;
}

export async function listOrders(guildId: string, status: OrderStatus | null, limit: number): Promise<Order[]> {
  const params: unknown[] = [guildId];
  let sql = 'SELECT * FROM orders WHERE guild_id=$1';
  if (status) {
    params.push(status);
    sql += ' AND status=$2';
  }
  params.push(limit);
  sql += ' ORDER BY created_at DESC LIMIT $' + params.length;
  const result = await pool.query<Order>(sql, params);
  return result.rows;
}

export async function getOrderForUpdate(client: DbClient, guildId: string, id: string): Promise<Order | null> {
  const result = await client.query<Order>(
    'SELECT * FROM orders WHERE guild_id=$1 AND id=$2 FOR UPDATE',
    [guildId, id],
  );
  return result.rows[0] ?? null;
}

export async function updateOrderStatus(
  client: DbClient,
  guildId: string,
  id: string,
  fromStatus: OrderStatus,
  toStatus: OrderStatus,
  actorId: string,
  now: Date,
): Promise<Order | null> {
  const fields: string[] = ['status=$3', 'updated_at=$4'];
  const params: unknown[] = [guildId, id, toStatus, now];
  if (toStatus === 'CLAIMED') {
    fields.push('claimed_by_id=$5');
    params.push(actorId);
  } else if (toStatus === 'CLOSED') {
    fields.push('closed_by_id=$5', 'closed_at=$6');
    params.push(actorId, now);
  } else if (toStatus === 'CANCELLED') {
    fields.push('cancelled_by_id=$5', 'cancelled_at=$6');
    params.push(actorId, now);
  }
  params.push(fromStatus);
  const statusParam = '$' + params.length;
  const result = await client.query<Order>(
    'UPDATE orders SET ' + fields.join(', ') + ' WHERE guild_id=$1 AND id=$2 AND status=' + statusParam + ' RETURNING *',
    params,
  );
  return result.rows[0] ?? null;
}

export async function attachOrderMessage(guildId: string, id: string, messageId: string): Promise<boolean> {
  const result = await pool.query(
    'UPDATE orders SET order_channel_message_id=$3, updated_at=now() WHERE guild_id=$1 AND id=$2',
    [guildId, id, messageId],
  );
  return result.rowCount === 1;
}

export async function deleteExpiredOrders(now: Date): Promise<number> {
  const result = await pool.query(
    'DELETE FROM orders WHERE expires_at <= $1',
    [now],
  );
  return result.rowCount ?? 0;
}
