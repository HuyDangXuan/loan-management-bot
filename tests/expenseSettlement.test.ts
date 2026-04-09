import { describe, expect, it } from "vitest";

import {
  computeAllRoomSettlement,
  computeRecipientCreditSettlement,
  createEmptyBalances,
} from "../lib/expenseSettlement";

describe("createEmptyBalances", () => {
  it("creates blank balances for each member", () => {
    expect(createEmptyBalances(["Huy", "Lan"])).toEqual({
      Huy: null,
      Lan: null,
    });
  });
});

describe("computeAllRoomSettlement", () => {
  it("computes net settlement for a 3-person room", () => {
    expect(
      computeAllRoomSettlement(["Huy", "Lan", "Minh"], "Huy", 120000)
    ).toEqual({
      splitMode: "all_room",
      balances: {
        Huy: 80000,
        Lan: -40000,
        Minh: -40000,
      },
    });
  });

  it("assigns rounding remainder to the payer share", () => {
    expect(computeAllRoomSettlement(["Huy", "Lan", "Minh"], "Huy", 100)).toEqual(
      {
        splitMode: "all_room",
        balances: {
          Huy: 66,
          Lan: -33,
          Minh: -33,
        },
      }
    );
  });
});

describe("computeRecipientCreditSettlement", () => {
  it("credits only the recipient member for debt-style entries", () => {
    expect(
      computeRecipientCreditSettlement(["Huy", "Vu", "TienAnh"], "Vu", 100000)
    ).toEqual({
      splitMode: "none",
      balances: {
        Huy: null,
        Vu: 100000,
        TienAnh: null,
      },
    });
  });
});
