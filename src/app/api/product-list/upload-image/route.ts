import { google } from "googleapis";
import { Readable } from "stream";

// Must be a folder owned by a real Google account (not the service account
// itself), shared with the service account as Editor — service accounts have
// zero storage quota of their own, so uploads need a human-owned folder to
// draw quota from.
const FOLDER_ID = "1gVsgPeafXu_W0ycAyLa1-glAEL8xBQcu";

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.replace(/^["']|["']$/g, ""),
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/^["']|["']$/g, "").replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { filename: string; mimeType: string; base64: string };
    if (!body.base64 || !body.filename) return Response.json({ error: "Missing data" }, { status: 400 });

    const drive = google.drive({ version: "v3", auth: getAuth() });
    const buffer = Buffer.from(body.base64, "base64");
    const stream = Readable.from(buffer);

    const res = await drive.files.create({
      requestBody: { name: body.filename, parents: [FOLDER_ID] },
      media: { mimeType: body.mimeType, body: stream },
      fields: "id, webViewLink",
    });

    const fileId = res.data.id;
    if (!fileId) throw new Error("Upload failed");

    await drive.permissions.create({ fileId, requestBody: { role: "reader", type: "anyone" } });

    // Return thumbnail URL (lightweight, cached by Google)
    const thumbnailUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`;
    const fullUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;

    return Response.json({ thumbnailUrl, fullUrl, fileId });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
