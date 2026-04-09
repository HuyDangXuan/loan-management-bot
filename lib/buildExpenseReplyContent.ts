import { parseExpenseMessage } from "./parseExpenseMessage";

export function buildExpenseReplyContent(message: string): string | null {
  const parsed = parseExpenseMessage(message);

  if (!parsed) {
    return null;
  }

  return `\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\``;
}
