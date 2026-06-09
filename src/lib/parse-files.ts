/**
 * File text extraction — handles PDF, Excel, CSV, and plain text.
 * Image files (PNG/JPG) return a note about OCR since we don't
 * have an OCR engine bundled — Claude handles image understanding.
 */

import * as XLSX from "xlsx";

/**
 * Extract readable text from a file buffer based on its filename extension.
 */
export async function extractText(buffer: Buffer, fileName: string): Promise<string> {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";

  switch (ext) {
    case "csv":
      return buffer.toString("utf-8");

    case "xlsx":
    case "xls":
      return extractExcel(buffer);

    case "pdf":
      return await extractPDF(buffer);

    case "png":
    case "jpg":
    case "jpeg":
      return `[Scanned image: ${fileName}] — Image uploaded. The AI agent will analyze this visually. If text extraction is limited, please also provide the data in CSV or Excel format for best results.`;

    case "txt":
      return buffer.toString("utf-8");

    default:
      return buffer.toString("utf-8");
  }
}

/**
 * Extract text from Excel files — reads all sheets and converts to
 * tab-separated text with headers.
 */
function extractExcel(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const parts: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
    }) as string[][];

    if (rows.length === 0) continue;

    parts.push(`--- Sheet: ${sheetName} ---`);
    for (const row of rows) {
      parts.push(row.map((cell) => String(cell ?? "").trim()).join("\t"));
    }
    parts.push("");
  }

  return parts.join("\n");
}

/**
 * Extract text from PDF files using pdf-parse.
 * Falls back gracefully if the PDF is scanned (image-only).
 */
async function extractPDF(buffer: Buffer): Promise<string> {
  try {
    // Dynamic import to avoid issues if pdf-parse has native deps
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(buffer);
    const text = data.text?.trim();

    if (!text || text.length < 20) {
      return "[PDF appears to be scanned/image-only. Limited text extracted. The AI agent will work with available data. For better results, also upload an Excel or CSV version.]";
    }

    return text;
  } catch (e) {
    console.warn("PDF parse failed:", e);
    return "[PDF could not be parsed. It may be encrypted or image-only. Please provide an Excel or CSV version for best results.]";
  }
}
