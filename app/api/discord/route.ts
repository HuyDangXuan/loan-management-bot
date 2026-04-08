import { GoogleGenAI } from "@google/genai";
import nacl from "tweetnacl";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

function verifyDiscordRequest(
  body: string,
  signature: string,
  timestamp: string,
  publicKey: string
) {
  if (!signature || !timestamp || !publicKey) return false;

  return nacl.sign.detached.verify(
    Buffer.from(timestamp + body),
    Buffer.from(signature, "hex"),
    Buffer.from(publicKey, "hex")
  );
}

function getOptionValue(options: any[] | undefined, name: string) {
  if (!options) return "";
  const found = options.find((opt) => opt.name === name);
  return found?.value ?? "";
}

export async function POST(req: Request) {
  const signature = req.headers.get("X-Signature-Ed25519") || "";
  const timestamp = req.headers.get("X-Signature-Timestamp") || "";
  const rawBody = await req.text();

  const isValid = verifyDiscordRequest(
    rawBody,
    signature,
    timestamp,
    process.env.DISCORD_PUBLIC_KEY || ""
  );

  if (!isValid) {
    return new Response("invalid request signature", { status: 401 });
  }

  const body = JSON.parse(rawBody);

  // 1 = PING
  if (body.type === 1) {
    return Response.json({ type: 1 });
  }

  // 2 = APPLICATION_COMMAND
  if (body.type === 2) {
    const commandName = body.data?.name;

    if (commandName === "ask") {
      const prompt = String(getOptionValue(body.data?.options, "prompt") || "").trim();

      if (!prompt) {
        return Response.json({
          type: 4,
          data: {
            content: "Bạn chưa nhập câu hỏi.",
          },
        });
      }

      try {
        const result = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: prompt,
        });

        const text = (result.text || "Không có phản hồi.").slice(0, 1900);

        return Response.json({
          type: 4,
          data: {
            content: text,
          },
        });
      } catch (error) {
        console.error("Gemini error:", error);

        return Response.json({
          type: 4,
          data: {
            content: "Lỗi khi gọi Gemini API.",
          },
        });
      }
    }

    return Response.json({
      type: 4,
      data: {
        content: `Không hỗ trợ lệnh /${commandName}`,
      },
    });
  }

  return Response.json(
    { error: "Unhandled interaction type" },
    { status: 400 }
  );
}