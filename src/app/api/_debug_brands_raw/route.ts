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
