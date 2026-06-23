import { uploadToDrive } from "@/lib/google-drive";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      filename: string;
      mimeType: string;
      base64: string;
    };

    if (!body.base64 || !body.filename) {
      return Response.json({ error: "Missing filename or content" }, { status: 400 });
    }

    const link = await uploadToDrive(body.filename, body.mimeType, body.base64);
    return Response.json({ link });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
