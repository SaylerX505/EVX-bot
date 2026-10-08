import {
  ActionRowBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type InteractionReplyOptions,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type ModalSubmitInteraction,
  type StringSelectMenuBuilder,
  type StringSelectMenuInteraction,
  type TextChannel,
} from 'discord.js';
import {
  addCategory,
  addOffer,
  addPayment,
  attachOrderMessage,
  configureOrders,
  configureStore,
  deleteCategory,
  deleteExpiredOrders,
  createOrder,
  deleteOffer,
  deletePaymentMethod,
  findCategory,
  findOffer,
  findPaymentMethod,
  getCategory,
  getGuildSettings,
  getOffer,
  getOrderByCode,
  getOrderById,
  getOrderEvents,
  getPaymentMethod,
  listCategories,
  listOffers,
  listOrders,
  listPaymentMethods,
  transitionOrder,
  editCategory,
  editOffer,
  editPayment,
} from './services.js';
import { canTransition, formatMoney, statusLabel, type OrderStatus } from './domain.js';
import { codeSchema, amountSchema, priceSchema } from './services.js';
import {
  V2,
  V2_EPHEMERAL,
  button,
  buttonRow,
  categorySelect,
  container,
  containerWithSelect,
  offerSelect,
  orderCard,
  orderSummary,
  paymentSelect,
  privateCategoryPage,
  publicStore,
  separator,
  text,
} from './ui.js';
import { canManageGuild, clip, hasStaffAccess, parseUserId, requireGuild, sqlErrorMessage } from './utils.js';
import { updateGuildSettings } from './db.js';

function errorPayload(error: unknown): InteractionReplyOptions {
  return { content: '**Error**\n' + sqlErrorMessage(error), flags: MessageFlags.Ephemeral };
}

function isGuildText(channel: unknown): channel is TextChannel {
  return Boolean(channel && typeof channel === 'object' && 'type' in channel && (channel as { type?: ChannelType }).type === ChannelType.GuildText);
}

async function channelFor(client: Client, id: string | null | undefined): Promise<TextChannel> {
  if (!id) throw new Error('This channel is not configured yet.');
  const channel = await client.channels.fetch(id);
  if (!isGuildText(channel)) throw new Error('The configured channel is missing or is not a normal text channel.');
  return channel;
}

async function refreshPublicStore(client: Client, guildId: string): Promise<void> {
  const settings = await getGuildSettings(guildId);
  if (!settings?.store_channel_id) return;
  try {
    const channel = await channelFor(client, settings.store_channel_id);
    const categories = await listCategories(guildId, true);
    const payload = publicStore(settings.store_title, settings.store_description, categories);

    if (settings.store_message_id) {
      try {
        const message = await channel.messages.fetch(settings.store_message_id);
        await message.edit(payload);
        return;
      } catch {
        // Republish below if the old message was deleted.
      }
    }

    const message = await channel.send(payload);
    await updateStoreMessageId(guildId, message.id);
  } catch (error) {
    console.error('[store] refresh failed', error);
    throw error;
  }
}

async function updateStoreMessageId(guildId: string, messageId: string | null): Promise<void> {
  await updateGuildSettings(guildId, { store_message_id: messageId });
}

function requireManager(interaction: ChatInputCommandInteraction): void {
  if (!canManageGuild(interaction)) throw new Error('Only server managers can configure the store or order system.');
}

function requireOrderStaff(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  staffRoleId: string | null | undefined,
): void {
  if (!hasStaffAccess(interaction.memberPermissions, interaction.member, staffRoleId)) {
    throw new Error('You do not have permission to manage orders.');
  }
}

async function resolveCategoryValue(guildId: string, value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? (await getCategory(guildId, value)) ?? (await findCategory(guildId, value))
    : await findCategory(guildId, value);
}

async function resolveOfferValue(guildId: string, value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? (await getOffer(guildId, value)) ?? (await findOffer(guildId, value))
    : await findOffer(guildId, value);
}

async function resolvePaymentValue(guildId: string, value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? (await getPaymentMethod(guildId, value)) ?? (await findPaymentMethod(guildId, value))
    : await findPaymentMethod(guildId, value);
}

