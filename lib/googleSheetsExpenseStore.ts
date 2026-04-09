import { JWT } from "google-auth-library";

import type { ExpenseSplitMode } from "./expenseSettlement";
import { CONFIG_SHEET_NAME, type RoomConfig } from "./roomConfig";

export const LEDGER_FIXED_HEADERS = [
  "Timestamp",
  "Action",
  "PaidBy",
  "Item",
  "TotalPaid",
  "SplitMode",
  "Note",
  "SourceMessage",
] as const;

const CONFIG_HEADERS = [
  "MemberOrder",
  "MemberName",
  "Active",
  "UpdatedAt",
] as const;

type Color = {
  red: number;
  green: number;
  blue: number;
};

type SpreadsheetSheet = {
  properties?: {
    title?: string;
    sheetId?: number;
    gridProperties?: {
      frozenRowCount?: number;
    };
  };
  conditionalFormats?: unknown[];
  bandedRanges?: Array<{
    bandedRangeId?: number;
  }>;
};

type SpreadsheetMetadata = {
  sheets?: SpreadsheetSheet[];
};

export type LedgerRowInput = {
  action: "add" | "update";
  paidBy: string | null;
  item: string;
  totalPaid: number;
  splitMode: ExpenseSplitMode;
  note: string | null;
  sourceMessage: string;
  balances: Record<string, number | null>;
};

export type LedgerMutationResult = {
  rowNumber: number;
  sheetName: string;
};

const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const CONFIG_HEADER_COLOR: Color = { red: 0.89, green: 0.94, blue: 0.98 };
const CONFIG_BAND_1: Color = { red: 0.98, green: 0.99, blue: 1 };
const CONFIG_BAND_2: Color = { red: 0.95, green: 0.97, blue: 1 };
const LEDGER_HEADER_COLOR: Color = { red: 0.91, green: 0.94, blue: 0.88 };
const LEDGER_BAND_1: Color = { red: 0.99, green: 0.99, blue: 0.98 };
const LEDGER_BAND_2: Color = { red: 0.96, green: 0.97, blue: 0.95 };
const MEMBER_NEUTRAL_COLOR: Color = { red: 0.97, green: 0.97, blue: 0.97 };
const MEMBER_POSITIVE_COLOR: Color = { red: 0.87, green: 0.95, blue: 0.89 };
const MEMBER_NEGATIVE_COLOR: Color = { red: 0.98, green: 0.88, blue: 0.88 };

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing ${name} in environment variables.`);
  }

  return value;
}

function getSpreadsheetId() {
  return getRequiredEnv("GOOGLE_SHEETS_SPREADSHEET_ID");
}

function getLedgerSheetName() {
  return getRequiredEnv("GOOGLE_SHEETS_SHEET_NAME");
}

async function getAccessToken() {
  const email = getRequiredEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKey = getRequiredEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(
    /\\n/g,
    "\n"
  );

  const client = new JWT({
    email,
    key: privateKey,
    scopes: [GOOGLE_SHEETS_SCOPE],
  });

  const token = await client.getAccessToken();

  if (!token.token) {
    throw new Error("Could not retrieve Google Sheets access token.");
  }

  return token.token;
}

async function googleSheetsFetch(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  const response = await fetch(`https://sheets.googleapis.com/v4/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Sheets API error ${response.status}: ${body}`);
  }

  return response;
}

async function batchUpdateSpreadsheet(requests: unknown[]) {
  if (!requests.length) {
    return;
  }

  await googleSheetsFetch(`spreadsheets/${getSpreadsheetId()}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
}

function encodeRange(range: string) {
  return encodeURIComponent(range);
}

async function getSpreadsheetMetadata(): Promise<SpreadsheetMetadata> {
  const response = await googleSheetsFetch(`spreadsheets/${getSpreadsheetId()}`);
  return (await response.json()) as SpreadsheetMetadata;
}

function findSheet(metadata: SpreadsheetMetadata, title: string) {
  return (
    metadata.sheets?.find((sheet) => sheet.properties?.title === title) ?? null
  );
}

async function ensureSheetExists(title: string) {
  const metadata = await getSpreadsheetMetadata();
  const existing = findSheet(metadata, title);
  const existingId = existing?.properties?.sheetId;

  if (typeof existingId === "number") {
    return existingId;
  }

  await batchUpdateSpreadsheet([
    {
      addSheet: {
        properties: {
          title,
        },
      },
    },
  ]);

  const nextMetadata = await getSpreadsheetMetadata();
  const created = findSheet(nextMetadata, title)?.properties?.sheetId;

  if (typeof created !== "number") {
    throw new Error(`Could not create sheet "${title}".`);
  }

  return created;
}

async function readSheetValues(range: string) {
  const response = await googleSheetsFetch(
    `spreadsheets/${getSpreadsheetId()}/values/${encodeRange(range)}`
  );
  const payload = (await response.json()) as {
    values?: string[][];
  };

  return payload.values ?? [];
}

async function writeSheetValues(range: string, values: (string | number)[][]) {
  await googleSheetsFetch(
    `spreadsheets/${getSpreadsheetId()}/values/${encodeRange(
      range
    )}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      body: JSON.stringify({ values }),
    }
  );
}

