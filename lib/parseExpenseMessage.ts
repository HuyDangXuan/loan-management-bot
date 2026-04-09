export type ExpenseMessage = {
  amount: number;
  item: string;
};

const EXPENSE_MESSAGE_PATTERN = /^(\d+)\s*([kK])?\s+(.+)$/;

export function parseExpenseMessage(input: string): ExpenseMessage | null {
  const trimmedInput = input.trim();
  const match = EXPENSE_MESSAGE_PATTERN.exec(trimmedInput);

  if (!match) {
    return null;
  }

  const [, rawAmount, suffix, rawItem] = match;
  const baseAmount = Number.parseInt(rawAmount, 10);

  if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
    return null;
  }

  const amount = suffix ? baseAmount * 1000 : baseAmount;
  const item = rawItem.trim().replace(/\s+/g, " ");

  if (!item) {
    return null;
  }

  return {
    amount,
    item,
  };
}
