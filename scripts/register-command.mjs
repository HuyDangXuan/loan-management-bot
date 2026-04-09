import "dotenv/config";

const APP_ID = process.env.DISCORD_APPLICATION_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!APP_ID || !BOT_TOKEN || !GUILD_ID) {
  throw new Error(
    "Thieu DISCORD_APPLICATION_ID, DISCORD_BOT_TOKEN hoac DISCORD_GUILD_ID"
  );
}

const url = `https://discord.com/api/v10/applications/${APP_ID}/guilds/${GUILD_ID}/commands`;

const commands = [
  {
    name: "ask",
    type: 1,
    description: "Hoi Gemini AI",
    options: [
      {
        name: "prompt",
        description: "Cau hoi gui cho Gemini",
        type: 3,
        required: true,
      },
    ],
  },
  {
    name: "start",
    type: 1,
    description: "Cau hinh so nguoi va ten trong phong",
    options: [
      {
        name: "so_nguoi",
        description: "Tong so nguoi trong phong",
        type: 4,
        required: true,
      },
      {
        name: "thanh_vien",
        description: 'Danh sach ten, vd: "Huy, Lan, Minh"',
        type: 3,
        required: true,
      },
    ],
  },
  {
    name: "help",
    type: 1,
    description: "Hien thi cac lenh ho tro",
  },
];

const response = await fetch(url, {
  method: "PUT",
  headers: {
    Authorization: `Bot ${BOT_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(commands),
});

const data = await response.json();
console.log("status:", response.status);
console.log(data);