async function clearSheetRange(range: string) {
  await googleSheetsFetch(
    `spreadsheets/${getSpreadsheetId()}/values/${encodeRange(range)}:clear`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}

async function appendSheetValues(range: string, values: (string | number)[][]) {
  const response = await googleSheetsFetch(
    `spreadsheets/${getSpreadsheetId()}/values/${encodeRange(
      range
    )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      body: JSON.stringify({ values }),
    }
  );

  return (await response.json()) as {
    updates?: {
      updatedRange?: string;
    };
  };
}

function parseUpdatedRangeRowNumber(updatedRange: string | undefined) {
  if (!updatedRange) {
    return null;
  }

  const match = updatedRange.match(/![A-Z]+(\d+):/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function areHeadersEqual(left: string[], right: string[]) {
  return (
    left.length === right.length && left.every((value, index) => value === right[index])
  );
}

function toLedgerCellValue(value: number | null | undefined) {
  return value == null ? "" : String(value);
}

function toColumnLetter(columnNumber: number) {
  let value = columnNumber;
  let result = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }

  return result;
}

function buildLedgerRowValues(headers: string[], input: LedgerRowInput) {
  const fixedValues = [
    new Date().toISOString(),
    input.action,
    input.paidBy ?? "",
    input.item,
    String(input.totalPaid),
    input.splitMode,
    input.note ?? "",
    input.sourceMessage,
  ];

  const memberValues = headers
    .slice(LEDGER_FIXED_HEADERS.length)
    .map((member) => toLedgerCellValue(input.balances[member]));

  return [...fixedValues, ...memberValues];
}

async function syncLedgerHeaders(activeMembers: string[]) {
  const ledgerSheetName = getLedgerSheetName();
  await ensureSheetExists(ledgerSheetName);

  const rows = await readSheetValues(ledgerSheetName);
  const currentHeaders = rows[0] ?? [];
  const existingMemberHeaders = currentHeaders
    .slice(LEDGER_FIXED_HEADERS.length)
    .filter(Boolean);
  const desiredHeaders = [
    ...LEDGER_FIXED_HEADERS,
    ...activeMembers,
    ...existingMemberHeaders.filter((member) => !activeMembers.includes(member)),
  ];

  if (!rows.length) {
    await writeSheetValues(`${ledgerSheetName}!A1`, [desiredHeaders]);
    return desiredHeaders;
  }

  if (areHeadersEqual(currentHeaders, desiredHeaders)) {
    return desiredHeaders;
  }

  const remappedRows = rows.map((row, rowIndex) => {
    if (rowIndex === 0) {
      return desiredHeaders;
    }

    const valueByHeader = new Map<string, string>();

    currentHeaders.forEach((header, index) => {
      if (header) {
        valueByHeader.set(header, row[index] ?? "");
      }
    });

    return desiredHeaders.map((header) => valueByHeader.get(header) ?? "");
  });

  await clearSheetRange(ledgerSheetName);
  await writeSheetValues(`${ledgerSheetName}!A1`, remappedRows);

  return desiredHeaders;
}

async function deleteExistingConditionalFormats(sheet: SpreadsheetSheet) {
  const sheetId = sheet.properties?.sheetId;

  if (typeof sheetId !== "number") {
    return;
  }

  const count = sheet.conditionalFormats?.length ?? 0;

  await batchUpdateSpreadsheet(
    Array.from({ length: count }, (_, index) => ({
      deleteConditionalFormatRule: {
        sheetId,
        index: count - index - 1,
      },
    }))
  );
}

async function deleteExistingBanding(sheet: SpreadsheetSheet) {
  const bandedRangeIds =
    sheet.bandedRanges
      ?.map((banding) => banding.bandedRangeId)
      .filter((id): id is number => typeof id === "number") ?? [];

  await batchUpdateSpreadsheet(
    bandedRangeIds.map((bandedRangeId) => ({
      deleteBanding: { bandedRangeId },
    }))
  );
}

async function applyConfigSheetFormatting() {
  const metadata = await getSpreadsheetMetadata();
  const sheet = findSheet(metadata, CONFIG_SHEET_NAME);
  const sheetId = sheet?.properties?.sheetId;

  if (typeof sheetId !== "number" || !sheet) {
    return;
  }

  await deleteExistingBanding(sheet);

  await batchUpdateSpreadsheet([
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: {
            frozenRowCount: 1,
          },
        },
        fields: "gridProperties.frozenRowCount",
      },
    },
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: CONFIG_HEADER_COLOR,
            textFormat: {
              bold: true,
            },
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat.bold)",
      },
    },
    {
      addBanding: {
        bandedRange: {
          range: {
            sheetId,
            startRowIndex: 0,
            startColumnIndex: 0,
            endColumnIndex: CONFIG_HEADERS.length,
          },
          rowProperties: {
            headerColor: CONFIG_HEADER_COLOR,
            firstBandColor: CONFIG_BAND_1,
            secondBandColor: CONFIG_BAND_2,
          },
        },
      },
    },
    {
      autoResizeDimensions: {
        dimensions: {
          sheetId,
          dimension: "COLUMNS",
          startIndex: 0,
          endIndex: CONFIG_HEADERS.length,
        },
      },
    },
  ]);
}

async function applyLedgerSheetFormatting(totalColumnCount: number) {
  const metadata = await getSpreadsheetMetadata();
  const sheet = findSheet(metadata, getLedgerSheetName());
  const sheetId = sheet?.properties?.sheetId;

  if (typeof sheetId !== "number" || !sheet) {
    return;
  }

  await deleteExistingConditionalFormats(sheet);
  await deleteExistingBanding(sheet);

  const memberStartColumn = LEDGER_FIXED_HEADERS.length;
  const requests: unknown[] = [
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: {
            frozenRowCount: 1,
          },
        },
        fields: "gridProperties.frozenRowCount",
      },
    },
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: LEDGER_HEADER_COLOR,
            textFormat: {
              bold: true,
            },
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat.bold)",
      },
    },
    {
      addBanding: {
        bandedRange: {
          range: {
            sheetId,
            startRowIndex: 0,
            startColumnIndex: 0,
            endColumnIndex: totalColumnCount,
          },
          rowProperties: {
            headerColor: LEDGER_HEADER_COLOR,
            firstBandColor: LEDGER_BAND_1,
            secondBandColor: LEDGER_BAND_2,
          },
        },
      },
    },
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 1,
          startColumnIndex: 4,
          endColumnIndex: 5,
        },
        cell: {
          userEnteredFormat: {
            numberFormat: {
              type: "NUMBER",
              pattern: "#,##0 \"VND\"",
            },
          },
        },
        fields: "userEnteredFormat.numberFormat",
      },
    },
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 1,
          startColumnIndex: 6,
          endColumnIndex: 8,
        },
        cell: {
          userEnteredFormat: {
            wrapStrategy: "WRAP",
          },
        },
        fields: "userEnteredFormat.wrapStrategy",
      },
    },
    {
      autoResizeDimensions: {
        dimensions: {
          sheetId,
          dimension: "COLUMNS",
          startIndex: 0,
          endIndex: totalColumnCount,
        },
      },
    },
  ];

  if (totalColumnCount > memberStartColumn) {
    requests.push(
      {
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 1,
            startColumnIndex: memberStartColumn,
            endColumnIndex: totalColumnCount,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: MEMBER_NEUTRAL_COLOR,
              numberFormat: {
                type: "NUMBER",
                pattern: "#,##0",
              },
            },
          },
          fields: "userEnteredFormat(backgroundColor,numberFormat)",
        },
      },
      {
        addConditionalFormatRule: {
          rule: {
            ranges: [
              {
                sheetId,
                startRowIndex: 1,
                startColumnIndex: memberStartColumn,
                endColumnIndex: totalColumnCount,
              },
            ],
            booleanRule: {
              condition: {
                type: "NUMBER_GREATER",
                values: [{ userEnteredValue: "0" }],
              },
              format: {
                backgroundColor: MEMBER_POSITIVE_COLOR,
              },
            },
          },
          index: 0,
        },
      },
      {
        addConditionalFormatRule: {
          rule: {
            ranges: [
              {
                sheetId,
                startRowIndex: 1,
                startColumnIndex: memberStartColumn,
                endColumnIndex: totalColumnCount,
              },
            ],
            booleanRule: {
              condition: {
                type: "NUMBER_LESS",
                values: [{ userEnteredValue: "0" }],
              },
              format: {
                backgroundColor: MEMBER_NEGATIVE_COLOR,
              },
            },
          },
          index: 1,
        },
      }
    );
  }

  await batchUpdateSpreadsheet(requests);
}

async function ensureRoomSheetsReady(activeMembers: string[]) {
  await ensureSheetExists(CONFIG_SHEET_NAME);
  const headers = await syncLedgerHeaders(activeMembers);
  await applyConfigSheetFormatting();
  await applyLedgerSheetFormatting(headers.length);
  return headers;
}

export async function getRoomConfig(): Promise<RoomConfig | null> {
  const metadata = await getSpreadsheetMetadata();

  if (!findSheet(metadata, CONFIG_SHEET_NAME)) {
    return null;
  }

  const rows = await readSheetValues(`${CONFIG_SHEET_NAME}!A2:D`);

  const members = rows
    .filter((row) => (row[2] ?? "TRUE").toUpperCase() !== "FALSE" && row[1])
    .sort((left, right) => Number(left[0] ?? "0") - Number(right[0] ?? "0"))
    .map((row) => row[1]);

  return members.length ? { members } : null;
}

export async function saveRoomConfig(config: RoomConfig) {
  await ensureSheetExists(CONFIG_SHEET_NAME);
  await ensureSheetExists(getLedgerSheetName());

  const updatedAt = new Date().toISOString();
  const values = [
    Array.from(CONFIG_HEADERS),
    ...config.members.map((member, index) => [
      String(index + 1),
      member,
      "TRUE",
      updatedAt,
    ]),
  ];

  await clearSheetRange(CONFIG_SHEET_NAME);
  await writeSheetValues(`${CONFIG_SHEET_NAME}!A1`, values);
  const headers = await ensureRoomSheetsReady(config.members);

  return {
    configSheetName: CONFIG_SHEET_NAME,
    ledgerSheetName: getLedgerSheetName(),
    headers,
  };
}

export async function appendLedgerRow(
  input: LedgerRowInput,
  activeMembers: string[]
): Promise<LedgerMutationResult> {
  const headers = await ensureRoomSheetsReady(activeMembers);
  const payload = await appendSheetValues(getLedgerSheetName(), [
    buildLedgerRowValues(headers, input),
  ]);
  const rowNumber = parseUpdatedRangeRowNumber(payload.updates?.updatedRange);

  if (!rowNumber) {
    throw new Error("Could not determine appended row number.");
  }

  return {
    rowNumber,
    sheetName: getLedgerSheetName(),
  };
}

export async function updateLedgerRow(
  rowNumber: number,
  input: LedgerRowInput,
  activeMembers: string[]
): Promise<LedgerMutationResult> {
  if (rowNumber < 2) {
    throw new Error("Row number must be 2 or greater.");
  }

  const headers = await ensureRoomSheetsReady(activeMembers);
  const endColumnLetter = toColumnLetter(headers.length);

  await writeSheetValues(
    `${getLedgerSheetName()}!A${rowNumber}:${endColumnLetter}${rowNumber}`,
    [buildLedgerRowValues(headers, input)]
  );

  return {
    rowNumber,
    sheetName: getLedgerSheetName(),
  };
}

export async function deleteLedgerRow(
  rowNumber: number
): Promise<LedgerMutationResult> {
  if (rowNumber < 2) {
    throw new Error("Row number must be 2 or greater.");
  }

  const metadata = await getSpreadsheetMetadata();
  const sheetId = findSheet(metadata, getLedgerSheetName())?.properties?.sheetId;

  if (typeof sheetId !== "number") {
    throw new Error(`Sheet "${getLedgerSheetName()}" was not found.`);
  }

  await batchUpdateSpreadsheet([
    {
      deleteDimension: {
        range: {
          sheetId,
          dimension: "ROWS",
          startIndex: rowNumber - 1,
          endIndex: rowNumber,
        },
      },
    },
  ]);

  return {
    rowNumber,
    sheetName: getLedgerSheetName(),
  };
}
