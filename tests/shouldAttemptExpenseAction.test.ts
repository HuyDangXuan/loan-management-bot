import { describe, expect, it } from "vitest";

import { shouldAttemptExpenseAction } from "../lib/getDiscordExpenseSheetReplyContent";

describe("shouldAttemptExpenseAction", () => {
  it("matches the old short expense format", () => {
    expect(shouldAttemptExpenseAction("100k cafe")).toBe(true);
  });

  it("matches natural-language expense messages", () => {
    expect(shouldAttemptExpenseAction("huy mua 100k thit chia 3 nguoi")).toBe(
      true
    );
  });

  it("matches debt and repay commands", () => {
    expect(shouldAttemptExpenseAction("huy no vu 100k")).toBe(true);
    expect(shouldAttemptExpenseAction("huy tra cho vu 100k")).toBe(true);
  });

  it("still matches row-based update commands", () => {
    expect(shouldAttemptExpenseAction("sua dong 4 thanh 120k com")).toBe(true);
  });

  it("ignores unrelated chat", () => {
    expect(shouldAttemptExpenseAction("hom nay troi dep qua")).toBe(false);
  });
});
