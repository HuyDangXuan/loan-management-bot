import {
  computeAllRoomSettlement,
  computeDebtTransferSettlement,
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
import { type DebtTransferEntryType, hasDebtTransferCue, parseDebtTransferMessage } from "./parseDebtTransferMessage";
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

function formatCurrency(amount: number) {
  return `${new Intl.NumberFormat("vi-VN").format(amount)}d`;
}

function formatSignedCurrency(amount: number) {
  const sign = amount >= 0 ? "+" : "-";
  return `${sign}${formatCurrency(Math.abs(amount))}`;
}

function formatBalanceSummary(balances: Record<string, number | null>) {
  const parts = Object.entries(balances)
    .filter(([, amount]) => amount != null)
    .map(([member, amount]) => `${member} ${formatSignedCurrency(amount as number)}`);

  return parts.length ? `Can doi: ${parts.join(", ")}.` : null;
}

function appendBalanceSummary(message: string, balances: Record<string, number | null>) {
  const summary = formatBalanceSummary(balances);
  return summary ? `${message}\n${summary}` : message;
}

function normalizeReason(reason: string) {
  return /[.!?]$/.test(reason) ? reason : `${reason}.`;
}

function formatDebtValidationMessage(reason: string) {
  const prefix = "Lenh cong no/tra no ";
  const detail = reason.startsWith(prefix)
    ? `${reason.slice(prefix.length, prefix.length + 1).toLowerCase()}${reason.slice(
        prefix.length + 1
      )}`
    : `${reason.slice(0, 1).toLowerCase()}${reason.slice(1)}`;

  return `Khong xu ly duoc lenh cong no/tra no: ${normalizeReason(detail)}`;
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
  return 'Can cau hinh phong truoc khi chia tien. Dung /start so_nguoi:<n> thanh_vien:"Huy, Lan, Minh".';
}

function buildExpenseSuccessMessage(
  item: string,
  amount: number,
  wantsRoomSplit: boolean,
  balances: Record<string, number | null>,
  action: "add" | "update",
  rowNumber?: number
) {
  const base =
    action === "add"
      ? wantsRoomSplit
        ? `Da ghi chi tieu "${item}" ${formatCurrency(amount)} cho ca phong.`
        : `Da ghi chi tieu "${item}" ${formatCurrency(amount)}.`
      : wantsRoomSplit
        ? `Da cap nhat dong ${rowNumber} voi chi tieu "${item}" ${formatCurrency(amount)} cho ca phong.`
        : `Da cap nhat dong ${rowNumber} voi chi tieu "${item}" ${formatCurrency(amount)}.`;

  return appendBalanceSummary(base, balances);
}

function buildDebtSuccessMessage(
  entryType: DebtTransferEntryType,
  fromMember: string,
  toMember: string,
  amount: number,
  balances: Record<string, number | null>,
  action: "add" | "update",
  rowNumber?: number
) {
  const actionText = entryType === "debt" ? "no" : "tra";
  const lead =
    action === "add"
      ? entryType === "debt"
        ? `Da ghi cong no: ${fromMember} ${actionText} ${toMember} ${formatCurrency(amount)}.`
        : `Da ghi tra no: ${fromMember} ${actionText} ${toMember} ${formatCurrency(amount)}.`
      : `Da cap nhat dong ${rowNumber}: ${fromMember} ${actionText} ${toMember} ${formatCurrency(amount)}.`;

  return appendBalanceSummary(lead, balances);
}

export function shouldAttemptExpenseAction(content: string) {
  const normalized = content.toLowerCase();
  const hasMoneyAmount =
    /\b\d+\s*(k|nghin|ngan|tr|trieu|cu|d|vnd|dong)?\b/i.test(normalized);
  const hasExpenseCue =
    /\b(mua|chi|tra|thanh toan|bill|tien|an|uong|cafe|com|pho|bun|thit|rau|ship|chia|share|split|no|thieu|chuyen|hoan)\b/i.test(
      normalized
    );
  const hasRowAction =
    /\b(add|them|sua|xoa|delete|update|row|dong|hang)\b/i.test(normalized);

  return (
    parseExpenseMessage(content) !== null ||
    hasRowAction ||
    hasDebtTransferCue(content) ||
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

  if (hasDebtTransferCue(content) && !roomMembers.length) {
    return buildSetupGuidance();
  }

  const parsedDebtTransfer = parseDebtTransferMessage(content, roomMembers);

  if (parsedDebtTransfer?.kind === "invalid") {
    return formatDebtValidationMessage(parsedDebtTransfer.reason);
  }

  const matchedDebtTransfer =
    parsedDebtTransfer?.kind === "matched" ? parsedDebtTransfer : null;
  const parsedExpense = parseExpenseMessage(content);
  const intent = await inferExpenseSheetIntent({
    message: content,
    parsedExpense,
    parsedDebtTransfer: matchedDebtTransfer,
    roomMembers,
    senderName: input.discordDisplayName,
    senderUsername: input.discordUsername,
  });
  const inferredParticipantCount =
    intent.participantCount ?? extractParticipantCountFromContent(content);
  const effectiveIntent: ExpenseSheetIntent = {
    ...intent,
    action:
      matchedDebtTransfer && intent.action !== "update" && intent.action !== "delete"
        ? "add"
        : intent.action,
    entryType: matchedDebtTransfer?.entryType ?? intent.entryType,
    amount: matchedDebtTransfer?.amount ?? intent.amount,
    item: matchedDebtTransfer ? matchedDebtTransfer.entryType : intent.item,
    payerName: matchedDebtTransfer?.toMember ?? intent.payerName,
    fromMember: matchedDebtTransfer?.fromMember ?? intent.fromMember,
    toMember: matchedDebtTransfer?.toMember ?? intent.toMember,
    splitMode: matchedDebtTransfer ? "none" : intent.splitMode,
    participantCount: inferredParticipantCount,
    note: matchedDebtTransfer?.note ?? intent.note,
  };
  const localSplitCue = hasRoomWideSplitCue(content);

  if (effectiveIntent.action === "noop") {
    if (localSplitCue && !roomMembers.length) {
      return buildSetupGuidance();
    }

    return effectiveIntent.reason
      ? `Khong xu ly duoc lenh nay: ${normalizeReason(effectiveIntent.reason)}`
      : "Khong xu ly duoc lenh nay.";
  }

  if (effectiveIntent.action === "delete") {
    if (!effectiveIntent.rowNumber) {
      return "Can chi ro dong can xoa.";
    }

    const result = await deleteLedgerRow(effectiveIntent.rowNumber);
    return `Da xoa dong ${result.rowNumber} trong sheet "${result.sheetName}".`;
  }

  if (
    effectiveIntent.entryType === "debt" ||
    effectiveIntent.entryType === "repay"
  ) {
    const fromMember = resolveRoomMemberName(
      roomMembers,
      effectiveIntent.fromMember
    );
    const toMember = resolveRoomMemberName(roomMembers, effectiveIntent.toMember);

    if (!effectiveIntent.amount || !fromMember || !toMember || fromMember === toMember) {
      return formatDebtValidationMessage(
        "Lenh cong no/tra no phai ghi ro 2 thanh vien trong room."
      );
    }

    const settlement = computeDebtTransferSettlement(
      roomMembers,
      fromMember,
      toMember,
      effectiveIntent.amount,
      effectiveIntent.entryType
    );
    const rowInput = {
      action: (effectiveIntent.action === "update" ? "update" : "add") as
        | "add"
        | "update",
      paidBy: toMember,
      item: effectiveIntent.entryType,
      totalPaid: effectiveIntent.amount,
      splitMode: settlement.splitMode,
      note: effectiveIntent.note ?? `${fromMember} -> ${toMember}`,
      sourceMessage: content,
      balances: settlement.balances,
    };

    if (effectiveIntent.action === "add") {
      await appendLedgerRow(rowInput, roomMembers);
      return buildDebtSuccessMessage(
        effectiveIntent.entryType,
        fromMember,
        toMember,
        effectiveIntent.amount,
        settlement.balances,
        "add"
      );
    }

    if (!effectiveIntent.rowNumber) {
      return "Can chi ro dong can sua.";
    }

    await updateLedgerRow(effectiveIntent.rowNumber, rowInput, roomMembers);
    return buildDebtSuccessMessage(
      effectiveIntent.entryType,
      fromMember,
      toMember,
      effectiveIntent.amount,
      settlement.balances,
      "update",
      effectiveIntent.rowNumber
    );
  }

  if (!effectiveIntent.amount || !effectiveIntent.item) {
    return "Chua du du lieu so tien hoac noi dung chi tieu.";
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
    return "Cau lenh chia tien chua ro rang voi phong hien tai.";
  }

  const paidBy = resolvePreferredPayerName(
    roomMembers,
    effectiveIntent.payerName,
    input.discordDisplayName,
    input.discordUsername
  );

  if (wantsRoomSplit && !paidBy) {
    return "Khong xac dinh duoc ai la nguoi tra tien.";
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
    await appendLedgerRow(rowInput, roomMembers);
    return buildExpenseSuccessMessage(
      effectiveIntent.item,
      effectiveIntent.amount,
      wantsRoomSplit,
      settlement.balances,
      "add"
    );
  }

  if (!effectiveIntent.rowNumber) {
    return "Can chi ro dong can sua.";
  }

  await updateLedgerRow(effectiveIntent.rowNumber, rowInput, roomMembers);
  return buildExpenseSuccessMessage(
    effectiveIntent.item,
    effectiveIntent.amount,
    wantsRoomSplit,
    settlement.balances,
    "update",
    effectiveIntent.rowNumber
  );
}
