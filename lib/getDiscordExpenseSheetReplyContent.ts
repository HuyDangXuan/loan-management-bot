import {
  computeAllRoomSettlement,
  createEmptyBalances,
} from "./expenseSettlement";
import {
  appendLedgerRow,
  deleteLedgerRow,
  getRoomConfig,
  updateLedgerRow,
} from "./googleSheetsExpenseStore";
import {
  inferExpenseSheetIntent,
  type ExpenseSheetIntent,
} from "./expenseSheetIntent";
import { parseExpenseMessage } from "./parseExpenseMessage";
import { resolveRoomMemberName } from "./roomConfig";

export type DiscordExpenseSheetMessageInput = {
  content: string;
  inGuild: boolean;
  isBot: boolean;
  isSystem: boolean;
  discordUserId: string;
  discordUsername: string;
  discordDisplayName: string | null;
};

export function shouldAttemptExpenseAction(content: string) {
  const normalized = content.toLowerCase();
  const hasMoneyAmount =
    /\b\d+\s*(k|nghin|ngan|tr|trieu|cu|d|vnd|dong)?\b/i.test(normalized);
  const hasExpenseCue =
    /\b(mua|chi|tra|thanh toan|bill|tien|an|uong|cafe|com|pho|bun|thit|rau|ship|chia|share|split)\b/i.test(
      normalized
    );
  const hasRowAction =
    /\b(add|them|sua|xoa|delete|update|row|dong|hang)\b/i.test(normalized);

  return (
    parseExpenseMessage(content) !== null ||
    hasRowAction ||
    (hasMoneyAmount && hasExpenseCue)
  );
}

function extractParticipantCountFromContent(content: string) {
  const normalized = content.toLowerCase();
  const slashMatch = normalized.match(/\/\s*(\d+)\b/);

  if (slashMatch) {
    const slashCount = Number.parseInt(slashMatch[1], 10);

    if (Number.isInteger(slashCount) && slashCount > 0) {
      return slashCount;
    }
  }

  const textMatch = normalized.match(/\bchia\s+(\d+)\b/);

  if (!textMatch) {
    return null;
  }

  const textCount = Number.parseInt(textMatch[1], 10);
  return Number.isInteger(textCount) && textCount > 0 ? textCount : null;
}

function hasRoomWideSplitCue(content: string) {
  return (
    /\b(cho ca phong|ca phong|moi nguoi|chia deu|chia\s+\d+)\b/i.test(
      content.toLowerCase()
    ) || extractParticipantCountFromContent(content) !== null
  );
}

function formatIntentJson(intent: ExpenseSheetIntent) {
  return `\`\`\`json\n${JSON.stringify(intent, null, 2)}\n\`\`\``;
}

function formatBalances(balances: Record<string, number | null>) {
  const parts = Object.entries(balances)
    .filter(([, amount]) => amount != null)
    .map(([member, amount]) => `${member}: ${amount}`);

  return parts.length ? parts.join(", ") : null;
}

function resolvePreferredPayerName(
  members: string[],
  intentPayerName: string | null,
  displayName: string | null,
  username: string
) {
  if (members.length) {
    return (
      resolveRoomMemberName(members, intentPayerName) ??
      resolveRoomMemberName(members, displayName) ??
      resolveRoomMemberName(members, username)
    );
  }

  return intentPayerName ?? displayName ?? username;
}

function buildSetupGuidance() {
  return (
    "Can cau hinh phong truoc khi chia tien. Dung /start so_nguoi:<n> thanh_vien:\"Huy, Lan, Minh\"."
  );
}

