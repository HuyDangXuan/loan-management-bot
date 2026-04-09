import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAccessTokenMock: vi.fn(),
}));

vi.mock("google-auth-library", () => ({
  JWT: class {
    getAccessToken = mocks.getAccessTokenMock;
  },
}));

function buildMetadataResponse() {
  return {
    sheets: [
      {
        properties: {
          title: "Config",
          sheetId: 1,
          gridProperties: {
            rowCount: 1000,
          },
        },
      },
      {
        properties: {
          title: "P405",
          sheetId: 2,
          gridProperties: {
            rowCount: 1000,
          },
        },
      },
    ],
  };
}

function buildLedgerHeaders() {
  return [
    "Timestamp",
    "Action",
    "PaidBy",
    "Item",
    "TotalPaid",
    "SplitMode",
    "Note",
    "SourceMessage",
    "Huy",
    "Vu",
    "TienAnh",
  ];
}

function buildLedgerInput() {
  return {
    action: "add" as const,
    paidBy: "Vu",
    item: "thit",
    totalPaid: 80000,
    splitMode: "none" as const,
    note: "ghi chu dai",
    sourceMessage: "vu mua thit cho het 3",
    balances: {
      Huy: 240000,
      Vu: -120000,
      TienAnh: -120000,
    },
  };
}

function createFetchMock() {
  return vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === "https://sheets.googleapis.com/v4/spreadsheets/spreadsheet-id") {
      return new Response(JSON.stringify(buildMetadataResponse()), { status: 200 });
    }

    if (
      url === "https://sheets.googleapis.com/v4/spreadsheets/spreadsheet-id/values/P405"
    ) {
      return new Response(JSON.stringify({ values: [buildLedgerHeaders()] }), {
        status: 200,
      });
    }

    if (
      init?.method === "POST" &&
      url.startsWith(
        "https://sheets.googleapis.com/v4/spreadsheets/spreadsheet-id:batchUpdate"
      )
    ) {
      return new Response(JSON.stringify({}), { status: 200 });
    }

    if (init?.method === "POST" && url.includes(":append?")) {
      return new Response(
        JSON.stringify({
          updates: {
            updatedRange: "P405!A2:K2",
          },
        }),
        { status: 200 }
      );
    }

    if (
      init?.method === "PUT" &&
      url.includes(
        "/values/P405!A2%3AK2?valueInputOption=USER_ENTERED"
      )
    ) {
      return new Response(JSON.stringify({ updatedRange: "P405!A2:K2" }), {
        status: 200,
      });
    }

    throw new Error(`Unexpected fetch call: ${init?.method ?? "GET"} ${url}`);
  });
}

function getBatchUpdateBodies(fetchMock: ReturnType<typeof createFetchMock>) {
  return fetchMock.mock.calls
    .filter(([input, init]) => {
      return (
        init?.method === "POST" &&
        String(input).startsWith(
          "https://sheets.googleapis.com/v4/spreadsheets/spreadsheet-id:batchUpdate"
        )
      );
    })
    .map(([, init]) => JSON.parse(String(init?.body ?? "{}")));
}

