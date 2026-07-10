// Client-side image compression. Phone photos are often 3-8 MB; uploading them
// as-is (base64-inflated by ~33%) is what makes image upload hang. We downscale
// to a sane max dimension and re-encode as JPEG in the browser BEFORE upload, so
// the file that actually goes over the wire is ~10-20x smaller.
//
// Browser-only (uses <canvas> / createImageBitmap). Safe to call on any File —
// non-images, or files where compression wouldn't help, are returned untouched.
export async function compressImage(file: File, maxDim = 1600, quality = 0.8): Promise<File> {
  try {
    if (typeof document === "undefined") return file;
    if (!file.type.startsWith("image/")) return file;
    // Animated GIFs would lose their animation if canvas-flattened — leave them.
    if (file.type === "image/gif") return file;

    const bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) return file;

    let { width, height } = bitmap;
    const longest = Math.max(width, height);
    if (longest > maxDim) {
      const scale = maxDim / longest;
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file; // no gain — keep the original

    const name = file.name.replace(/\.(png|webp|bmp|heic|heif|jpeg|jpg)$/i, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file; // never block an upload because compression failed
  }
}
