import { describe, expect, it } from "vitest";

import { parseDebtTransferMessage } from "../lib/parseDebtTransferMessage";

const members = ["Huy", "Vu", "TienAnh"];

describe("parseDebtTransferMessage", () => {
  it("parses debt variants into a directed recipient credit", () => {
    expect(parseDebtTransferMessage("huy con no vu 100k", members)).toEqual({
      kind: "matched",
      entryType: "debt",
      fromMember: "Huy",
      toMember: "Vu",
      amount: 100000,
      note: "Huy -> Vu",
    });
  });

  it("parses repay variants into a directed recipient credit", () => {
    expect(parseDebtTransferMessage("huy hoan tien cho vu 100k", members)).toEqual({
      kind: "matched",
      entryType: "repay",
      fromMember: "Huy",
      toMember: "Vu",
      amount: 100000,
      note: "Huy -> Vu",
    });
  });

  it("rejects debt-like messages that do not name two room members", () => {
    expect(parseDebtTransferMessage("no vu 100k", members)).toEqual({
      kind: "invalid",
      entryType: "debt",
      reason: "Lenh cong no/tra no phai ghi ro 2 thanh vien trong room.",
    });
  });

  it("rejects debt-like messages that mention members outside the room", () => {
    expect(parseDebtTransferMessage("huy tra nam 100k", members)).toEqual({
      kind: "invalid",
      entryType: "repay",
      reason: "Lenh cong no/tra no phai ghi ro 2 thanh vien trong room.",
    });
  });

  it("ignores normal expense messages", () => {
    expect(parseDebtTransferMessage("huy mua thit 100k", members)).toBeNull();
  });
});
