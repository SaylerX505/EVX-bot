CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id varchar(32) PRIMARY KEY,
  store_channel_id varchar(32),
  store_message_id varchar(32),
  store_title varchar(256) NOT NULL DEFAULT 'EVX Store',
  store_description text NOT NULL DEFAULT 'Choose a category to view current offers.',
  orders_channel_id varchar(32),
  order_logs_channel_id varchar(32),
  staff_role_id varchar(32),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS store_categories (
  id uuid PRIMARY KEY,
  guild_id varchar(32) NOT NULL REFERENCES guild_settings(guild_id) ON DELETE CASCADE,
  name varchar(80) NOT NULL,
  emoji varchar(100),
  title varchar(256) NOT NULL,
  description text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS store_categories_guild_name_uq ON store_categories(guild_id, lower(name));
CREATE INDEX IF NOT EXISTS store_categories_guild_sort_idx ON store_categories(guild_id, enabled, sort_order);

CREATE TABLE IF NOT EXISTS store_offers (
  id uuid PRIMARY KEY,
  category_id uuid NOT NULL REFERENCES store_categories(id) ON DELETE CASCADE,
  name varchar(80) NOT NULL,
  emoji varchar(100),
  title varchar(256) NOT NULL,
  description text NOT NULL,
  amount numeric(16,3) NOT NULL CHECK (amount >= 0),
  price numeric(16,2) NOT NULL CHECK (price >= 0),
  currency varchar(3) NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS store_offers_category_name_uq ON store_offers(category_id, lower(name));
CREATE INDEX IF NOT EXISTS store_offers_category_sort_idx ON store_offers(category_id, enabled, sort_order);

CREATE TABLE IF NOT EXISTS payment_methods (
  id uuid PRIMARY KEY,
  guild_id varchar(32) NOT NULL REFERENCES guild_settings(guild_id) ON DELETE CASCADE,
  name varchar(80) NOT NULL,
  emoji varchar(100),
  details text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_methods_guild_name_uq ON payment_methods(guild_id, lower(name));
CREATE INDEX IF NOT EXISTS payment_methods_guild_sort_idx ON payment_methods(guild_id, enabled, sort_order);

DO $$
BEGIN
  CREATE TYPE order_status AS ENUM ('OPENED', 'CLAIMED', 'PROCESSING', 'CLOSED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY,
  guild_id varchar(32) NOT NULL REFERENCES guild_settings(guild_id) ON DELETE CASCADE,
  code varchar(64) NOT NULL,
  category_id uuid REFERENCES store_categories(id) ON DELETE SET NULL,
  offer_id uuid REFERENCES store_offers(id) ON DELETE SET NULL,
  category_name_snapshot varchar(80) NOT NULL,
  offer_name_snapshot varchar(80) NOT NULL,
  title_snapshot varchar(256) NOT NULL,
  description_snapshot text NOT NULL,
  amount numeric(16,3) NOT NULL CHECK (amount >= 0),
  price numeric(16,2) NOT NULL CHECK (price >= 0),
  currency varchar(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  payment_method_id uuid REFERENCES payment_methods(id) ON DELETE SET NULL,
  payment_method_snapshot varchar(80),
  payment_details_snapshot text,
  customer_id varchar(32) NOT NULL,
  created_by_id varchar(32) NOT NULL,
  claimed_by_id varchar(32),
  closed_by_id varchar(32),
  cancelled_by_id varchar(32),
  status order_status NOT NULL DEFAULT 'OPENED',
  order_channel_message_id varchar(32),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  cancelled_at timestamptz,
  expires_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS orders_guild_code_uq ON orders(guild_id, lower(code));
CREATE INDEX IF NOT EXISTS orders_guild_status_idx ON orders(guild_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_expires_idx ON orders(expires_at);

CREATE TABLE IF NOT EXISTS order_events (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  guild_id varchar(32) NOT NULL REFERENCES guild_settings(guild_id) ON DELETE CASCADE,
  event_type varchar(40) NOT NULL,
  from_status order_status,
  to_status order_status NOT NULL,
  actor_id varchar(32) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_events_order_created_idx ON order_events(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_events_guild_created_idx ON order_events(guild_id, created_at DESC);
