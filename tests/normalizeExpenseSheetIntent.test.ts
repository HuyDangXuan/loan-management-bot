import { describe, expect, it } from "vitest";

import { normalizeExpenseSheetIntent } from "../lib/expenseSheetIntent";

describe("normalizeExpenseSheetIntent", () => {
  it("keeps a valid debt intent", () => {
    expect(
      normalizeExpenseSheetIntent({
        action: "add",
        entryType: "debt",
        rowNumber: null,
        amount: 120000,
        item: "debt",
        payerName: "Vu",
        fromMember: "Huy",
        toMember: "Vu",
        splitMode: "none",
        participantCount: null,
        note: "Huy -> Vu",
        reason: null,
      })
    ).toEqual({
      action: "add",
      entryType: "debt",
      rowNumber: null,
      amount: 120000,
      item: "debt",
      payerName: "Vu",
      fromMember: "Huy",
      toMember: "Vu",
      splitMode: "none",
      participantCount: null,
      note: "Huy -> Vu",
      reason: null,
    });
  });

  it("downgrades invalid payloads to noop", () => {
    expect(normalizeExpenseSheetIntent("oops")).toEqual({
      action: "noop",
      entryType: "expense",
      rowNumber: null,
      amount: null,
      item: null,
      payerName: null,
      fromMember: null,
      toMember: null,
      splitMode: "none",
      participantCount: null,
      note: null,
      reason: "Gemini khong tra ve object hop le.",
    });
  });

  it("drops invalid numeric fields and keeps debt metadata", () => {
    expect(
      normalizeExpenseSheetIntent({
        action: "update",
        entryType: "repay",
        rowNumber: 0,
        amount: -50,
        item: "repay",
        payerName: "Vu",
        fromMember: "Lan",
        toMember: "Vu",
        splitMode: "weird",
        participantCount: 0,
        note: "abc",
        reason: "",
      })
    ).toEqual({
      action: "update",
      entryType: "repay",
      rowNumber: null,
      amount: null,
      item: "repay",
      payerName: "Vu",
      fromMember: "Lan",
      toMember: "Vu",
      splitMode: "none",
      participantCount: null,
      note: "abc",
      reason: null,
    });
  });
});
