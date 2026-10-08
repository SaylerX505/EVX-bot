import 'dotenv/config';
import { z } from 'zod';

const env = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  GUILD_ID: z.string().min(1).optional(),
}).parse(process.env);

export const config = {
  discordToken: env.DISCORD_TOKEN,
  discordClientId: env.DISCORD_CLIENT_ID,
  databaseUrl: env.DATABASE_URL,
  guildId: env.GUILD_ID,
  retentionDays: 30,
  retentionSweepMs: 60 * 60 * 1000,
} as const;
