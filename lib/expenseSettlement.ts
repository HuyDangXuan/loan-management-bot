import type { DebtTransferEntryType } from "./parseDebtTransferMessage";

export type ExpenseSplitMode = "none" | "all_room";

export type ExpenseSettlement = {
  splitMode: ExpenseSplitMode;
  balances: Record<string, number | null>;
};

export function createEmptyBalances(members: string[]) {
  return Object.fromEntries(members.map((member) => [member, null])) as Record<
    string,
    number | null
  >;
}

export function computeAllRoomSettlement(
  members: string[],
  payerName: string,
  totalPaid: number
): ExpenseSettlement {
  if (!members.length) {
    throw new Error("Khong co thanh vien nao trong phong.");
  }

  if (!Number.isInteger(totalPaid) || totalPaid <= 0) {
    throw new Error("Tong tien phai la so nguyen duong.");
  }

  if (!members.includes(payerName)) {
    throw new Error(`Nguoi tra tien "${payerName}" khong co trong phong.`);
  }

  const baseShare = Math.floor(totalPaid / members.length);
  const remainder = totalPaid - baseShare * members.length;
  const balances = createEmptyBalances(members);

  for (const member of members) {
    balances[member] = -baseShare;
  }

  balances[payerName] = totalPaid - (baseShare + remainder);

  return {
    splitMode: "all_room",
    balances,
  };
}

export function computeDebtTransferSettlement(
  members: string[],
  fromMember: string,
  toMember: string,
  totalPaid: number,
  entryType: DebtTransferEntryType
): ExpenseSettlement {
  if (!Number.isInteger(totalPaid) || totalPaid <= 0) {
    throw new Error("Tong tien phai la so nguyen duong.");
  }

  if (!members.includes(fromMember)) {
    throw new Error(`Nguoi gui tien "${fromMember}" khong co trong phong.`);
  }

  if (!members.includes(toMember)) {
    throw new Error(`Nguoi nhan tien "${toMember}" khong co trong phong.`);
  }

  const balances = createEmptyBalances(members);

  if (entryType === "debt") {
    balances[fromMember] = totalPaid;
    balances[toMember] = -totalPaid;
  } else {
    balances[fromMember] = -totalPaid;
    balances[toMember] = totalPaid;
  }

  return {
    splitMode: "none",
    balances,
  };
}
