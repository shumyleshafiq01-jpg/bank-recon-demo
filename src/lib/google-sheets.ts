import { google } from "googleapis";

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.replace(/^["']|["']$/g, ""),
      // Strip surrounding quotes (Vercel stores them literally) then unescape newlines
      private_key: process.env.GOOGLE_PRIVATE_KEY
        ?.replace(/^["']|["']$/g, "")
        .replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function getSheets() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

function getSpreadsheetId() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("GOOGLE_SHEET_ID not configured");
  return id;
}

export async function ensureSheet(sheetName: string, headers: string[]) {
  const sheets = getSheets();
  const spreadsheetId = getSpreadsheetId();

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === sheetName);

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [headers] },
    });
    return;
  }

  // If new columns were appended to this sheet's HEADERS in code since it was
  // first created, keep row 1 in sync (headers-only, never touches data rows).
  // A stale/short header row was found to confuse Sheets' append-target
  // detection into misplacing new rows into the wrong columns.
  const headerRow = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!1:1` });
  const currentHeaders = headerRow.data.values?.[0] ?? [];
  if (currentHeaders.length < headers.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [headers] },
    });
  }
}

export async function readSheet(sheetName: string): Promise<string[][]> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `${sheetName}!A:Z`,
  });
  return (res.data.values ?? []) as string[][];
}

export async function writeRows(sheetName: string, rows: string[][]) {
  const sheets = getSheets();
  const spreadsheetId = getSpreadsheetId();
  // Explicitly compute the next empty row ourselves rather than relying on
  // Sheets' values.append table-detection, which was found to misplace new
  // rows — shifting their columns rightward instead of starting at column A —
  // when a sheet's header row had fallen behind its actual data column count.
  const existing = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A:Z` });
  const nextRow = (existing.data.values?.length ?? 0) + 1;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A${nextRow}`,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });
}

export async function updateCell(sheetName: string, range: string, value: string) {
  const sheets = getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: getSpreadsheetId(),
    range: `${sheetName}!${range}`,
    valueInputOption: "RAW",
    requestBody: { values: [[value]] },
  });
}

export async function updateRow(sheetName: string, rowIndex: number, values: string[]) {
  const sheets = getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: getSpreadsheetId(),
    range: `${sheetName}!A${rowIndex}`,
    valueInputOption: "RAW",
    requestBody: { values: [values] },
  });
}

export async function clearAndWrite(sheetName: string, allRows: string[][]) {
  const sheets = getSheets();
  const spreadsheetId = getSpreadsheetId();
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${sheetName}!A:Z`,
  });
  if (allRows.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: allRows },
    });
  }
}

export async function deleteRow(sheetName: string, rowIndex: number) {
  const sheets = getSheets();
  const spreadsheetId = getSpreadsheetId();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === sheetName);
  if (!sheet?.properties?.sheetId && sheet?.properties?.sheetId !== 0) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId: sheet.properties.sheetId,
            dimension: "ROWS",
            startIndex: rowIndex - 1,
            endIndex: rowIndex,
          },
        },
      }],
    },
  });
}
