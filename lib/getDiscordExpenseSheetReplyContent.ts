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

function hasRoomWideSplitCue(content: string) {
  return /\b(cho ca phong|ca phong|moi nguoi|chia deu|chia\s+\d+)\b/i.test(
    content.toLowerCase()
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
  const localSplitCue = hasRoomWideSplitCue(content);

  if (intent.action === "noop") {
    if (localSplitCue && !roomMembers.length) {
      return buildSetupGuidance();
    }

    return intent.reason
      ? `Khong xu ly duoc lenh nay.\n${formatIntentJson(intent)}`
      : null;
  }

  if (intent.action === "delete") {
    if (!intent.rowNumber) {
      return `Can chi ro dong can xoa.\n${formatIntentJson(intent)}`;
    }

    const result = await deleteLedgerRow(intent.rowNumber);
    return `Da xoa dong ${result.rowNumber} trong sheet "${result.sheetName}".\n${formatIntentJson(
      intent
    )}`;
  }

  if (!intent.amount || !intent.item) {
    return `Thieu du lieu amount/item de ghi vao sheet.\n${formatIntentJson(
      intent
    )}`;
  }

  const wantsRoomSplit = intent.splitMode === "all_room" || localSplitCue;

  if (wantsRoomSplit && !roomMembers.length) {
    return buildSetupGuidance();
  }

  if (
    wantsRoomSplit &&
    intent.participantCount &&
    intent.participantCount !== roomMembers.length
  ) {
    return `Cau lenh chia tien chua ro rang voi phong hien tai.\n${formatIntentJson(
      intent
    )}`;
  }

  const paidBy = resolvePreferredPayerName(
    roomMembers,
    intent.payerName,
    input.discordDisplayName,
    input.discordUsername
  );

  if (wantsRoomSplit && !paidBy) {
    return `Khong xac dinh duoc ai la nguoi tra tien.\n${formatIntentJson(
      intent
    )}`;
  }

  const settlement = wantsRoomSplit
    ? computeAllRoomSettlement(roomMembers, paidBy as string, intent.amount)
    : {
        splitMode: "none" as const,
        balances: createEmptyBalances(roomMembers),
      };

  const rowInput = {
    action: (intent.action === "update" ? "update" : "add") as "add" | "update",
    paidBy,
    item: intent.item,
    totalPaid: intent.amount,
    splitMode: settlement.splitMode,
    note: intent.note,
    sourceMessage: content,
    balances: settlement.balances,
  };

  if (intent.action === "add") {
    const result = await appendLedgerRow(rowInput, roomMembers);
    const balanceSummary = formatBalances(settlement.balances);
    return `Da them dong ${result.rowNumber} vao sheet "${result.sheetName}".${
      balanceSummary ? `\nSettlement: ${balanceSummary}` : ""
    }\n${formatIntentJson(intent)}`;
  }

  if (!intent.rowNumber) {
    return `Can chi ro dong can sua.\n${formatIntentJson(intent)}`;
  }

  const result = await updateLedgerRow(intent.rowNumber, rowInput, roomMembers);
  const balanceSummary = formatBalances(settlement.balances);
  return `Da cap nhat dong ${result.rowNumber} trong sheet "${result.sheetName}".${
    balanceSummary ? `\nSettlement: ${balanceSummary}` : ""
  }\n${formatIntentJson(intent)}`;
}
