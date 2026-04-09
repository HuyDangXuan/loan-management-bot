export const CONFIG_SHEET_NAME = "Config";

export type RoomConfig = {
  members: string[];
};

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeKey(value: string) {
  return normalizeWhitespace(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function normalizeRoomMemberName(value: string) {
  return normalizeWhitespace(value);
}

export function parseRoomConfigInput(
  expectedCount: number,
  rawMembers: string
): RoomConfig {
  if (!Number.isInteger(expectedCount) || expectedCount <= 0) {
    throw new Error("so_nguoi phai la so nguyen duong.");
  }

  const members = rawMembers
    .split(",")
    .map(normalizeRoomMemberName)
    .filter(Boolean);

  if (members.length !== expectedCount) {
    throw new Error(
      `so_nguoi = ${expectedCount} nhung danh sach thanh vien co ${members.length} ten.`
    );
  }

  const seen = new Set<string>();

  for (const member of members) {
    const key = normalizeKey(member);

    if (seen.has(key)) {
      throw new Error(`Ten thanh vien bi trung: "${member}".`);
    }

    seen.add(key);
  }

  return { members };
}

export function resolveRoomMemberName(
  members: string[],
  candidate: string | null | undefined
) {
  if (!candidate) {
    return null;
  }

  const key = normalizeKey(candidate);
  return members.find((member) => normalizeKey(member) === key) ?? null;
}

export function formatRoomConfigSummary(config: RoomConfig) {
  return `${config.members.length} nguoi: ${config.members.join(", ")}`;
}
