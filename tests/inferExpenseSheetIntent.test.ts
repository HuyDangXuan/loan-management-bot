import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateContentMock: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: mocks.generateContentMock,
    };
  },
}));

describe("inferExpenseSheetIntent", () => {
  beforeEach(() => {
    mocks.generateContentMock.mockReset();
    process.env.GEMINI_API_KEY = "gemini_api_key";
  });

  it("uses the flash-lite model for intent inference", async () => {
    mocks.generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        action: "add",
        rowNumber: null,
        amount: 120000,
        item: "cafe",
        payerName: "Huy",
        splitMode: "none",
        participantCount: null,
        note: null,
        reason: null,
      }),
    });

    vi.resetModules();
    const { inferExpenseSheetIntent } = await import("../lib/expenseSheetIntent");

    await inferExpenseSheetIntent({
      message: "120k cafe",
      parsedExpense: { amount: 120000, item: "cafe" },
      roomMembers: ["Huy", "Vu"],
      senderName: "Huy",
      senderUsername: "huy",
    });

    expect(mocks.generateContentMock).toHaveBeenCalledTimes(1);
    expect(mocks.generateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-2.5-flash-lite",
      })
    );
  });
});
