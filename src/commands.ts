import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  SlashCommandBooleanOption,
  SlashCommandChannelOption,
  SlashCommandIntegerOption,
  SlashCommandRoleOption,
  SlashCommandStringOption,
} from 'discord.js';

const stringOption = (name: string, description: string, required = false) =>
  new SlashCommandStringOption().setName(name).setDescription(description).setRequired(required);

const integerOption = (name: string, description: string) =>
  new SlashCommandIntegerOption().setName(name).setDescription(description);

const channelOption = (name: string, description: string, required = false) =>
  new SlashCommandChannelOption().setName(name).setDescription(description).setRequired(required);

const roleOption = (name: string, description: string) =>
  new SlashCommandRoleOption().setName(name).setDescription(description);

const booleanOption = (name: string, description: string) =>
  new SlashCommandBooleanOption().setName(name).setDescription(description);

export const commandData = [
  new SlashCommandBuilder()
    .setName('store')
    .setDescription('Manage the public store')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s
      .setName('setup').setDescription('Configure the store message')
      .addChannelOption(channelOption('channel', 'Public store channel', true).addChannelTypes(ChannelType.GuildText))
      .addStringOption(stringOption('title', 'Store title').setMaxLength(256))
      .addStringOption(stringOption('description', 'Store description').setMaxLength(4000)))
    .addSubcommand((s) => s.setName('publish').setDescription('Publish or refresh the store message'))
    .addSubcommandGroup((g) => g
      .setName('option').setDescription('Manage store categories')
      .addSubcommand((s) => s.setName('add').setDescription('Create a category')
        .addStringOption(stringOption('name', 'Internal category name', true).setMaxLength(80))
        .addStringOption(stringOption('title', 'Display title', true).setMaxLength(256))
        .addStringOption(stringOption('description', 'Display description', true).setMaxLength(4000))
        .addStringOption(stringOption('emoji', 'Unicode or custom Discord emoji'))
        .addIntegerOption(integerOption('sort', 'Display order').setMinValue(0)))
      .addSubcommand((s) => s.setName('edit').setDescription('Edit a category')
        .addStringOption(stringOption('option', 'Category', true).setAutocomplete(true))
        .addStringOption(stringOption('name', 'New internal name').setMaxLength(80))
        .addStringOption(stringOption('title', 'New display title').setMaxLength(256))
        .addStringOption(stringOption('description', 'New description').setMaxLength(4000))
        .addStringOption(stringOption('emoji', 'New emoji; use none to clear'))
        .addBooleanOption(booleanOption('enabled', 'Show this category in the store'))
        .addIntegerOption(integerOption('sort', 'Display order').setMinValue(0)))
      .addSubcommand((s) => s.setName('delete').setDescription('Delete a category and its offers')
        .addStringOption(stringOption('option', 'Category', true).setAutocomplete(true)))
      .addSubcommand((s) => s.setName('list').setDescription('List categories')))
    .addSubcommandGroup((g) => g
      .setName('offer').setDescription('Manage offers')
      .addSubcommand((s) => s.setName('add').setDescription('Create an offer')
        .addStringOption(stringOption('option', 'Parent category', true).setAutocomplete(true))
        .addStringOption(stringOption('name', 'Internal offer name', true).setMaxLength(80))
        .addStringOption(stringOption('title', 'Display title', true).setMaxLength(256))
        .addStringOption(stringOption('description', 'Display description', true).setMaxLength(4000))
        .addStringOption(stringOption('amount', 'Default quantity/amount', true).setMaxLength(30))
        .addStringOption(stringOption('price', 'Default price', true).setMaxLength(30))
        .addStringOption(stringOption('currency', '3-letter currency').setMaxLength(3))
        .addStringOption(stringOption('emoji', 'Offer emoji'))
        .addIntegerOption(integerOption('sort', 'Display order').setMinValue(0)))
      .addSubcommand((s) => s.setName('edit').setDescription('Edit an offer')
        .addStringOption(stringOption('offer', 'Offer', true).setAutocomplete(true))
        .addStringOption(stringOption('name', 'New internal name').setMaxLength(80))
        .addStringOption(stringOption('title', 'New title').setMaxLength(256))
        .addStringOption(stringOption('description', 'New description').setMaxLength(4000))
        .addStringOption(stringOption('amount', 'New default amount').setMaxLength(30))
        .addStringOption(stringOption('price', 'New default price').setMaxLength(30))
        .addStringOption(stringOption('currency', 'New currency').setMaxLength(3))
        .addStringOption(stringOption('emoji', 'New emoji; use none to clear'))
        .addBooleanOption(booleanOption('enabled', 'Show this offer'))
        .addIntegerOption(integerOption('sort', 'Display order').setMinValue(0)))
      .addSubcommand((s) => s.setName('delete').setDescription('Delete an offer')
        .addStringOption(stringOption('offer', 'Offer', true).setAutocomplete(true)))
      .addSubcommand((s) => s.setName('list').setDescription('List offers')
        .addStringOption(stringOption('option', 'Optional category').setAutocomplete(true))))
    .addSubcommandGroup((g) => g
      .setName('payment').setDescription('Manage payment methods')
      .addSubcommand((s) => s.setName('add').setDescription('Create a payment method')
        .addStringOption(stringOption('name', 'Payment method name', true).setMaxLength(80))
        .addStringOption(stringOption('details', 'Payment details', true).setMaxLength(4000))
        .addStringOption(stringOption('emoji', 'Payment emoji'))
        .addIntegerOption(integerOption('sort', 'Display order').setMinValue(0)))
      .addSubcommand((s) => s.setName('edit').setDescription('Edit a payment method')
        .addStringOption(stringOption('payment', 'Payment method', true).setAutocomplete(true))
        .addStringOption(stringOption('name', 'New name').setMaxLength(80))
        .addStringOption(stringOption('details', 'New details').setMaxLength(4000))
        .addStringOption(stringOption('emoji', 'New emoji; use none to clear'))
        .addBooleanOption(booleanOption('enabled', 'Whether customers can see it'))
        .addIntegerOption(integerOption('sort', 'Display order').setMinValue(0)))
      .addSubcommand((s) => s.setName('delete').setDescription('Delete a payment method')
        .addStringOption(stringOption('payment', 'Payment method', true).setAutocomplete(true)))
      .addSubcommand((s) => s.setName('list').setDescription('List payment methods'))),
  new SlashCommandBuilder()
    .setName('order')
    .setDescription('Create and manage orders')
    .addSubcommand((s) => s.setName('setup').setDescription('Configure order channels')
      .addChannelOption(channelOption('orders', 'Orders channel', true).addChannelTypes(ChannelType.GuildText))
      .addChannelOption(channelOption('logs', 'Order logs channel', true).addChannelTypes(ChannelType.GuildText))
      .addRoleOption(roleOption('staff_role', 'Optional role allowed to manage orders')))
    .addSubcommand((s) => s.setName('add').setDescription('Create an order')
      .addStringOption(stringOption('option', 'Optional category').setAutocomplete(true)))
    .addSubcommand((s) => s.setName('get').setDescription('Find an order by its code')
      .addStringOption(stringOption('code', 'Order code', true).setMaxLength(64)))
    .addSubcommand((s) => s.setName('history').setDescription('Browse recent orders')
      .addStringOption(new SlashCommandStringOption().setName('status').setDescription('Status').addChoices(
        { name: 'Opened', value: 'OPENED' },
        { name: 'Claimed', value: 'CLAIMED' },
        { name: 'Processing', value: 'PROCESSING' },
        { name: 'Closed', value: 'CLOSED' },
        { name: 'Cancelled', value: 'CANCELLED' },
      ))
      .addIntegerOption(integerOption('limit', 'Maximum rows').setMinValue(1).setMaxValue(20))),
].map((command) => command.toJSON());
