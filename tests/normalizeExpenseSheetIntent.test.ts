import { describe, expect, it } from "vitest";

import { normalizeExpenseSheetIntent } from "../lib/expenseSheetIntent";

describe("normalizeExpenseSheetIntent", () => {
  it("keeps a valid add intent", () => {
    expect(
      normalizeExpenseSheetIntent({
        action: "add",
        rowNumber: null,
        amount: 120000,
        item: "cafe",
        payerName: "Huy",
        splitMode: "all_room",
        participantCount: 3,
        note: null,
        reason: null,
      })
    ).toEqual({
      action: "add",
      rowNumber: null,
      amount: 120000,
      item: "cafe",
      payerName: "Huy",
      splitMode: "all_room",
      participantCount: 3,
      note: null,
      reason: null,
    });
  });

  it("downgrades invalid payloads to noop", () => {
    expect(normalizeExpenseSheetIntent("oops")).toEqual({
      action: "noop",
      rowNumber: null,
      amount: null,
      item: null,
      payerName: null,
      splitMode: "none",
      participantCount: null,
      note: null,
      reason: "Gemini khong tra ve object hop le.",
    });
  });

  it("drops invalid numeric fields", () => {
    expect(
      normalizeExpenseSheetIntent({
        action: "update",
        rowNumber: 0,
        amount: -50,
        item: "tra sua",
        payerName: "Lan",
        splitMode: "weird",
        participantCount: 0,
        note: "abc",
        reason: "",
      })
    ).toEqual({
      action: "update",
      rowNumber: null,
      amount: null,
      item: "tra sua",
      payerName: "Lan",
      splitMode: "none",
      participantCount: null,
      note: "abc",
      reason: null,
    });
  });
});
