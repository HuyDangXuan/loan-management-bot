import { describe, expect, it } from "vitest";

import { buildExpenseReplyContent } from "../lib/buildExpenseReplyContent";

describe("buildExpenseReplyContent", () => {
  it("formats parsed expenses as a JSON code block", () => {
    expect(buildExpenseReplyContent("100k cafe")).toBe(
      "```json\n{\n  \"amount\": 100000,\n  \"item\": \"cafe\"\n}\n```"
    );
  });

  it("returns null when the message cannot be parsed", () => {
    expect(buildExpenseReplyContent("hello bot")).toBeNull();
  });
});
