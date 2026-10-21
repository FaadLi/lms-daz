export async function optimizeUpload(
  file: File,
  kind: "profile" | "avatar" | "photo",
): Promise<File> {
  const bytes = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer());
  const mime =
    bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      ? "image/jpeg"
      : bytes[0] === 137 &&
          new TextDecoder().decode(bytes.slice(1, 4)) === "PNG"
        ? "image/png"
        : new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
            new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
          ? "image/webp"
          : null;
  if (mime !== file.type)
    throw new Error("Isi file tidak cocok dengan format gambar.");
  // Keep animated images intact. Existing objects are never rewritten.
  const header = new TextDecoder("latin1").decode(bytes);
  if (
    /ANIM|acTL/.test(header) ||
    typeof createImageBitmap === "undefined" ||
    typeof document === "undefined"
  )
    return file;
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    if (bitmap.width * bitmap.height > 40_000_000)
      throw new Error(
        "Resolusi gambar terlalu besar. Gunakan gambar maksimal 40 megapiksel.",
      );
    const max = kind === "photo" ? 1600 : 320;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.82),
    );
    if (
      !blob ||
      !["image/webp", "image/jpeg", "image/png"].includes(blob.type) ||
      blob.size >= file.size
    )
      return file;
    const suffix =
      blob.type === "image/webp"
        ? "webp"
        : blob.type === "image/jpeg"
          ? "jpg"
          : "png";
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.${suffix}`, {
      type: blob.type,
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close();
  }
}
