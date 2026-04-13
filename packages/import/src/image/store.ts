import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_WIDTH = 1200;

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "us-east-1",
});

function getBucket(): string {
  const bucket = process.env.RECIPE_IMAGES_BUCKET;
  if (!bucket) {
    throw new Error(
      "RECIPE_IMAGES_BUCKET env var is required for image storage",
    );
  }
  return bucket;
}

/**
 * Map Content-Type to file extension.
 */
function extensionForContentType(contentType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
  };
  return map[contentType] || "jpg";
}

/**
 * Attempt to resize an image using sharp (included with Next.js).
 * Falls back to the original buffer if sharp is not available.
 */
async function resizeIfNeeded(
  buffer: Buffer,
  contentType: string,
): Promise<{ data: Buffer; contentType: string }> {
  try {
    // Dynamic import — sharp is available via Next.js but not always installed standalone
    const sharp = (await import("sharp")).default;
    const image = sharp(buffer);
    const metadata = await image.metadata();

    if (metadata.width && metadata.width > MAX_WIDTH) {
      const resized = await image
        .resize(MAX_WIDTH, null, { withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      return { data: resized, contentType: "image/jpeg" };
    }

    return { data: buffer, contentType };
  } catch {
    // sharp not available — return as-is
    return { data: buffer, contentType };
  }
}

/**
 * Download an image from a URL, optionally resize, and upload to S3.
 * Returns the S3 URL of the stored image.
 *
 * Returns undefined if the download fails or the URL is not an image.
 */
export async function storeImage(
  imageUrl: string,
): Promise<string | undefined> {
  const bucket = getBucket();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "image/*",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    if (!response.ok) return undefined;

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) return undefined;

    const arrayBuffer = await response.arrayBuffer();
    const rawBuffer = Buffer.from(arrayBuffer);

    // Resize if too large
    const { data, contentType: finalType } = await resizeIfNeeded(
      rawBuffer,
      contentType,
    );

    const ext = extensionForContentType(finalType);
    const key = `recipes/${randomUUID()}.${ext}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: data,
        ContentType: finalType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );

    return `https://${bucket}.s3.amazonaws.com/${key}`;
  } catch {
    // Network error, timeout, or S3 error — don't fail the import
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}
