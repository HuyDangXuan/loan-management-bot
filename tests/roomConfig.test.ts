import { describe, expect, it } from "vitest";

import {
  formatRoomConfigSummary,
  parseRoomConfigInput,
  resolveRoomMemberName,
} from "../lib/roomConfig";

describe("parseRoomConfigInput", () => {
  it("parses and normalizes members", () => {
    expect(parseRoomConfigInput(3, " Huy , Lan,  Minh ")).toEqual({
      members: ["Huy", "Lan", "Minh"],
    });
  });

  it("rejects mismatched member counts", () => {
    expect(() => parseRoomConfigInput(2, "Huy, Lan, Minh")).toThrow(
      /so_nguoi = 2/
    );
  });

  it("rejects duplicate names case-insensitively", () => {
    expect(() => parseRoomConfigInput(2, "Huy, huy")).toThrow(/bi trung/);
  });
});

describe("resolveRoomMemberName", () => {
  it("matches ignoring accents and case", () => {
    expect(resolveRoomMemberName(["Huy", "Minh Duc"], "minh duc")).toBe(
      "Minh Duc"
    );
  });
});

describe("formatRoomConfigSummary", () => {
  it("formats a short summary", () => {
    expect(formatRoomConfigSummary({ members: ["Huy", "Lan", "Minh"] })).toBe(
      "3 nguoi: Huy, Lan, Minh"
    );
  });
});