describe("googleSheetsExpenseStore", () => {
  beforeEach(() => {
    mocks.getAccessTokenMock.mockReset();
    mocks.getAccessTokenMock.mockResolvedValue({ token: "test-token" });

    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "spreadsheet-id";
    process.env.GOOGLE_SHEETS_SHEET_NAME = "P405";
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "bot@example.com";
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY =
      "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n";
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("anchors append requests at A1 so Google Sheets appends to the main table", async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    vi.resetModules();
    const { appendLedgerRow } = await import("../lib/googleSheetsExpenseStore");

    await appendLedgerRow(buildLedgerInput(), ["Huy", "Vu", "TienAnh"]);

    const appendCall = fetchMock.mock.calls.find(([input]) =>
      String(input).includes(":append?")
    );

    expect(appendCall).toBeDefined();
    expect(String(appendCall?.[0])).toContain("/values/P405!A1:append?");
  });

  it("writes timestamp values as Sheets date serial numbers when appending and updating", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-09T15:27:00+07:00"));

    const fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    vi.resetModules();
    const { appendLedgerRow, updateLedgerRow } = await import(
      "../lib/googleSheetsExpenseStore"
    );

    await appendLedgerRow(buildLedgerInput(), ["Huy", "Vu", "TienAnh"]);
    await updateLedgerRow(2, buildLedgerInput(), ["Huy", "Vu", "TienAnh"]);

    const appendBody = fetchMock.mock.calls
      .filter(([input, init]) => init?.method === "POST" && String(input).includes(":append?"))
      .map(([, init]) => JSON.parse(String(init?.body ?? "{}")))[0];
    const updateBody = fetchMock.mock.calls
      .filter(([input, init]) => {
        return (
          init?.method === "PUT" &&
          String(input).includes("/values/P405!A2%3AK2?valueInputOption=USER_ENTERED")
        );
      })
      .map(([, init]) => JSON.parse(String(init?.body ?? "{}")))[0];

    expect(typeof appendBody.values[0][0]).toBe("number");
    expect(typeof updateBody.values[0][0]).toBe("number");
  });

  it("applies explicit ledger sizing and readable formatting instead of auto-resize defaults", async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    vi.resetModules();
    const { appendLedgerRow } = await import("../lib/googleSheetsExpenseStore");

    await appendLedgerRow(buildLedgerInput(), ["Huy", "Vu", "TienAnh"]);

    const batchBodies = getBatchUpdateBodies(fetchMock);
    const ledgerRequests = batchBodies[batchBodies.length - 1].requests as Array<{
      [key: string]: unknown;
    }>;

    expect(
      ledgerRequests.some((request) => "autoResizeDimensions" in request)
    ).toBe(false);

    expect(ledgerRequests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          updateDimensionProperties: expect.objectContaining({
            range: expect.objectContaining({
              dimension: "ROWS",
              startIndex: 0,
              endIndex: 1,
            }),
            properties: expect.objectContaining({
              pixelSize: 42,
            }),
          }),
        }),
        expect.objectContaining({
          updateDimensionProperties: expect.objectContaining({
            range: expect.objectContaining({
              dimension: "ROWS",
              startIndex: 1,
              endIndex: 1000,
            }),
            properties: expect.objectContaining({
              pixelSize: 36,
            }),
          }),
        }),
        expect.objectContaining({
          repeatCell: expect.objectContaining({
            range: expect.objectContaining({
              startRowIndex: 0,
              endRowIndex: 1,
            }),
            cell: expect.objectContaining({
              userEnteredFormat: expect.objectContaining({
                textFormat: expect.objectContaining({
                  bold: true,
                  fontSize: 13,
                }),
                verticalAlignment: "MIDDLE",
              }),
            }),
          }),
        }),
        expect.objectContaining({
          repeatCell: expect.objectContaining({
            range: expect.objectContaining({
              startRowIndex: 1,
            }),
            cell: expect.objectContaining({
              userEnteredFormat: expect.objectContaining({
                textFormat: expect.objectContaining({
                  fontSize: 12,
                }),
                verticalAlignment: "MIDDLE",
              }),
            }),
          }),
        }),
        expect.objectContaining({
          repeatCell: expect.objectContaining({
            range: expect.objectContaining({
              startRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: 1,
            }),
            cell: expect.objectContaining({
              userEnteredFormat: expect.objectContaining({
                numberFormat: expect.objectContaining({
                  type: "DATE_TIME",
                  pattern: "dd/MM HH:mm",
                }),
              }),
            }),
          }),
        }),
        expect.objectContaining({
          repeatCell: expect.objectContaining({
            range: expect.objectContaining({
              startRowIndex: 1,
              startColumnIndex: 6,
              endColumnIndex: 8,
            }),
            cell: expect.objectContaining({
              userEnteredFormat: expect.objectContaining({
                wrapStrategy: "WRAP",
              }),
            }),
          }),
        }),
      ])
    );

    const widthRequests = ledgerRequests
      .map((request) => request.updateDimensionProperties)
      .filter(Boolean) as Array<{
      range: {
        dimension: string;
        startIndex: number;
        endIndex: number;
      };
      properties: {
        pixelSize: number;
      };
    }>;

    expect(widthRequests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          range: expect.objectContaining({
            dimension: "COLUMNS",
            startIndex: 0,
            endIndex: 1,
          }),
          properties: expect.objectContaining({ pixelSize: 150 }),
        }),
        expect.objectContaining({
          range: expect.objectContaining({
            dimension: "COLUMNS",
            startIndex: 1,
            endIndex: 2,
          }),
          properties: expect.objectContaining({ pixelSize: 90 }),
        }),
        expect.objectContaining({
          range: expect.objectContaining({
            dimension: "COLUMNS",
            startIndex: 2,
            endIndex: 3,
          }),
          properties: expect.objectContaining({ pixelSize: 110 }),
        }),
        expect.objectContaining({
          range: expect.objectContaining({
            dimension: "COLUMNS",
            startIndex: 3,
            endIndex: 4,
          }),
          properties: expect.objectContaining({ pixelSize: 180 }),
        }),
        expect.objectContaining({
          range: expect.objectContaining({
            dimension: "COLUMNS",
            startIndex: 4,
            endIndex: 5,
          }),
          properties: expect.objectContaining({ pixelSize: 120 }),
        }),
        expect.objectContaining({
          range: expect.objectContaining({
            dimension: "COLUMNS",
            startIndex: 5,
            endIndex: 6,
          }),
          properties: expect.objectContaining({ pixelSize: 110 }),
        }),
        expect.objectContaining({
          range: expect.objectContaining({
            dimension: "COLUMNS",
            startIndex: 6,
            endIndex: 7,
          }),
          properties: expect.objectContaining({ pixelSize: 220 }),
        }),
        expect.objectContaining({
          range: expect.objectContaining({
            dimension: "COLUMNS",
            startIndex: 7,
            endIndex: 8,
          }),
          properties: expect.objectContaining({ pixelSize: 320 }),
        }),
        expect.objectContaining({
          range: expect.objectContaining({
            dimension: "COLUMNS",
            startIndex: 8,
            endIndex: 11,
          }),
          properties: expect.objectContaining({ pixelSize: 110 }),
        }),
      ])
    );

    expect(ledgerRequests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          repeatCell: expect.objectContaining({
            range: expect.objectContaining({
              startRowIndex: 1,
              startColumnIndex: 1,
              endColumnIndex: 2,
            }),
            cell: expect.objectContaining({
              userEnteredFormat: expect.objectContaining({
                horizontalAlignment: "CENTER",
              }),
            }),
          }),
        }),
        expect.objectContaining({
          repeatCell: expect.objectContaining({
            range: expect.objectContaining({
              startRowIndex: 1,
              startColumnIndex: 2,
              endColumnIndex: 3,
            }),
            cell: expect.objectContaining({
              userEnteredFormat: expect.objectContaining({
                horizontalAlignment: "CENTER",
              }),
            }),
          }),
        }),
        expect.objectContaining({
          repeatCell: expect.objectContaining({
            range: expect.objectContaining({
              startRowIndex: 1,
              startColumnIndex: 5,
              endColumnIndex: 6,
            }),
            cell: expect.objectContaining({
              userEnteredFormat: expect.objectContaining({
                horizontalAlignment: "CENTER",
              }),
            }),
          }),
        }),
        expect.objectContaining({
          repeatCell: expect.objectContaining({
            range: expect.objectContaining({
              startRowIndex: 1,
              startColumnIndex: 4,
              endColumnIndex: 5,
            }),
            cell: expect.objectContaining({
              userEnteredFormat: expect.objectContaining({
                horizontalAlignment: "RIGHT",
              }),
            }),
          }),
        }),
        expect.objectContaining({
          repeatCell: expect.objectContaining({
            range: expect.objectContaining({
              startRowIndex: 1,
              startColumnIndex: 8,
              endColumnIndex: 11,
            }),
            cell: expect.objectContaining({
              userEnteredFormat: expect.objectContaining({
                horizontalAlignment: "RIGHT",
              }),
            }),
          }),
        }),
      ])
    );
  });
});
