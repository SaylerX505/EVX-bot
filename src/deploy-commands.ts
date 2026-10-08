import { REST, Routes } from 'discord.js';
import { commandData } from './commands.js';
import { config } from './config.js';

const rest = new REST({ version: '10' }).setToken(config.discordToken);

async function main(): Promise<void> {
  if (config.guildId) {
    await rest.put(Routes.applicationGuildCommands(config.discordClientId, config.guildId), { body: commandData });
    console.log('[deploy] registered ' + commandData.length + ' commands in guild ' + config.guildId);
    return;
  }

  await rest.put(Routes.applicationCommands(config.discordClientId), { body: commandData });
  console.log('[deploy] registered ' + commandData.length + ' global commands');
}

main().catch((error) => {
  console.error('[deploy]', error);
  process.exitCode = 1;
});
