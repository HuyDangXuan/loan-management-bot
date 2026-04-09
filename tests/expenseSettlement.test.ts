import { describe, expect, it } from "vitest";

import {
  computeAllRoomSettlement,
  computeDebtTransferSettlement,
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

describe("computeDebtTransferSettlement", () => {
  it("maps debt entries as debtor positive and creditor negative", () => {
    expect(
      computeDebtTransferSettlement(
        ["Huy", "Vu", "TienAnh"],
        "Huy",
        "Vu",
        100000,
        "debt"
      )
    ).toEqual({
      splitMode: "none",
      balances: {
        Huy: 100000,
        Vu: -100000,
        TienAnh: null,
      },
    });
  });

  it("maps repay entries as payer negative and receiver positive", () => {
    expect(
      computeDebtTransferSettlement(
        ["Huy", "Vu", "TienAnh"],
        "Huy",
        "Vu",
        50000,
        "repay"
      )
    ).toEqual({
      splitMode: "none",
      balances: {
        Huy: -50000,
        Vu: 50000,
        TienAnh: null,
      },
    });
  });
});
