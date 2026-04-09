import { describe, expect, it } from "vitest";

import { getDiscordExpenseReplyContent } from "../lib/getDiscordExpenseReplyContent";

describe("getDiscordExpenseReplyContent", () => {
  it("returns a JSON reply for valid guild user messages", () => {
    expect(
      getDiscordExpenseReplyContent({
        content: "100k cafe",
        inGuild: true,
        isBot: false,
        isSystem: false,
      })
    ).toBe("```json\n{\n  \"amount\": 100000,\n  \"item\": \"cafe\"\n}\n```");
  });

  it("returns null for bot, system, empty, invalid, or non-guild messages", () => {
    expect(
      getDiscordExpenseReplyContent({
        content: "100k cafe",
        inGuild: true,
        isBot: true,
        isSystem: false,
      })
    ).toBeNull();

    expect(
      getDiscordExpenseReplyContent({
        content: "100k cafe",
        inGuild: true,
        isBot: false,
        isSystem: true,
      })
    ).toBeNull();

    expect(
      getDiscordExpenseReplyContent({
        content: "   ",
        inGuild: true,
        isBot: false,
        isSystem: false,
      })
    ).toBeNull();

    expect(
      getDiscordExpenseReplyContent({
        content: "hello bot",
        inGuild: true,
        isBot: false,
        isSystem: false,
      })
    ).toBeNull();

    expect(
      getDiscordExpenseReplyContent({
        content: "100k cafe",
        inGuild: false,
        isBot: false,
        isSystem: false,
      })
    ).toBeNull();
  });
});
