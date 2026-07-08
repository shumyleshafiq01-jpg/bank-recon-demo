import { google } from "googleapis";

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.replace(/^["']|["']$/g, ""),
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/^["']|["']$/g, "").replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

export async function GET() {
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const matches = (meta.data.sheets ?? [])
    .map(s => s.properties)
    .filter(p => (p?.title ?? "").toLowerCase().includes("brand"));

  const raw = await sheets.spreadsheets.values.get({ spreadsheetId, range: "PL_Brands!A1:Z100" });

  return Response.json({
    sheetsMatchingBrand: matches,
    totalSheetsInSpreadsheet: meta.data.sheets?.length,
    rawValues: raw.data.values ?? [],
  });
}

// One-time repair: rows got written shifted rightward into blank columns
// instead of starting at column A. Re-anchor each row's real data back to
// column A, drop diagnostic test rows, and dedupe by id (keep fullest record).
const HEADERS = ["id", "name", "address", "city", "country", "logoUrl", "createdAt", "contactPerson", "website", "email"];

export async function POST() {
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  const raw = await sheets.spreadsheets.values.get({ spreadsheetId, range: "PL_Brands!A1:Z100" });
  const rows = raw.data.values ?? [];
  const dataRows = rows.slice(1);

  const byId = new Map<string, string[]>();
  for (const row of dataRows) {
    const startIdx = row.findIndex(cell => cell && cell.trim());
    if (startIdx === -1) continue;
    const anchored = row.slice(startIdx);
    const id = anchored[0]?.trim();
    if (!id || id.startsWith("diag_test_")) continue;
    const padded = [...anchored, ...Array(HEADERS.length).fill("")].slice(0, HEADERS.length);
    const existing = byId.get(id);
    const fullness = (r: string[]) => r.filter(c => c && c.trim()).length;
    if (!existing || fullness(padded) > fullness(existing)) byId.set(id, padded);
  }

  const cleanRows = [HEADERS, ...byId.values()];
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: "PL_Brands!A:Z" });
  await sheets.spreadsheets.values.update({
    spreadsheetId, range: "PL_Brands!A1", valueInputOption: "RAW", requestBody: { values: cleanRows },
  });

  return Response.json({ repaired: true, recoveredBrands: [...byId.values()] });
}
