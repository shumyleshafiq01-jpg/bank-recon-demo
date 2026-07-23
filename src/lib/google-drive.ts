import { google } from "googleapis";
import { Readable } from "stream";

const DRIVE_FOLDER_ID = "1VHTt3qaJNXlpIh7rHqjVS_ZEZFman7BV";

// Export Department shipment folders need to see files the ACCOUNTANT
// uploads (not just files this app created), so this needs the broader
// `drive` scope rather than `drive.file` — drive.file restricts visibility
// to app-created/app-opened files only, which would make scanning a
// shared folder for new uploads from other people impossible.
function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.replace(/^["']|["']$/g, ""),
      private_key: process.env.GOOGLE_PRIVATE_KEY
        ?.replace(/^["']|["']$/g, "")
        .replace(/\\n/g, "\n"),
    },
    scopes: [
      "https://www.googleapis.com/auth/drive",
    ],
  });
}

let exportRootFolderId: string | null = null;
const EXPORT_ROOT_FOLDER_NAME = "Kafi Export Shipments";

async function getOrCreateExportRootFolder(): Promise<string> {
  if (exportRootFolderId) return exportRootFolderId;
  const drive = google.drive({ version: "v3", auth: getAuth() });
  const found = await drive.files.list({
    q: `name='${EXPORT_ROOT_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id)",
  });
  if (found.data.files?.[0]?.id) {
    exportRootFolderId = found.data.files[0].id;
    return exportRootFolderId;
  }
  const created = await drive.files.create({
    requestBody: { name: EXPORT_ROOT_FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" },
    fields: "id",
  });
  if (!created.data.id) throw new Error("Could not create export root folder");
  exportRootFolderId = created.data.id;
  return exportRootFolderId;
}

/** Creates a per-shipment subfolder under the shared export root. */
export async function createShipmentFolder(shipmentLabel: string): Promise<{ folderId: string; link: string }> {
  const drive = google.drive({ version: "v3", auth: getAuth() });
  const root = await getOrCreateExportRootFolder();
  const res = await drive.files.create({
    requestBody: { name: shipmentLabel, mimeType: "application/vnd.google-apps.folder", parents: [root] },
    fields: "id, webViewLink",
  });
  if (!res.data.id) throw new Error("Could not create shipment folder");
  return { folderId: res.data.id, link: res.data.webViewLink ?? `https://drive.google.com/drive/folders/${res.data.id}` };
}

/** Shares a shipment folder with the accountant so they can upload into it. */
export async function shareFolderWithEmail(folderId: string, email: string): Promise<void> {
  const drive = google.drive({ version: "v3", auth: getAuth() });
  await drive.permissions.create({
    fileId: folderId,
    sendNotificationEmail: true,
    requestBody: { role: "writer", type: "user", emailAddress: email },
  });
}

export interface DriveFileInfo {
  id: string; name: string; mimeType: string; createdTime: string; webViewLink: string;
}

/** Lists non-folder files sitting in a shipment folder. */
export async function listFolderFiles(folderId: string): Promise<DriveFileInfo[]> {
  const drive = google.drive({ version: "v3", auth: getAuth() });
  const res = await drive.files.list({
    q: `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id, name, mimeType, createdTime, webViewLink)",
    orderBy: "createdTime desc",
    pageSize: 100,
  });
  return (res.data.files ?? []).map(f => ({
    id: f.id!, name: f.name ?? "", mimeType: f.mimeType ?? "", createdTime: f.createdTime ?? "", webViewLink: f.webViewLink ?? "",
  }));
}

/** Downloads a file's raw bytes as base64, for feeding to the AI reader. */
export async function downloadFileAsBase64(fileId: string): Promise<string> {
  const drive = google.drive({ version: "v3", auth: getAuth() });
  const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
  return Buffer.from(res.data as ArrayBuffer).toString("base64");
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
