import { describe, expect, it } from "vitest";

import { parseExpenseMessage } from "../lib/parseExpenseMessage";

describe("parseExpenseMessage", () => {
  it("parses amount with k suffix", () => {
    expect(parseExpenseMessage("100k cafe")).toEqual({
      amount: 100000,
      item: "cafe",
    });
  });

  it("parses amount without suffix", () => {
    expect(parseExpenseMessage("250 cafe sua")).toEqual({
      amount: 250,
      item: "cafe sua",
    });
  });

  it("parses amount with spaced uppercase K suffix", () => {
    expect(parseExpenseMessage("100 K cafe")).toEqual({
      amount: 100000,
      item: "cafe",
    });
  });

  it("ignores extra surrounding whitespace", () => {
    expect(parseExpenseMessage("   100k   cafe   ")).toEqual({
      amount: 100000,
      item: "cafe",
    });
  });

  it("returns null for invalid messages", () => {
    expect(parseExpenseMessage("cafe")).toBeNull();
    expect(parseExpenseMessage("100k")).toBeNull();
    expect(parseExpenseMessage("abc")).toBeNull();
    expect(parseExpenseMessage("-100 cafe")).toBeNull();
    expect(parseExpenseMessage("10.5 cafe")).toBeNull();
  });
});