export async function getDiscordExpenseSheetReplyContent(
  input: DiscordExpenseSheetMessageInput
): Promise<string | null> {
  if (!input.inGuild || input.isBot || input.isSystem) {
    return null;
  }

  const content = input.content.trim();

  if (!content || !shouldAttemptExpenseAction(content)) {
    return null;
  }

  const roomConfig = await getRoomConfig();
  const roomMembers = roomConfig?.members ?? [];
  const parsedExpense = parseExpenseMessage(content);
  const intent = await inferExpenseSheetIntent({
    message: content,
    parsedExpense,
    roomMembers,
    senderName: input.discordDisplayName,
    senderUsername: input.discordUsername,
  });
  const inferredParticipantCount =
    intent.participantCount ?? extractParticipantCountFromContent(content);
  const effectiveIntent: ExpenseSheetIntent = {
    ...intent,
    participantCount: inferredParticipantCount,
  };
  const localSplitCue = hasRoomWideSplitCue(content);

  if (effectiveIntent.action === "noop") {
    if (localSplitCue && !roomMembers.length) {
      return buildSetupGuidance();
    }

    return effectiveIntent.reason
      ? `Khong xu ly duoc lenh nay.\n${formatIntentJson(effectiveIntent)}`
      : null;
  }

  if (effectiveIntent.action === "delete") {
    if (!effectiveIntent.rowNumber) {
      return `Can chi ro dong can xoa.\n${formatIntentJson(effectiveIntent)}`;
    }

    const result = await deleteLedgerRow(effectiveIntent.rowNumber);
    return `Da xoa dong ${result.rowNumber} trong sheet "${result.sheetName}".\n${formatIntentJson(
      effectiveIntent
    )}`;
  }

  if (!effectiveIntent.amount || !effectiveIntent.item) {
    return `Thieu du lieu amount/item de ghi vao sheet.\n${formatIntentJson(
      effectiveIntent
    )}`;
  }

  const wantsRoomSplit = effectiveIntent.splitMode === "all_room" || localSplitCue;

  if (wantsRoomSplit && !roomMembers.length) {
    return buildSetupGuidance();
  }

  if (
    wantsRoomSplit &&
    effectiveIntent.participantCount &&
    effectiveIntent.participantCount !== roomMembers.length
  ) {
    return `Cau lenh chia tien chua ro rang voi phong hien tai.\n${formatIntentJson(
      effectiveIntent
    )}`;
  }

  const paidBy = resolvePreferredPayerName(
    roomMembers,
    effectiveIntent.payerName,
    input.discordDisplayName,
    input.discordUsername
  );

  if (wantsRoomSplit && !paidBy) {
    return `Khong xac dinh duoc ai la nguoi tra tien.\n${formatIntentJson(
      effectiveIntent
    )}`;
  }

  const settlement = wantsRoomSplit
    ? computeAllRoomSettlement(
        roomMembers,
        paidBy as string,
        effectiveIntent.amount
      )
    : {
        splitMode: "none" as const,
        balances: createEmptyBalances(roomMembers),
      };

  const rowInput = {
    action: (effectiveIntent.action === "update" ? "update" : "add") as
      | "add"
      | "update",
    paidBy,
    item: effectiveIntent.item,
    totalPaid: effectiveIntent.amount,
    splitMode: settlement.splitMode,
    note: effectiveIntent.note,
    sourceMessage: content,
    balances: settlement.balances,
  };

  if (effectiveIntent.action === "add") {
    const result = await appendLedgerRow(rowInput, roomMembers);
    const balanceSummary = formatBalances(settlement.balances);
    return `Da them dong ${result.rowNumber} vao sheet "${result.sheetName}".${
      balanceSummary ? `\nSettlement: ${balanceSummary}` : ""
    }\n${formatIntentJson(effectiveIntent)}`;
  }

  if (!effectiveIntent.rowNumber) {
    return `Can chi ro dong can sua.\n${formatIntentJson(effectiveIntent)}`;
  }

  const result = await updateLedgerRow(
    effectiveIntent.rowNumber,
    rowInput,
    roomMembers
  );
  const balanceSummary = formatBalances(settlement.balances);
  return `Da cap nhat dong ${result.rowNumber} trong sheet "${result.sheetName}".${
    balanceSummary ? `\nSettlement: ${balanceSummary}` : ""
  }\n${formatIntentJson(effectiveIntent)}`;
}
