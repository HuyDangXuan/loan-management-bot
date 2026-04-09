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
    mocks.updateLedgerRowMock.mockResolvedValue({
      rowNumber: 6,
      sheetName: "P405",
    });
    mocks.deleteLedgerRowMock.mockResolvedValue({
      rowNumber: 7,
      sheetName: "P405",
    });
  });

  it("replies naturally for all-room split entries", async () => {
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
    expect(reply).toContain('Da ghi chi tieu "thit" 80.000d cho ca phong.');
    expect(reply).toContain("Can doi: Huy -26.666d, Vu +53.332d, TienAnh -26.666d.");
    expect(reply).not.toContain("```json");
  });

  it("creates a debt row with the new sign convention and natural reply", async () => {
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
          Huy: 100000,
          Vu: -100000,
          TienAnh: null,
        },
      }),
      ["Huy", "Vu", "TienAnh"]
    );
    expect(reply).toContain("Da ghi cong no: Huy no Vu 100.000d.");
    expect(reply).toContain("Can doi: Huy +100.000d, Vu -100.000d.");
    expect(reply).not.toContain("```json");
  });

  it("creates a repay row with the new sign convention and natural reply", async () => {
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
      content: "huy tra vu 50k",
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
        totalPaid: 50000,
        item: "repay",
        paidBy: "Vu",
        note: "Huy -> Vu",
        sourceMessage: "huy tra vu 50k",
        balances: {
          Huy: -50000,
          Vu: 50000,
          TienAnh: null,
        },
      }),
      ["Huy", "Vu", "TienAnh"]
    );
    expect(reply).toContain("Da ghi tra no: Huy tra Vu 50.000d.");
    expect(reply).toContain("Can doi: Huy -50.000d, Vu +50.000d.");
    expect(reply).not.toContain("```json");
  });

  it("returns a natural error when debt-like commands are missing one member", async () => {
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
    expect(reply).toBe(
      "Khong xu ly duoc lenh cong no/tra no: phai ghi ro 2 thanh vien trong room."
    );
    expect(reply).not.toContain("```json");
  });

  it("keeps row numbers in update replies without JSON output", async () => {
    mocks.inferExpenseSheetIntentMock.mockResolvedValue({
      action: "update",
      entryType: "expense",
      rowNumber: 6,
      amount: 120000,
      item: "com",
      payerName: null,
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
      content: "sua dong 6 thanh 120k com",
      inGuild: true,
      isBot: false,
      isSystem: false,
      discordUserId: "user-1",
      discordUsername: "huy",
      discordDisplayName: "Huy",
    });

    expect(mocks.updateLedgerRowMock).toHaveBeenCalled();
    expect(reply).toBe('Da cap nhat dong 6 voi chi tieu "com" 120.000d.');
  });

  it("keeps row numbers in delete replies without JSON output", async () => {
    mocks.inferExpenseSheetIntentMock.mockResolvedValue({
      action: "delete",
      entryType: "expense",
      rowNumber: 7,
      amount: null,
      item: null,
      payerName: null,
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
      content: "xoa dong 7",
      inGuild: true,
      isBot: false,
      isSystem: false,
      discordUserId: "user-1",
      discordUsername: "huy",
      discordDisplayName: "Huy",
    });

    expect(mocks.deleteLedgerRowMock).toHaveBeenCalledWith(7);
    expect(reply).toBe('Da xoa dong 7 trong sheet "P405".');
  });
});
