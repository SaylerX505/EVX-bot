# EVX — Store & Order System

Discord-native store catalog and order management backed by PostgreSQL.

## Store
The public store is one persistent Embed with a category dropdown. Categories are managed from Discord and support custom emoji, display title, description, enabled state, and sort order.

Each category can contain any number of offers. An offer has its own emoji, title, description, amount, price, currency, enabled state, and sort order.

Selecting a category opens a private Components V2 page for that user. Offers are paginated and the page also shows enabled payment methods.

Payment methods are configurable independently and can be enabled or disabled without code changes.

## Orders
Staff create orders with /order add. The operator selects a category, an offer, and a payment method. A modal then asks for the operator-owned order code, customer, amount, and price.

The order code is the public lookup key and is unique case-insensitively per guild while the record exists.

Every order stores a snapshot of the selected catalog and payment details. Editing the catalog later never changes historical orders.

Lifecycle:
OPENED -> CLAIMED -> PROCESSING -> CLOSED

Cancellation is allowed from OPENED, CLAIMED, or PROCESSING.

Orders are posted as Components V2 containers in a dedicated orders channel. A separate logs channel receives an audit event for opening and every state transition.

## Retention
Orders and their event history are deleted automatically after 30 days. Cleanup runs hourly and on startup. Event rows cascade from their order.

## Commands
Store:
- /store setup
- /store publish
- /store option add|edit|delete|list
- /store offer add|edit|delete|list
- /store payment add|edit|delete|list

Orders:
- /order setup
- /order add
- /order get
- /order history

## Permissions
Store and order setup require Manage Server.

Order creation, lookup, history, and order actions require Manage Server or the configured staff role.

## Setup
1. Copy .env.example to .env.
2. Set DISCORD_TOKEN, DISCORD_CLIENT_ID, and DATABASE_URL.
3. Set GUILD_ID for fast guild-scoped command deployment during setup, or leave it unset for global commands.
4. Run npm install.
5. Run npm run migrate.
6. Run npm run deploy.
7. Run npm start.

The bot needs bot and applications.commands scopes. In the configured store/orders/logs channels it needs View Channel, Send Messages, Read Message History, and Embed Links.

The public catalog intentionally remains Embed + dropdown. Private offer pages and order messages use Components V2.
