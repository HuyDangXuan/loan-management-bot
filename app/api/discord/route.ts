import { after } from "next/server";
import { GoogleGenAI } from "@google/genai";
import nacl from "tweetnacl";

import { DISCORD_HELP_TEXT } from "../../../lib/discordHelpText";
import { saveRoomConfig } from "../../../lib/googleSheetsExpenseStore";
import {
  formatRoomConfigSummary,
  parseRoomConfigInput,
} from "../../../lib/roomConfig";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export const runtime = "nodejs";
export const maxDuration = 15;

type DiscordCommandOption = {
  name: string;
  value?: string | number | boolean;
};

type DiscordInteractionRequest = {
  type: number;
  application_id: string;
  token: string;
  data?: {
    name?: string;
    options?: DiscordCommandOption[];
  };
};

function verifyDiscordRequest(
  body: string,
  signature: string,
  timestamp: string,
  publicKey: string
) {
  if (!signature || !timestamp || !publicKey) {
    return false;
  }

  return nacl.sign.detached.verify(
    Buffer.from(timestamp + body),
    Buffer.from(signature, "hex"),
    Buffer.from(publicKey, "hex")
  );
}

function getOptionValue(
  options: DiscordCommandOption[] | undefined,
  name: string
) {
  if (!options) {
    return "";
  }

  const found = options.find((option) => option.name === name);
  return found?.value ?? "";
}

function getIntegerOption(
  options: DiscordCommandOption[] | undefined,
  name: string
) {
  const value = getOptionValue(options, name);
  return typeof value === "number" ? value : Number.parseInt(String(value), 10);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorStatus(error: unknown): number | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }

  return undefined;
}

function parseRetryDelaySeconds(value: string) {
  const match = value.match(/([\d.]+)\s*([smh])/i);

  if (!match) {
    return null;
  }

  const amount = Number.parseFloat(match[1]);

  if (!Number.isFinite(amount)) {
    return null;
  }

  const unit = match[2].toLowerCase();
  const multiplier = unit === "h" ? 3600 : unit === "m" ? 60 : 1;
  return Math.max(1, Math.ceil(amount * multiplier));
}

function getRetryDelaySecondsFromDetails(details: unknown) {
  if (!Array.isArray(details)) {
    return null;
  }

  for (const detail of details) {
    if (
      typeof detail === "object" &&
      detail !== null &&
      "retryDelay" in detail &&
      typeof detail.retryDelay === "string"
    ) {
      return parseRetryDelaySeconds(detail.retryDelay);
    }
  }

  return null;
}

function getRetryDelaySeconds(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const detailRetryDelay = getRetryDelaySecondsFromDetails(
    "details" in error ? error.details : undefined
  );

  if (detailRetryDelay) {
    return detailRetryDelay;
  }

  if ("message" in error && typeof error.message === "string") {
    try {
      const payload = JSON.parse(error.message) as {
        error?: { details?: unknown };
      };
      const jsonRetryDelay = getRetryDelaySecondsFromDetails(payload.error?.details);

      if (jsonRetryDelay) {
        return jsonRetryDelay;
      }
    } catch {
      const textRetryDelay = parseRetryDelaySeconds(error.message);

      if (textRetryDelay) {
        return textRetryDelay;
      }
    }
  }

  return null;
}

function getGeminiRetryDelayMessage(error: unknown) {
  const retryDelaySeconds = getRetryDelaySeconds(error);

  if (retryDelaySeconds) {
    return ` Thu lai sau ${retryDelaySeconds} giay.`;
  }

  return " Thu lai sau it phut.";
}

async function callGemini(prompt: string, retries = 2): Promise<string> {
  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return (result.text || "Khong co phan hoi.").slice(0, 1900);
  } catch (error: unknown) {
    const status = getErrorStatus(error);
    console.error("Gemini error:", error);

    if ((status === 503 || status === 500) && retries > 0) {
      await sleep(1200);
      return callGemini(prompt, retries - 1);
    }

    if (status === 429) {
      return `Gemini dang het quota hoac bi gioi han toc do.${getGeminiRetryDelayMessage(
        error
      )}`;
    }

    if (status === 503) {
      return "AI dang qua tai tam thoi. Thu lai sau vai giay.";
    }

    return "Loi khi goi Gemini API.";
  }
}

async function updateOriginalResponse(
  applicationId: string,
  interactionToken: string,
  content: string
) {
  const response = await fetch(
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

  if (!response.ok) {
    const text = await response.text();
    console.error("Failed to update Discord response:", response.status, text);
  }
}

function scheduleDeferredResponseUpdate(
  body: DiscordInteractionRequest,
  task: () => Promise<string>,
  fallbackMessage: string
) {
  after(async () => {
    try {
      const content = await task();
      await updateOriginalResponse(body.application_id, body.token, content);
    } catch (error) {
      console.error("Async processing error:", error);
      await updateOriginalResponse(
        body.application_id,
        body.token,
        fallbackMessage
      );
    }
  });
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

  const body = JSON.parse(rawBody) as DiscordInteractionRequest;

  if (body.type === 1) {
    return Response.json({ type: 1 });
  }

  if (body.type !== 2) {
    return Response.json(
      { error: "Unhandled interaction type" },
      { status: 400 }
    );
  }

  const commandName = body.data?.name;

  if (commandName === "help") {
    return Response.json({
      type: 4,
      data: {
        content: DISCORD_HELP_TEXT,
      },
    });
  }

  if (commandName === "start") {
    const expectedCount = getIntegerOption(body.data?.options, "so_nguoi");
    const rawMembers = String(
      getOptionValue(body.data?.options, "thanh_vien") || ""
    ).trim();

    if (!rawMembers || !Number.isFinite(expectedCount)) {
      return Response.json({
        type: 4,
        data: {
          content:
            'Nhap day du /start so_nguoi:<n> thanh_vien:"Huy, Lan, Minh".',
        },
      });
    }

    try {
      const config = parseRoomConfigInput(expectedCount, rawMembers);
      scheduleDeferredResponseUpdate(
        body,
        async () => {
          await saveRoomConfig(config);
          return `Da cau hinh phong thanh cong: ${formatRoomConfigSummary(config)}`;
        },
        "Khong the cau hinh phong."
      );

      return Response.json({
        type: 5,
      });
    } catch (error) {
      return Response.json({
        type: 4,
        data: {
          content:
            error instanceof Error
              ? error.message.slice(0, 1900)
              : "Khong the cau hinh phong.",
        },
      });
    }
  }

  if (commandName === "ask") {
    const prompt = String(
      getOptionValue(body.data?.options, "prompt") || ""
    ).trim();

    if (!prompt) {
      return Response.json({
        type: 4,
        data: {
          content: "Ban chua nhap cau hoi.",
        },
      });
    }

    scheduleDeferredResponseUpdate(
      body,
      () => callGemini(prompt),
      "Co loi xay ra khi xu ly yeu cau."
    );

    return Response.json({
      type: 5,
    });
  }

  return Response.json({
    type: 4,
    data: {
      content: `Khong ho tro lenh /${commandName}`,
    },
  });
}
