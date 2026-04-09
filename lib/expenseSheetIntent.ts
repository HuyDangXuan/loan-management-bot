import { GoogleGenAI } from "@google/genai";

import type { ExpenseSplitMode } from "./expenseSettlement";
import type { ExpenseMessage } from "./parseExpenseMessage";

export type ExpenseSheetIntent = {
  action: "add" | "update" | "delete" | "noop";
  rowNumber: number | null;
  amount: number | null;
  item: string | null;
  payerName: string | null;
  splitMode: ExpenseSplitMode;
  participantCount: number | null;
  note: string | null;
  reason: string | null;
};

type InferExpenseSheetIntentInput = {
  message: string;
  parsedExpense: ExpenseMessage | null;
  roomMembers: string[];
  senderName: string | null;
  senderUsername: string;
};

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

function buildPrompt({
  message,
  parsedExpense,
  roomMembers,
  senderName,
  senderUsername,
}: InferExpenseSheetIntentInput) {
  return `
Ban la bo phan tich lenh chi tieu cho Discord bot.
Hay doc tin nhan cua user va tra ve DUY NHAT mot JSON hop le.

Muc tieu:
- Xac dinh action: add, update, delete, hoac noop.
- Xac dinh payerName neu cau co nhac ten nguoi tra tien.
- Xac dinh splitMode:
  - "none" neu khong co y chia tien theo phong
  - "all_room" neu cau co y "cho ca phong", "ca phong", "moi nguoi", "chia deu", hoac "chia N" cho toan phong
- Xac dinh participantCount neu cau co "chia N".
- amount la tong so tien, KHONG tu dong chia nho amount.
- item la mon/do vat duoc mua.
- note giu lai thong tin bo sung quan trong.

Thong tin bo sung:
- Sender username: ${JSON.stringify(senderUsername)}
- Sender display name: ${JSON.stringify(senderName)}
- Room members hien tai: ${JSON.stringify(roomMembers)}
- Parser rule-based co san: ${JSON.stringify(parsedExpense)}

Quy tac:
- Neu cau la "50k cafe" => action=add, amount=50000, item="cafe", splitMode="none".
- Neu cau la "Huy mua thit cho ca phong 120k" va Huy nam trong room members => payerName="Huy", splitMode="all_room".
- Neu cau la "chia 3" thi participantCount=3.
- Neu user muon xoa/sua theo dong thi uu tien rowNumber.
- Neu split theo phong nhung khong du ro rang, van co the tra splitMode="all_room" neu co cum "ca phong" hoac "moi nguoi".
- Neu khong du thong tin de sua/xoa thi action="noop" va dien reason.
- Neu payerName hop voi mot room member, hay tra ve dung ten trong room members.
- Khong duoc tra ve markdown hay giai thich ngoai JSON.

Schema JSON bat buoc:
{
  "action": "add" | "update" | "delete" | "noop",
  "rowNumber": number | null,
  "amount": number | null,
  "item": string | null,
  "payerName": string | null,
  "splitMode": "none" | "all_room",
  "participantCount": number | null,
  "note": string | null,
  "reason": string | null
}

Tin nhan goc:
${JSON.stringify(message)}
`.trim();
}

function toNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toNullablePositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null;
  }

  return value;
}

function toSplitMode(value: unknown): ExpenseSplitMode {
  return value === "all_room" ? "all_room" : "none";
}

export function normalizeExpenseSheetIntent(value: unknown): ExpenseSheetIntent {
  if (typeof value !== "object" || value === null) {
    return {
      action: "noop",
      rowNumber: null,
      amount: null,
      item: null,
      payerName: null,
      splitMode: "none",
      participantCount: null,
      note: null,
      reason: "Gemini khong tra ve object hop le.",
    };
  }

  const candidate = value as Record<string, unknown>;
  const rawAction = candidate.action;
  const action =
    rawAction === "add" ||
    rawAction === "update" ||
    rawAction === "delete" ||
    rawAction === "noop"
      ? rawAction
      : "noop";

  return {
    action,
    rowNumber: toNullablePositiveInteger(candidate.rowNumber),
    amount: toNullablePositiveInteger(candidate.amount),
    item: toNullableString(candidate.item),
    payerName: toNullableString(candidate.payerName),
    splitMode: toSplitMode(candidate.splitMode),
    participantCount: toNullablePositiveInteger(candidate.participantCount),
    note: toNullableString(candidate.note),
    reason: toNullableString(candidate.reason),
  };
}

function buildFallbackIntent(parsedExpense: ExpenseMessage | null): ExpenseSheetIntent {
  if (!parsedExpense) {
    return {
      action: "noop",
      rowNumber: null,
      amount: null,
      item: null,
      payerName: null,
      splitMode: "none",
      participantCount: null,
      note: null,
      reason: "Khong nhan dien duoc lenh phu hop.",
    };
  }

  return {
    action: "add",
    rowNumber: null,
    amount: parsedExpense.amount,
    item: parsedExpense.item,
    payerName: null,
    splitMode: "none",
    participantCount: null,
    note: null,
    reason: null,
  };
}

export async function inferExpenseSheetIntent(
  input: InferExpenseSheetIntentInput
): Promise<ExpenseSheetIntent> {
  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: buildPrompt(input),
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = result.text?.trim();

    if (!text) {
      return buildFallbackIntent(input.parsedExpense);
    }

    return normalizeExpenseSheetIntent(JSON.parse(text));
  } catch (error) {
    console.error("Failed to infer expense sheet intent with Gemini:", error);
    return buildFallbackIntent(input.parsedExpense);
  }
}
