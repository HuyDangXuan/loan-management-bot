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
      rowNumber: null,
      amount: 80000,
      item: "thịt",
      payerName: "Vu",
      splitMode: "none",
      participantCount: null,
      note: null,
      reason: null,
    });

    const { getDiscordExpenseSheetReplyContent } = await import(
      "../lib/getDiscordExpenseSheetReplyContent"
    );

    const reply = await getDiscordExpenseSheetReplyContent({
      content: "vũ mua thịt 80k/3",
      inGuild: true,
      isBot: false,
      isSystem: false,
      discordUserId: "user-1",
      discordUsername: "vu",
      discordDisplayName: "Vũ",
    });

    expect(mocks.appendLedgerRowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        splitMode: "all_room",
        totalPaid: 80000,
        item: "thịt",
        paidBy: "Vu",
        sourceMessage: "vũ mua thịt 80k/3",
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
});