export async function handleStoreCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  requireGuild(interaction);
  requireManager(interaction);

  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand();

  if (!group) {
    if (sub === 'setup') {
      await configureStore(interaction.guildId, {
        channelId: interaction.options.getChannel('channel', true).id,
        title: interaction.options.getString('title') ?? undefined,
        description: interaction.options.getString('description') ?? undefined,
      });
      await refreshPublicStore(interaction.client, interaction.guildId);
      await interaction.reply({ content: 'Store configuration saved and the public catalog was refreshed.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'publish') {
      const settings = await getGuildSettings(interaction.guildId);
      if (!settings?.store_channel_id) throw new Error('Run /store setup first.');
      await refreshPublicStore(interaction.client, interaction.guildId);
      await interaction.reply({ content: 'Store message published/refreshed.', flags: MessageFlags.Ephemeral });
      return;
    }
  }

  if (group === 'option') {
    if (sub === 'add') {
      const row = await addCategory(interaction.guildId, {
        name: interaction.options.getString('name', true),
        title: interaction.options.getString('title', true),
        description: interaction.options.getString('description', true),
        emoji: interaction.options.getString('emoji') ?? undefined,
        sortOrder: interaction.options.getInteger('sort') ?? 0,
      });
      await refreshPublicStore(interaction.client, interaction.guildId);
      await interaction.reply({ content: 'Created option ' + row.name + '.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'list') {
      const rows = await listCategories(interaction.guildId, false);
      const body = rows.length
        ? rows.map((row) => (row.emoji ?? '•') + ' **' + row.name + '** — ' + (row.enabled ? 'enabled' : 'disabled') + ' — ' + row.id).join('\n')
        : 'No options configured.';
      await interaction.reply({
        flags: V2_EPHEMERAL,
        components: [container(text('## Store Options\n' + clip(body)))],
      });
      return;
    }

    const category = await resolveCategoryValue(interaction.guildId, interaction.options.getString('option', true));
    if (!category) throw new Error('Store option/category not found.');

    if (sub === 'delete') {
      await deleteCategory(interaction.guildId, category.id);
      await refreshPublicStore(interaction.client, interaction.guildId);
      await interaction.reply({ content: 'Deleted option ' + category.name + ' and its offers.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'edit') {
      const updated = await editCategory(interaction.guildId, category.id, {
        name: interaction.options.getString('name') ?? undefined,
        title: interaction.options.getString('title') ?? undefined,
        description: interaction.options.getString('description') ?? undefined,
        emoji: interaction.options.getString('emoji') ?? undefined,
        enabled: interaction.options.getBoolean('enabled') ?? undefined,
        sortOrder: interaction.options.getInteger('sort') ?? undefined,
      });
      await refreshPublicStore(interaction.client, interaction.guildId);
      await interaction.reply({
        content: updated ? 'Updated option ' + updated.name + '.' : 'No changes were saved.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  if (group === 'offer') {
    if (sub === 'add') {
      const category = await resolveCategoryValue(interaction.guildId, interaction.options.getString('option', true));
      if (!category) throw new Error('Parent option/category not found.');

      const row = await addOffer(interaction.guildId, category.id, {
        name: interaction.options.getString('name', true),
        title: interaction.options.getString('title', true),
        description: interaction.options.getString('description', true),
        amount: interaction.options.getString('amount', true),
        price: interaction.options.getString('price', true),
        currency: interaction.options.getString('currency') ?? 'USD',
        emoji: interaction.options.getString('emoji') ?? undefined,
        sortOrder: interaction.options.getInteger('sort') ?? 0,
      });
      await refreshPublicStore(interaction.client, interaction.guildId);
      await interaction.reply({ content: 'Created offer ' + row.name + ' under ' + category.name + '.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'list') {
      const categoryValue = interaction.options.getString('option');
      const categories = categoryValue
        ? [await resolveCategoryValue(interaction.guildId, categoryValue)]
        : await listCategories(interaction.guildId, false);
      const lines: string[] = [];
      for (const category of categories) {
        if (!category) continue;
        const rows = await listOffers(interaction.guildId, category.id, false);
        lines.push('### ' + (category.emoji ?? '•') + ' ' + category.name);
        lines.push(rows.length
          ? rows.map((row) => (row.emoji ?? '•') + ' **' + row.name + '** — ' + (row.enabled ? 'enabled' : 'disabled') + ' — ' + formatMoney(row.price, row.currency)).join('\n')
          : 'No offers.');
      }
      await interaction.reply({
        flags: V2_EPHEMERAL,
        components: [container(text('## Store Offers\n' + clip(lines.join('\n') || 'No offers configured.')))],
      });
      return;
    }

    const offerData = await resolveOfferValue(interaction.guildId, interaction.options.getString('offer', true));
    if (!offerData) throw new Error('Offer not found.');

    if (sub === 'delete') {
      await deleteOffer(interaction.guildId, offerData.offer.id);
      await refreshPublicStore(interaction.client, interaction.guildId);
      await interaction.reply({ content: 'Deleted offer ' + offerData.offer.name + '.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'edit') {
      const updated = await editOffer(interaction.guildId, offerData.offer.id, {
        name: interaction.options.getString('name') ?? undefined,
        title: interaction.options.getString('title') ?? undefined,
        description: interaction.options.getString('description') ?? undefined,
        amount: interaction.options.getString('amount') ?? undefined,
        price: interaction.options.getString('price') ?? undefined,
        currency: interaction.options.getString('currency') ?? undefined,
        emoji: interaction.options.getString('emoji') ?? undefined,
        enabled: interaction.options.getBoolean('enabled') ?? undefined,
        sortOrder: interaction.options.getInteger('sort') ?? undefined,
      });
      await refreshPublicStore(interaction.client, interaction.guildId);
      await interaction.reply({
        content: updated ? 'Updated offer ' + updated.name + '.' : 'No changes were saved.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  if (group === 'payment') {
    if (sub === 'add') {
      const row = await addPayment(interaction.guildId, {
        name: interaction.options.getString('name', true),
        details: interaction.options.getString('details', true),
        emoji: interaction.options.getString('emoji') ?? undefined,
        sortOrder: interaction.options.getInteger('sort') ?? 0,
      });
      await refreshPublicStore(interaction.client, interaction.guildId);
      await interaction.reply({ content: 'Created payment method ' + row.name + '.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'list') {
      const rows = await listPaymentMethods(interaction.guildId, false);
      const body = rows.length
        ? rows.map((row) => (row.emoji ?? '•') + ' **' + row.name + '** — ' + (row.enabled ? 'enabled' : 'disabled') + ' — ' + row.details).join('\n')
        : 'No payment methods configured.';
      await interaction.reply({
        flags: V2_EPHEMERAL,
        components: [container(text('## Payment Methods\n' + clip(body)))],
      });
      return;
    }

    const payment = await resolvePaymentValue(interaction.guildId, interaction.options.getString('payment', true));
    if (!payment) throw new Error('Payment method not found.');

    if (sub === 'delete') {
      await deletePaymentMethod(interaction.guildId, payment.id);
      await refreshPublicStore(interaction.client, interaction.guildId);
      await interaction.reply({ content: 'Deleted payment method ' + payment.name + '.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'edit') {
      const updated = await editPayment(interaction.guildId, payment.id, {
        name: interaction.options.getString('name') ?? undefined,
        details: interaction.options.getString('details') ?? undefined,
        emoji: interaction.options.getString('emoji') ?? undefined,
        enabled: interaction.options.getBoolean('enabled') ?? undefined,
        sortOrder: interaction.options.getInteger('sort') ?? undefined,
      });
      await refreshPublicStore(interaction.client, interaction.guildId);
      await interaction.reply({
        content: updated ? 'Updated payment method ' + updated.name + '.' : 'No changes were saved.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  throw new Error('Unsupported store command.');
}

export async function handleStoreComponent(interaction: StringSelectMenuInteraction | ButtonInteraction): Promise<void> {
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'store:category') {
      const categoryId = interaction.values[0];
      if (!categoryId) throw new Error('No category selected.');
      const category = await getCategory(interaction.guildId!, categoryId);
      if (!category || !category.enabled) throw new Error('That category is no longer available.');
      const offers = await listOffers(interaction.guildId!, category.id, true);
      const payments = await listPaymentMethods(interaction.guildId!, true);
      await interaction.reply({
        flags: V2_EPHEMERAL,
        components: [privateCategoryPage(category, offers, payments, 0)],
      });
      return;
    }
  }

  if (interaction.isButton() && interaction.customId.startsWith('store:page:')) {
    const parts = interaction.customId.split(':');
    const categoryId = parts[2];
    const page = Number(parts[3]);
    if (!categoryId || !Number.isInteger(page) || page < 0) throw new Error('Invalid store page.');
    const category = await getCategory(interaction.guildId!, categoryId);
    if (!category || !category.enabled) throw new Error('That category is no longer available.');
    const offers = await listOffers(interaction.guildId!, category.id, true);
    const payments = await listPaymentMethods(interaction.guildId!, true);
    await interaction.update({ flags: V2, components: [privateCategoryPage(category, offers, payments, page)] });
    return;
  }

  if (interaction.isButton() && interaction.customId === 'store:close') {
    await interaction.update({ flags: V2, components: [container(text('## Store\nThis private view is closed.'))] });
    return;
  }
}

export async function handleOrderCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  requireGuild(interaction);
  const settings = await getGuildSettings(interaction.guildId);
  const sub = interaction.options.getSubcommand();

  if (sub === 'setup') {
    requireManager(interaction);
    const ordersChannelId = interaction.options.getChannel('orders', true).id;
    const logsChannelId = interaction.options.getChannel('logs', true).id;
    if (ordersChannelId === logsChannelId) throw new Error('Orders and logs must use different channels.');
    await configureOrders(interaction.guildId, {
      ordersChannelId,
      logsChannelId,
      staffRoleId: interaction.options.getRole('staff_role')?.id ?? null,
    });
    await interaction.reply({ content: 'Order system configuration saved.', flags: MessageFlags.Ephemeral });
    return;
  }

  requireOrderStaff(interaction, settings?.staff_role_id);

  if (sub === 'add') {
    if (!settings?.orders_channel_id || !settings.order_logs_channel_id) {
      throw new Error('Run /order setup first.');
    }
    const requested = interaction.options.getString('option');
    const categories = await listCategories(interaction.guildId, true);
    if (!categories.length) throw new Error('No enabled store options exist.');

    if (requested) {
      const category = await resolveCategoryValue(interaction.guildId, requested);
      if (!category || !category.enabled) throw new Error('Store option/category not found.');
      const offers = await listOffers(interaction.guildId, category.id, true);
      if (!offers.length) throw new Error('That option has no enabled offers.');
      await interaction.reply({
        flags: V2_EPHEMERAL,
        components: [containerWithSelect(
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(offerSelect(offers)),
          text('## New Order\n' + (category.emoji ?? '•') + ' **' + category.title + '**\n' + category.description + '\n\nSelect an offer.'),
          separator(),
        )],
      });
      return;
    }

    await interaction.reply({
      flags: V2_EPHEMERAL,
      components: [containerWithSelect(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(categorySelect(categories)),
        text('## New Order\nSelect the store option/category for this order.'),
        separator(),
      )],
    });
    return;
  }

  if (sub === 'get') {
    const code = codeSchema.parse(interaction.options.getString('code', true));
    const order = await getOrderByCode(interaction.guildId, code);
    if (!order) throw new Error('Order not found.');
    const events = await getOrderEvents(interaction.guildId, order.id);
    await interaction.reply({ flags: V2_EPHEMERAL, components: [orderSummary(order, events)] });
    return;
  }

  if (sub === 'history') {
    const status = interaction.options.getString('status') as OrderStatus | null;
    const limit = interaction.options.getInteger('limit') ?? 10;
    const rows = await listOrders(interaction.guildId, status, limit);
    const body = rows.length
      ? rows.map((row) => '**' + row.code + '** — ' + row.offer_name_snapshot + ' — ' + statusLabel(row.status) + ' — ' + formatMoney(row.price, row.currency) + ' — <t:' + Math.floor(row.created_at.getTime() / 1000) + ':R>').join('\n')
      : 'No orders found.';
    await interaction.reply({ flags: V2_EPHEMERAL, components: [container(text('## Order History\n' + clip(body)))] });
    return;
  }

  throw new Error('Unsupported order command.');
}

function buildOrderModal(
  offerId: string,
  paymentId: string,
  offer: NonNullable<Awaited<ReturnType<typeof getOffer>>>,
): ModalBuilder {
  if (!offer || !('offer' in offer)) throw new Error('Offer not found.');
  const modal = new ModalBuilder().setCustomId('order:create:' + offerId + ':' + paymentId).setTitle('Create Order');

  const input = (id: string, label: string, required: boolean, value: string | undefined, placeholder: string) => {
    const item = new TextInputBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setStyle(TextInputStyle.Short)
      .setRequired(required)
      .setMaxLength(1024)
      .setPlaceholder(placeholder);
    if (value !== undefined) item.setValue(value.slice(0, 1024));
    return new ActionRowBuilder<TextInputBuilder>().addComponents(item);
  };

  modal.addComponents(
    input('code', 'Order code', true, undefined, 'Your own order/invoice code'),
    input('customer', 'Customer', true, undefined, 'Mention or Discord user ID'),
    input('amount', 'Amount', true, offer.offer.amount, 'Default amount; you can override'),
    input('price', 'Price', true, offer.offer.price, 'Default price; you can override'),
  );
  return modal;
}

export async function handleOrderComponent(interaction: StringSelectMenuInteraction | ButtonInteraction): Promise<void> {
  if (interaction.customId === 'order:add:category' && interaction.isStringSelectMenu()) {
    const categoryId = interaction.values[0];
    if (!categoryId) throw new Error('No category selected.');
    const category = await getCategory(interaction.guildId!, categoryId);
    if (!category || !category.enabled) throw new Error('That category is no longer available.');
    const offers = await listOffers(interaction.guildId!, category.id, true);
    if (!offers.length) throw new Error('That option has no enabled offers.');
    await interaction.update({
      flags: V2,
      components: [containerWithSelect(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(offerSelect(offers)),
        text('## New Order\n' + (category.emoji ?? '•') + ' **' + category.title + '**\n' + category.description + '\n\nSelect an offer.'),
        separator(),
      )],
    });
    return;
  }

  if (interaction.customId === 'order:add:offer' && interaction.isStringSelectMenu()) {
    const offerId = interaction.values[0];
    if (!offerId) throw new Error('No offer selected.');
    const offer = await getOffer(interaction.guildId!, offerId);
    if (!offer || !offer.offer.enabled || !offer.category.enabled) throw new Error('That offer is no longer available.');
    const payments = await listPaymentMethods(interaction.guildId!, true);

    if (!payments.length) {
      await interaction.update({
        flags: V2,
        components: [container(
          text('## New Order\n**' + offer.offer.title + '**\n' + offer.offer.description + '\n\nNo payment methods are configured.'),
          separator(),
          buttonRow(button('order:add:continue:' + offer.offer.id + ':none', 'Continue', ButtonStyle.Primary)),
        )],
      });
      return;
    }

    await interaction.update({
      flags: V2,
      components: [containerWithSelect(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(paymentSelect(payments, offer.offer.id)),
        text('## New Order\n**' + offer.offer.title + '**\n' + offer.offer.description + '\n\n**Default amount:** ' + offer.offer.amount + '\n**Default price:** ' + formatMoney(offer.offer.price, offer.offer.currency) + '\n\nChoose the payment method.'),
        separator(),
      )],
    });
    return;
  }

  if (interaction.customId.startsWith('order:add:payment:') && interaction.isStringSelectMenu()) {
    const offerId = interaction.customId.split(':')[3];
    const paymentId = interaction.values[0];
    if (!offerId || !paymentId) throw new Error('Invalid order flow.');
    const payment = await getPaymentMethod(interaction.guildId!, paymentId);
    if (!payment || !payment.enabled) throw new Error('That payment method is no longer available.');
    await interaction.update({
      flags: V2,
      components: [container(
        text('## New Order\nPayment method selected: **' + (payment.emoji ?? '•') + ' ' + payment.name + '**\n\n' + payment.details),
        separator(),
        buttonRow(button('order:add:continue:' + offerId + ':' + payment.id, 'Continue', ButtonStyle.Primary)),
      )],
    });
    return;
  }

  if (interaction.customId.startsWith('order:add:continue:') && interaction.isButton()) {
    const parts = interaction.customId.split(':');
    const offerId = parts[3];
    const paymentId = parts[4];
    if (!offerId || !paymentId) throw new Error('Invalid order flow.');
    const offer = await getOffer(interaction.guildId!, offerId);
    if (!offer || !offer.offer.enabled || !offer.category.enabled) throw new Error('That offer is no longer available.');
    await interaction.showModal(buildOrderModal(offerId, paymentId, offer));
    return;
  }

  if (
    interaction.isButton() &&
    (interaction.customId.startsWith('order:claim:') ||
      interaction.customId.startsWith('order:process:') ||
      interaction.customId.startsWith('order:close:') ||
      interaction.customId.startsWith('order:cancel:'))
  ) {
    const parts = interaction.customId.split(':');
    const action = parts[1];
    const orderId = parts[2];
    if (!orderId) throw new Error('Invalid order action.');

    const settings = await getGuildSettings(interaction.guildId!);
    requireOrderStaff(interaction, settings?.staff_role_id);

    const targetMap: Record<string, Exclude<OrderStatus, 'OPENED'>> = {
      claim: 'CLAIMED',
      process: 'PROCESSING',
      close: 'CLOSED',
      cancel: 'CANCELLED',
    };
    const target = targetMap[action ?? ''];
    if (!target) throw new Error('Unknown order action.');

    const current = await getOrderById(interaction.guildId!, orderId);
    if (!current) throw new Error('Order not found. It may have expired.');
    if (!canTransition(current.status, target)) {
      throw new Error('This order cannot move from ' + statusLabel(current.status) + ' to ' + statusLabel(target) + '.');
    }

    const updated = await transitionOrder(interaction.guildId!, orderId, interaction.user.id, target);
    await interaction.update({ flags: V2, components: [orderCard(updated)] });

    if (settings?.order_logs_channel_id) {
      try {
        const channel = await channelFor(interaction.client, settings.order_logs_channel_id);
        await channel.send({
          embeds: [new EmbedBuilder()
            .setTitle('ORDER_' + target + ' • ' + updated.code)
            .setDescription('Order ' + updated.code + ' transitioned from ' + current.status + ' to ' + target + '.')
            .addFields(
              { name: 'Actor', value: '<@' + interaction.user.id + '>', inline: true },
              { name: 'Customer', value: '<@' + updated.customer_id + '>', inline: true },
            )],
        });
      } catch (error) {
        console.error('[orders] status log failed', error);
      }
    }
    return;
  }
}

export async function handleOrderModal(interaction: ModalSubmitInteraction): Promise<void> {
  const parts = interaction.customId.split(':');
  const offerId = parts[2];
  const paymentId = parts[3];
  if (!offerId || !paymentId) throw new Error('Invalid order flow.');

  const settings = await getGuildSettings(interaction.guildId!);
  if (!settings?.orders_channel_id || !settings.order_logs_channel_id) throw new Error('Run /order setup first.');
  requireOrderStaffForModal(interaction, settings.staff_role_id);

  const code = codeSchema.parse(interaction.fields.getTextInputValue('code'));
  const customerId = parseUserId(interaction.fields.getTextInputValue('customer'));
  if (!customerId) throw new Error('Customer must be a valid Discord mention or user ID.');
  const customer = await interaction.guild?.members.fetch(customerId).catch(() => null);
  if (!customer) throw new Error('Customer is not a member of this server.');

  const offer = await getOffer(interaction.guildId!, offerId);
  if (!offer || !offer.offer.enabled || !offer.category.enabled) throw new Error('That offer is no longer available.');

  const amount = amountSchema.parse(interaction.fields.getTextInputValue('amount'));
  const price = priceSchema.parse(interaction.fields.getTextInputValue('price'));

  const ordersChannel = await channelFor(interaction.client, settings.orders_channel_id);
  const logsChannel = await channelFor(interaction.client, settings.order_logs_channel_id);

  const order = await createOrder({
    guildId: interaction.guildId!,
    code,
    offerId,
    customerId,
    createdById: interaction.user.id,
    ...(paymentId !== 'none' ? { paymentMethodId: paymentId } : {}),
    amount,
    price,
  });

  let messageId: string | null = null;
  try {
    const message = await ordersChannel.send({ flags: V2, components: [orderCard(order)] });
    messageId = message.id;
    await attachOrderMessage(interaction.guildId!, order.id, message.id);
  } catch (error) {
    console.error('[orders] order message failed', error);
  }

  try {
    await logsChannel.send({
      embeds: [new EmbedBuilder()
        .setTitle('ORDER_OPENED • ' + order.code)
        .setDescription('**' + order.offer_name_snapshot + '**\n' + order.description_snapshot)
        .addFields(
          { name: 'Amount', value: order.amount, inline: true },
          { name: 'Price', value: formatMoney(order.price, order.currency), inline: true },
          { name: 'Payment', value: order.payment_method_snapshot ?? 'Not specified', inline: true },
          { name: 'Customer', value: '<@' + order.customer_id + '>', inline: true },
          { name: 'Created by', value: '<@' + order.created_by_id + '>', inline: true },
          { name: 'Message', value: messageId ? '<#' + settings.orders_channel_id + '> / ' + messageId : 'Message send failed; use /order get with the code.', inline: true },
        )],
    });
  } catch (error) {
    console.error('[orders] opened log failed', error);
  }

  await interaction.reply({
    content: messageId
      ? 'Order **' + order.code + '** created in <#' + settings.orders_channel_id + '>.'
      : 'Order **' + order.code + '** was saved, but the order-channel message could not be sent. Use /order get to retrieve it.',
    flags: MessageFlags.Ephemeral,
  });
}

function requireOrderStaffForModal(
  interaction: ModalSubmitInteraction,
  staffRoleId: string | null | undefined,
): void {
  if (!hasStaffAccess(interaction.memberPermissions, interaction.member, staffRoleId)) {
    throw new Error('You do not have permission to manage orders.');
  }
}

export async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused().toLowerCase();
  const group = interaction.options.getSubcommandGroup(false);
  if (interaction.commandName === 'store' && group === 'option') {
    const rows = await listCategories(interaction.guildId!, false);
    await interaction.respond(rows.filter((r) => r.name.toLowerCase().includes(focused)).slice(0, 25)
      .map((r) => ({ name: (r.emoji ?? '•') + ' ' + r.name, value: r.id })));
    return;
  }

  if (interaction.commandName === 'store' && group === 'offer') {
    const categories = await listCategories(interaction.guildId!, false);
    const options: Array<{ name: string; value: string }> = [];
    for (const category of categories) {
      const offers = await listOffers(interaction.guildId!, category.id, false);
      for (const offer of offers) {
        const label = category.name + ' / ' + offer.name;
        if (label.toLowerCase().includes(focused)) options.push({ name: label.slice(0, 100), value: offer.id });
      }
    }
    await interaction.respond(options.slice(0, 25));
    return;
  }

  if (interaction.commandName === 'store' && group === 'payment') {
    const rows = await listPaymentMethods(interaction.guildId!, false);
    await interaction.respond(rows.filter((r) => r.name.toLowerCase().includes(focused)).slice(0, 25)
      .map((r) => ({ name: (r.emoji ?? '•') + ' ' + r.name, value: r.id })));
    return;
  }

  if (interaction.commandName === 'order' && interaction.options.getSubcommand() === 'add') {
    const rows = await listCategories(interaction.guildId!, true);
    await interaction.respond(rows.filter((r) => r.name.toLowerCase().includes(focused)).slice(0, 25)
      .map((r) => ({ name: (r.emoji ?? '•') + ' ' + r.name, value: r.id })));
  }
}

export async function runRetentionSweep(): Promise<void> {
  try {
    const deleted = await deleteExpiredOrders(new Date());
    if (deleted) console.log('[retention] deleted ' + deleted + ' orders older than 30 days');
  } catch (error) {
    console.error('[retention] sweep failed', error);
  }
}

export function formatInteractionError(error: unknown) {
  return errorPayload(error);
}
