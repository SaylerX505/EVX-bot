import {
  PermissionFlagsBits,
  type APIInteractionGuildMember,
  type GuildMember,
  type Interaction,
  type PermissionsBitField,
} from 'discord.js';

export function requireGuild(interaction: Interaction): asserts interaction is Interaction & { guildId: string; guild: NonNullable<Interaction['guild']> } {
  if (!interaction.guildId || !interaction.guild) {
    throw new Error('This feature can only be used inside a server.');
  }
}

export function canManageGuild(interaction: { memberPermissions: PermissionsBitField | null }): boolean {
  return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild));
}

export function hasStaffAccess(
  memberPermissions: PermissionsBitField | null,
  member: GuildMember | APIInteractionGuildMember | null,
  staffRoleId: string | null | undefined,
): boolean {
  if (memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  if (!staffRoleId || !member) return false;
  if ('cache' in member.roles) return member.roles.cache.has(staffRoleId);
  return member.roles.includes(staffRoleId);
}

export function parseUserId(value: string): string | null {
  const input = value.trim();
  const mention = input.match(/^<@!?(\\d{16,20})>$/);
  if (mention?.[1]) return mention[1];
  return /^\\d{16,20}$/.test(input) ? input : null;
}

export function clip(value: string, max = 3800): string {
  return value.length <= max ? value : value.slice(0, max - 1) + '…';
}

export function sqlErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === '23505') {
    return 'That name or order code is already in use in this server.';
  }
  return error instanceof Error ? error.message : 'Unexpected error.';
}
