export type DebtTransferEntryType = "debt" | "repay";
export type LedgerEntryType = "expense" | DebtTransferEntryType;

export type DebtTransferMatch = {
  kind: "matched";
  entryType: DebtTransferEntryType;
  fromMember: string;
  toMember: string;
  amount: number;
  note: string;
};

export type DebtTransferInvalid = {
  kind: "invalid";
  entryType: DebtTransferEntryType;
  reason: string;
};

export type DebtTransferParseResult = DebtTransferMatch | DebtTransferInvalid;

const INVALID_MEMBER_REASON =
  "Lenh cong no/tra no phai ghi ro 2 thanh vien trong room.";
const ROW_ACTION_PATTERN = /\b(sua|xoa|delete|update|row|dong|hang)\b/u;
const DEBT_CUE_PATTERNS = [/\bcon no\b/u, /\bmac no\b/u, /\bno\b/u, /\bthieu\b/u];
const REPAY_CUE_PATTERNS = [
  /\bhoan tien cho\b/u,
  /\bhoan tien\b/u,
  /\btra cho\b/u,
  /\bchuyen cho\b/u,
  /\bhoan\b/u,
  /\bchuyen\b/u,
  /\btra\b/u,
];
const AMOUNT_PATTERN =
  /(\d+)\s*(trieu|nghin|ngan|dong|vnd|tr|k|cu|d)?\b/giu;

function normalizeText(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findCueMatch(
  normalizedMessage: string,
  entryType: DebtTransferEntryType,
  patterns: RegExp[]
) {
  let earliestIndex: number | null = null;

  for (const pattern of patterns) {
    const match = pattern.exec(normalizedMessage);

    if (match && typeof match.index === "number") {
      if (earliestIndex == null || match.index < earliestIndex) {
        earliestIndex = match.index;
      }
    }
  }

  if (earliestIndex == null) {
    return null;
  }

  return {
    entryType,
    index: earliestIndex,
  };
}

function findDebtTransferCue(normalizedMessage: string) {
  const matches = [
    findCueMatch(normalizedMessage, "debt", DEBT_CUE_PATTERNS),
    findCueMatch(normalizedMessage, "repay", REPAY_CUE_PATTERNS),
  ].filter(Boolean) as Array<{ entryType: DebtTransferEntryType; index: number }>;

  if (!matches.length) {
    return null;
  }

  return matches.sort((left, right) => left.index - right.index)[0];
}

function toAmountMultiplier(unit: string | undefined) {
  switch (unit) {
    case "k":
    case "nghin":
    case "ngan":
    case "cu":
      return 1000;
    case "tr":
    case "trieu":
      return 1_000_000;
    default:
      return 1;
  }
}

function extractAmount(normalizedMessage: string, startIndex: number) {
  const searchArea = normalizedMessage.slice(startIndex);
  const matches = Array.from(searchArea.matchAll(AMOUNT_PATTERN));
  const candidate = matches.find((match) => match[2]) ?? matches[0];

  if (!candidate) {
    return null;
  }

  const amount = Number.parseInt(candidate[1], 10);

  if (!Number.isInteger(amount) || amount <= 0) {
    return null;
  }

  return amount * toAmountMultiplier(candidate[2]);
}

function findMentionedMembers(normalizedMessage: string, roomMembers: string[]) {
  return roomMembers
    .map((member) => {
      const normalizedMember = normalizeText(member);
      const regex = new RegExp(
        `(^|[^\\p{L}\\p{N}])(${escapeRegex(normalizedMember)})(?=$|[^\\p{L}\\p{N}])`,
        "u"
      );
      const match = regex.exec(normalizedMessage);

      if (!match || typeof match.index !== "number") {
        return null;
      }

      return {
        member,
        index: match.index + match[1].length,
      };
    })
    .filter((value): value is { member: string; index: number } => value !== null)
    .sort((left, right) => left.index - right.index);
}

export function hasDebtTransferCue(message: string) {
  const normalizedMessage = normalizeText(message);

  if (!normalizedMessage || ROW_ACTION_PATTERN.test(normalizedMessage)) {
    return false;
  }

  return findDebtTransferCue(normalizedMessage) !== null;
}

export function parseDebtTransferMessage(
  message: string,
  roomMembers: string[]
): DebtTransferParseResult | null {
  const normalizedMessage = normalizeText(message);

  if (!normalizedMessage || ROW_ACTION_PATTERN.test(normalizedMessage)) {
    return null;
  }

  const cue = findDebtTransferCue(normalizedMessage);

  if (!cue) {
    return null;
  }

  const amount = extractAmount(normalizedMessage, cue.index);

  if (!amount) {
    return {
      kind: "invalid",
      entryType: cue.entryType,
      reason: "Lenh cong no/tra no can co so tien hop le.",
    };
  }

  const mentionedMembers = findMentionedMembers(normalizedMessage, roomMembers);

  if (mentionedMembers.length !== 2) {
    return {
      kind: "invalid",
      entryType: cue.entryType,
      reason: INVALID_MEMBER_REASON,
    };
  }

  const [fromMember, toMember] = mentionedMembers.map((value) => value.member);

  if (fromMember === toMember) {
    return {
      kind: "invalid",
      entryType: cue.entryType,
      reason: INVALID_MEMBER_REASON,
    };
  }

  return {
    kind: "matched",
    entryType: cue.entryType,
    fromMember,
    toMember,
    amount,
    note: `${fromMember} -> ${toMember}`,
  };
}
