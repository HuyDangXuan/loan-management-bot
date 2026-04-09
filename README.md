# Discord Expense Parser Bot

Next.js app này gi? webhook `/api/discord` cho slash command `/ask`, d?ng th?i có thêm m?t worker Discord riêng d? b?t tin nh?n thu?ng và tr? JSON khi message kh?p format chi tiêu don gi?n.

## Yêu c?u môi tru?ng

Sao chép `.env.example` thành `.env` và di?n các giá tr? Discord/Gemini c?n thi?t:

```bash
GEMINI_API_KEY=...
DISCORD_PUBLIC_KEY=...
DISCORD_BOT_TOKEN=...
DISCORD_APPLICATION_ID=...
DISCORD_GUILD_ID=...
```

Trên Discord Developer Portal, bot ph?i b?t **Message Content Intent** d? worker d?c du?c n?i dung message thu?ng.

## Ch?y local

Cài dependency:

```bash
npm install
```

Ch?y Next.js app:

```bash
npm run dev
```

M? m?t terminal khác d? ch?y Discord message worker:

```bash
npm run discord:bot
```

Ðang ký slash command `/ask` vào guild test:

```bash
npm run register:discord
```

## Hành vi message parser

Worker s? d?c m?i message thu?ng t? user trong guild channel mà bot nhìn th?y.

Ví d? input:

```text
100k cafe
```

Bot s? reply:

```json
{
  "amount": 100000,
  "item": "cafe"
}
```

Các format dang h? tr? ? v1:
- `100k cafe`
- `250 cafe sua`
- `100 K cafe`

N?u message không parse du?c, bot s? im l?ng.

## Ki?m tra

```bash
npm test
npm run lint
npx tsc --noEmit
```
