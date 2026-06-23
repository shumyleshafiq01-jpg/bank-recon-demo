import { google } from "googleapis";
import { Readable } from "stream";

const DRIVE_FOLDER_ID = "1VHTt3qaJNXlpIh7rHqjVS_ZEZFman7BV";

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.replace(/^["']|["']$/g, ""),
      private_key: process.env.GOOGLE_PRIVATE_KEY
        ?.replace(/^["']|["']$/g, "")
        .replace(/\\n/g, "\n"),
    },
    scopes: [
      "https://www.googleapis.com/auth/drive.file",
    ],
  });
}

export async function uploadToDrive(
  filename: string,
  mimeType: string,
  base64Content: string
): Promise<string> {
  const drive = google.drive({ version: "v3", auth: getAuth() });

  // Upload file
  const buffer = Buffer.from(base64Content, "base64");
  const stream = Readable.from(buffer);

  const res = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [DRIVE_FOLDER_ID],
    },
    media: {
      mimeType,
      body: stream,
    },
    fields: "id, webViewLink",
  });

  const fileId = res.data.id;
  if (!fileId) throw new Error("Drive upload failed — no file ID returned");

  // Make it accessible to anyone with the link
  await drive.permissions.create({
    fileId,
    requestBody: {
      role: "reader",
      type: "anyone",
    },
  });

  return res.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`;
}
