import { buildExpenseReplyContent } from "./buildExpenseReplyContent";

export type DiscordExpenseMessageInput = {
  content: string;
  inGuild: boolean;
  isBot: boolean;
  isSystem: boolean;
};

export function getDiscordExpenseReplyContent(
  input: DiscordExpenseMessageInput
): string | null {
  if (!input.inGuild || input.isBot || input.isSystem) {
    return null;
  }

  const content = input.content.trim();

  if (!content) {
    return null;
  }

  return buildExpenseReplyContent(content);
}
