import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import { config } from './config.js';
import { closeDatabase } from './db.js';
import {
  handleAutocomplete,
  handleStoreCommand,
  handleOrderCommand,
  handleStoreComponent,
  handleOrderComponent,
  handleOrderModal,
  formatInteractionError,
  runRetentionSweep,
} from './handlers.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel],
});

let retentionTimer: NodeJS.Timeout | undefined;
let shuttingDown = false;

client.once(Events.ClientReady, (readyClient) => {
  console.log('[discord] logged in as ' + readyClient.user.tag);
  void runRetentionSweep();
  retentionTimer = setInterval(() => void runRetentionSweep(), config.retentionSweepMs);
  retentionTimer.unref();
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'store') await handleStoreCommand(interaction);
      else if (interaction.commandName === 'order') await handleOrderCommand(interaction);
      return;
    }

    if (interaction.isAutocomplete()) {
      await handleAutocomplete(interaction);
      return;
    }

    if (interaction.isStringSelectMenu() || interaction.isButton()) {
      if (interaction.customId.startsWith('store:')) await handleStoreComponent(interaction);
      else if (interaction.customId.startsWith('order:')) await handleOrderComponent(interaction);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('order:create:')) {
      await handleOrderModal(interaction);
    }
  } catch (error) {
    console.error('[interaction]', error);
    const payload = formatInteractionError(error);
    try {
      if (interaction.isRepliable()) {
        if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
        else await interaction.reply(payload);
      }
    } catch (replyError) {
      console.error('[interaction-reply]', replyError);
    }
  }
});

client.on('error', (error) => console.error('[discord] client error', error));

process.on('unhandledRejection', (reason) => {
  console.error('[process] unhandled rejection', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[process] uncaught exception', error);
  process.exitCode = 1;
});

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('[process] received ' + signal + ', shutting down');
  if (retentionTimer) clearInterval(retentionTimer);
  client.destroy();
  await closeDatabase();
  process.exit(0);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

await client.login(config.discordToken);
