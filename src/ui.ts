import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  EmbedBuilder,
  MessageFlags,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import type { Category, Offer, PaymentMethod, Order, OrderEvent } from './db.js';
import { formatMoney, statusLabel } from './domain.js';

export const V2 = MessageFlags.IsComponentsV2;
export const V2_EPHEMERAL = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

export function text(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(content);
}

export function separator(): SeparatorBuilder {
  return new SeparatorBuilder();
}

export function button(id: string, label: string, style: ButtonStyle, disabled = false, emoji?: string): ButtonBuilder {
  const value = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
  if (emoji) value.setEmoji(emoji);
  return value;
}

export function buttonRow(...buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
}

export function container(
  ...children: Array<TextDisplayBuilder | SeparatorBuilder | ActionRowBuilder<ButtonBuilder>>
): ContainerBuilder {
  const value = new ContainerBuilder();
  for (const child of children) {
    if (child instanceof TextDisplayBuilder) value.addTextDisplayComponents(child);
    else if (child instanceof SeparatorBuilder) value.addSeparatorComponents(child);
    else value.addActionRowComponents(child);
  }
  return value;
}

export function containerWithSelect(
  selectRow: ActionRowBuilder<StringSelectMenuBuilder>,
  ...children: Array<TextDisplayBuilder | SeparatorBuilder | ActionRowBuilder<ButtonBuilder>>
): ContainerBuilder {
  const value = container(...children);
  value.addActionRowComponents(selectRow);
  return value;
}

function selectOption(label: string, value: string, description?: string, emoji?: string): StringSelectMenuOptionBuilder {
  const option = new StringSelectMenuOptionBuilder()
    .setLabel(label.slice(0, 100))
    .setValue(value);
  if (description) option.setDescription(description.slice(0, 100));
  if (emoji) option.setEmoji(emoji);
  return option;
}

export function publicStore(
  title: string,
  description: string,
  categories: Category[],
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<StringSelectMenuBuilder>[] } {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: 'Select a category to view offers' });

  const visible = categories.slice(0, 25);
  if (!visible.length) return { embeds: [embed], components: [] };

  const select = new StringSelectMenuBuilder()
    .setCustomId('store:category')
    .setPlaceholder('Choose a category')
    .addOptions(visible.map((c) => selectOption(c.name, c.id, c.title, c.emoji ?? undefined)));

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
  };
}

export function privateCategoryPage(
  category: Category,
  offers: Offer[],
  payments: PaymentMethod[],
  page: number,
): ContainerBuilder {
  const perPage = 3;
  const count = Math.max(1, Math.ceil(offers.length / perPage));
  const safe = Math.min(Math.max(page, 0), count - 1);
  const shown = offers.slice(safe * perPage, safe * perPage + perPage);
  const children: Array<TextDisplayBuilder | SeparatorBuilder | ActionRowBuilder<ButtonBuilder>> = [
    text('## ' + (category.emoji ?? '•') + ' ' + category.title + '\n' + category.description.slice(0, 900)),
    separator(),
  ];

  if (!shown.length) {
    children.push(text('There are no active offers in this category right now.'));
  } else {
    for (const offer of shown) {
      children.push(text(
        '**' + (offer.emoji ?? '•') + ' ' + offer.title + '**\n' +
        offer.description.slice(0, 700) + '\n' +
        '**Amount:** ' + offer.amount + '   **Price:** ' + formatMoney(offer.price, offer.currency),
      ));
      children.push(separator());
    }
  }

  const paymentText = payments.length
    ? payments.map((p) => (p.emoji ?? '•') + ' **' + p.name + '** — ' + p.details.slice(0, 220)).join('\n').slice(0, 2600)
    : 'Contact staff';
  children.push(text('**Payment Methods**\n' + paymentText + '\n\nPage **' + (safe + 1) + ' / ' + count + '**'));
  children.push(buttonRow(
    button('store:page:' + category.id + ':' + (safe - 1), 'Previous', ButtonStyle.Secondary, safe === 0),
    button('store:page:' + category.id + ':' + (safe + 1), 'Next', ButtonStyle.Secondary, safe >= count - 1),
    button('store:close', 'Close', ButtonStyle.Secondary),
  ));
  return container(...children);
}

