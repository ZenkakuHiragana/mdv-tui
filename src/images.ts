import { basename, extname, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { Image, getImageDimensions, Text, type Component } from "@earendil-works/pi-tui";
import sharp from "sharp";
import { imageTheme } from "./theme.js";
import { naturalImageLimits } from "./image-sizing.js";

const MIME_BY_EXTENSION: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
};

interface ImageData {
  bytes: Buffer;
  mimeType: string;
  filename: string;
}

function decodeDataUri(uri: string): ImageData {
  const match = uri.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/s);
  if (!match) {
    throw new Error("invalid data URI");
  }

  const mimeType = match[1] ?? "application/octet-stream";
  const payload = match[2] ?? "";
  const isBase64 = /^data:[^;,]+;base64,/s.test(uri);
  const bytes = isBase64
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");

  return { bytes, mimeType, filename: "embedded-image" };
}

async function readImage(source: string, documentPath: string): Promise<ImageData> {
  if (source.startsWith("data:")) {
    return decodeDataUri(source);
  }

  if (/^[a-z][a-z\d+.-]*:/i.test(source)) {
    throw new Error("remote image URLs are not supported");
  }

  const imagePath = resolve(documentPath, "..", source);
  return {
    bytes: await readFile(imagePath),
    mimeType: MIME_BY_EXTENSION[extname(imagePath).toLowerCase()] ?? "application/octet-stream",
    filename: basename(imagePath),
  };
}

export async function createImageComponent(source: string, documentPath: string, altText: string): Promise<Component> {
  try {
    let image = await readImage(source, documentPath);
    if (image.mimeType === "image/svg+xml" || image.mimeType === "image/avif") {
      image = {
        ...image,
        bytes: await sharp(image.bytes).png().toBuffer(),
        mimeType: "image/png",
      };
    }

    const base64 = image.bytes.toString("base64");
    const dimensions = getImageDimensions(base64, image.mimeType);
    const limits = dimensions && dimensions.widthPx <= 8 && dimensions.heightPx <= 8
      ? naturalImageLimits(dimensions)
      : { maxWidthCells: 100, maxHeightCells: 30 };
    return new Image(base64, image.mimeType, imageTheme, {
      ...limits,
      filename: image.filename,
    }, dimensions ?? undefined);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return new Text(`[画像を表示できない: ${altText || source}] ${reason}`, 1, 0);
  }
}
