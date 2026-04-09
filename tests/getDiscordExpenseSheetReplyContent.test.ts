import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appendLedgerRowMock: vi.fn(),
  deleteLedgerRowMock: vi.fn(),
  getRoomConfigMock: vi.fn(),
  inferExpenseSheetIntentMock: vi.fn(),
  updateLedgerRowMock: vi.fn(),
}));

vi.mock("../lib/googleSheetsExpenseStore", () => ({
  appendLedgerRow: mocks.appendLedgerRowMock,
  deleteLedgerRow: mocks.deleteLedgerRowMock,
  getRoomConfig: mocks.getRoomConfigMock,
  updateLedgerRow: mocks.updateLedgerRowMock,
}));

vi.mock("../lib/expenseSheetIntent", () => ({
  inferExpenseSheetIntent: mocks.inferExpenseSheetIntentMock,
}));

describe("getDiscordExpenseSheetReplyContent", () => {
  beforeEach(() => {
    mocks.appendLedgerRowMock.mockReset();
    mocks.deleteLedgerRowMock.mockReset();
    mocks.getRoomConfigMock.mockReset();
    mocks.inferExpenseSheetIntentMock.mockReset();
    mocks.updateLedgerRowMock.mockReset();

    mocks.getRoomConfigMock.mockResolvedValue({
      members: ["Huy", "Vu", "TienAnh"],
    });
    mocks.appendLedgerRowMock.mockResolvedValue({
      rowNumber: 4,
      sheetName: "P405",
    });
  });

  it("treats slash participant syntax as an all-room split when the count matches the room size", async () => {
    mocks.inferExpenseSheetIntentMock.mockResolvedValue({
      action: "add",
      entryType: "expense",
      rowNumber: null,
      amount: 80000,
      item: "thit",
      payerName: "Vu",
      fromMember: null,
      toMember: null,
      splitMode: "none",
      participantCount: null,
      note: null,
      reason: null,
    });

    const { getDiscordExpenseSheetReplyContent } = await import(
      "../lib/getDiscordExpenseSheetReplyContent"
    );

    const reply = await getDiscordExpenseSheetReplyContent({
      content: "vu mua thit 80k/3",
      inGuild: true,
      isBot: false,
      isSystem: false,
      discordUserId: "user-1",
      discordUsername: "vu",
      discordDisplayName: "Vu",
    });

    expect(mocks.appendLedgerRowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        splitMode: "all_room",
        totalPaid: 80000,
        item: "thit",
        paidBy: "Vu",
        sourceMessage: "vu mua thit 80k/3",
        balances: {
          Huy: -26666,
          Vu: 53332,
          TienAnh: -26666,
        },
      }),
      ["Huy", "Vu", "TienAnh"]
    );
    expect(reply).toContain('Da them dong 4 vao sheet "P405".');
    expect(reply).toContain("Settlement: Huy: -26666, Vu: 53332, TienAnh: -26666");
  });

  it("creates a debt row even when Gemini does not infer the command", async () => {
    mocks.inferExpenseSheetIntentMock.mockResolvedValue({
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
      reason: "Khong nhan dien duoc lenh phu hop.",
    });

    const { getDiscordExpenseSheetReplyContent } = await import(
      "../lib/getDiscordExpenseSheetReplyContent"
    );

    const reply = await getDiscordExpenseSheetReplyContent({
      content: "huy no vu 100k",
      inGuild: true,
      isBot: false,
      isSystem: false,
      discordUserId: "user-1",
      discordUsername: "huy",
      discordDisplayName: "Huy",
    });

    expect(mocks.appendLedgerRowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        splitMode: "none",
        totalPaid: 100000,
        item: "debt",
        paidBy: "Vu",
        note: "Huy -> Vu",
        sourceMessage: "huy no vu 100k",
        balances: {
          Huy: null,
          Vu: 100000,
          TienAnh: null,
        },
      }),
      ["Huy", "Vu", "TienAnh"]
    );
    expect(reply).toContain('Da them dong 4 vao sheet "P405".');
    expect(reply).toContain("Settlement: Vu: 100000");
  });

  it("returns a noop explanation for debt-like commands missing one member", async () => {
    mocks.inferExpenseSheetIntentMock.mockResolvedValue({
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
      reason: "Khong nhan dien duoc lenh phu hop.",
    });

    const { getDiscordExpenseSheetReplyContent } = await import(
      "../lib/getDiscordExpenseSheetReplyContent"
    );

    const reply = await getDiscordExpenseSheetReplyContent({
      content: "no vu 100k",
      inGuild: true,
      isBot: false,
      isSystem: false,
      discordUserId: "user-1",
      discordUsername: "huy",
      discordDisplayName: "Huy",
    });

    expect(mocks.appendLedgerRowMock).not.toHaveBeenCalled();
    expect(reply).toContain("Khong xu ly duoc lenh nay.");
    expect(reply).toContain("2 thanh vien trong room");
  });
});
