import { put } from "@vercel/blob";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { filename: string; mimeType: string; base64: string };
    if (!body.base64 || !body.filename) return Response.json({ error: "Missing data" }, { status: 400 });

    const buffer = Buffer.from(body.base64, "base64");
    // addRandomSuffix avoids collisions between products/brands uploading files with the same name.
    const blob = await put(body.filename, buffer, {
      access: "public",
      contentType: body.mimeType,
      addRandomSuffix: true,
    });

    // Kept as both fields for compatibility with existing client code, which
    // only reads thumbnailUrl — Vercel Blob URLs serve the full image directly.
    return Response.json({ thumbnailUrl: blob.url, fullUrl: blob.url });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
