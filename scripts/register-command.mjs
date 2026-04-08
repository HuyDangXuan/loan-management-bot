import 'dotenv/config';

const APP_ID = process.env.DISCORD_APPLICATION_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!APP_ID || !BOT_TOKEN || !GUILD_ID) {
  throw new Error("Thiếu DISCORD_APPLICATION_ID, DISCORD_BOT_TOKEN hoặc DISCORD_GUILD_ID");
}

const url = `https://discord.com/api/v10/applications/${APP_ID}/guilds/${GUILD_ID}/commands`;

const body = {
  name: "ask",
  type: 1,
  description: "Hỏi Gemini AI",
  options: [
    {
      name: "prompt",
      description: "Câu hỏi bạn muốn gửi cho Gemini",
      type: 3,
      required: true
    }
  ]
};

const res = await fetch(url, {
  method: "POST",
  headers: {
    "Authorization": `Bot ${BOT_TOKEN}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify(body)
});

const data = await res.json();
console.log("status:", res.status);
console.log(data);