import "dotenv/config";

import { Client, GatewayIntentBits } from "discord.js";

import { getDiscordExpenseSheetReplyContent } from "../lib/getDiscordExpenseSheetReplyContent";

const botToken = process.env.DISCORD_BOT_TOKEN;

if (!botToken) {
  throw new Error("Missing DISCORD_BOT_TOKEN in environment variables.");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", (readyClient) => {
  console.log(`Discord message bot logged in as ${readyClient.user.tag}`);
});

client.on("messageCreate", async (message) => {
  try {
    const replyContent = await getDiscordExpenseSheetReplyContent({
      content: message.content,
      inGuild: message.inGuild(),
      isBot: message.author.bot,
      isSystem: message.system,
      discordUserId: message.author.id,
      discordUsername: message.author.username,
      discordDisplayName: message.member?.displayName ?? message.author.globalName,
    });

    if (!replyContent) {
      return;
    }

    await message.reply({
      content: replyContent,
      allowedMentions: { repliedUser: false },
    });
  } catch (error) {
    console.error("Failed to reply to Discord message:", error);
  }
});

client.on("error", (error) => {
  console.error("Discord client error:", error);
});

void client.login(botToken);