export function orderCard(order: Order): ContainerBuilder {
  const payment = order.payment_method_snapshot
    ? order.payment_method_snapshot + (order.payment_details_snapshot ? ' — ' + order.payment_details_snapshot.slice(0, 800) : '')
    : 'Not specified';

  return container(
    text('## Order ' + order.code + '\n**Status:** ' + statusLabel(order.status)),
    separator(),
    text('**' + order.offer_name_snapshot + '**\n' + order.title_snapshot + '\n' + order.description_snapshot.slice(0, 1500)),
    separator(),
    text(
      '**Amount:** ' + order.amount + '\n' +
      '**Price:** ' + formatMoney(order.price, order.currency) + '\n' +
      '**Payment:** ' + payment + '\n' +
      '**Customer:** <@' + order.customer_id + '>',
    ),
    separator(),
    text(
      '**Created by:** <@' + order.created_by_id + '>\n' +
      '**Claimed by:** ' + (order.claimed_by_id ? '<@' + order.claimed_by_id + '>' : '—') + '\n' +
      '**Created:** <t:' + Math.floor(order.created_at.getTime() / 1000) + ':f>',
    ),
    separator(),
    buttonRow(
      button('order:claim:' + order.id, 'Claim', ButtonStyle.Primary, order.status !== 'OPENED', '👤'),
      button('order:process:' + order.id, 'Processing', ButtonStyle.Secondary, order.status !== 'CLAIMED', '⏳'),
      button('order:close:' + order.id, 'Close', ButtonStyle.Success, order.status !== 'PROCESSING', '✓'),
      button('order:cancel:' + order.id, 'Cancel', ButtonStyle.Danger, order.status === 'CLOSED' || order.status === 'CANCELLED', '×'),
    ),
  );
}

export function orderSummary(order: Order, events: OrderEvent[]): ContainerBuilder {
  const activity = events.slice(0, 10).map((e) =>
    '• <t:' + Math.floor(e.created_at.getTime() / 1000) + ':t> **' + e.event_type + '** by <@' + e.actor_id + '>'
  ).join('\n') || 'No events recorded.';

  return container(
    text('## Order ' + order.code + '\n**Status:** ' + statusLabel(order.status)),
    separator(),
    text(
      '**' + order.offer_name_snapshot + '**\n' +
      order.description_snapshot.slice(0, 1500) + '\n' +
      '**Amount:** ' + order.amount + '\n' +
      '**Price:** ' + formatMoney(order.price, order.currency) + '\n' +
      '**Payment:** ' + (order.payment_method_snapshot ?? 'Not specified') + '\n' +
      '**Customer:** <@' + order.customer_id + '>',
    ),
    separator(),
    text(
      '**Opened:** <t:' + Math.floor(order.created_at.getTime() / 1000) + ':F>\n' +
      '**Expires:** <t:' + Math.floor(order.expires_at.getTime() / 1000) + ':F>',
    ),
    separator(),
    text('### Activity\n' + activity),
  );
}

export function categorySelect(categories: Category[], id = 'order:add:category'): StringSelectMenuBuilder {
  return new StringSelectMenuBuilder()
    .setCustomId(id)
    .setPlaceholder('Select an option')
    .addOptions(categories.slice(0, 25).map((c) => selectOption(c.name, c.id, c.title, c.emoji ?? undefined)));
}

export function offerSelect(offers: Offer[], id = 'order:add:offer'): StringSelectMenuBuilder {
  return new StringSelectMenuBuilder()
    .setCustomId(id)
    .setPlaceholder('Select an offer')
    .addOptions(offers.slice(0, 25).map((o) => selectOption(
      o.name,
      o.id,
      o.amount + ' • ' + o.currency + ' ' + o.price,
      o.emoji ?? undefined,
    )));
}

export function paymentSelect(payments: PaymentMethod[], offerId: string): StringSelectMenuBuilder {
  return new StringSelectMenuBuilder()
    .setCustomId('order:add:payment:' + offerId)
    .setPlaceholder('Select payment method')
    .addOptions(payments.slice(0, 25).map((p) => selectOption(p.name, p.id, p.details, p.emoji ?? undefined)));
}
