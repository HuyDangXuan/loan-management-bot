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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGemini(prompt: string, retries = 2): Promise<string> {
  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return (result.text || "Không có phản hồi.").slice(0, 1900);
  } catch (error: any) {
    const status = error?.status;
    console.error("Gemini error:", error);

    // retry cho các lỗi tạm thời
    if ((status === 503 || status === 429 || status === 500) && retries > 0) {
      await sleep(1200);
      return callGemini(prompt, retries - 1);
    }

    if (status === 503) {
      return "AI đang quá tải tạm thời. Bạn thử lại sau vài giây nhé.";
    }

    return "Lỗi khi gọi Gemini API.";
  }
}

async function updateOriginalResponse(
  applicationId: string,
  interactionToken: string,
  content: string
) {
  const res = await fetch(
    `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: content.slice(0, 1900),
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error("Failed to update Discord response:", res.status, text);
  }
}

export async function GET() {
  return Response.json({
    ok: true,
    message: "Discord endpoint is running. Use POST for interactions.",
  });
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

  // Discord PING
  if (body.type === 1) {
    return Response.json({ type: 1 });
  }

  // Slash command
  if (body.type === 2) {
    const commandName = body.data?.name;

    if (commandName === "ask") {
      const prompt = String(
        getOptionValue(body.data?.options, "prompt") || ""
      ).trim();

      if (!prompt) {
        return Response.json({
          type: 4,
          data: {
            content: "Bạn chưa nhập câu hỏi.",
          },
        });
      }

      // Trả ACK ngay cho Discord để tránh timeout
      queueMicrotask(async () => {
        try {
          const text = await callGemini(prompt);
          await updateOriginalResponse(body.application_id, body.token, text);
        } catch (error) {
          console.error("Async processing error:", error);
          await updateOriginalResponse(
            body.application_id,
            body.token,
            "Có lỗi xảy ra khi xử lý yêu cầu."
          );
        }
      });

      // Deferred response
      return Response.json({
        type: 5,
      });
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