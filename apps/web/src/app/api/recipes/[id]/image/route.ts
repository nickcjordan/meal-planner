import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getRecipe, updateRecipe } from "@meal-planner/db";
import type { Readable } from "stream";

const BUCKET = "meal-planner-images-njordan";
const s3 = new S3Client({});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recipe = await getRecipe(id);
  if (!recipe?.imageUrl) {
    return new Response(null, { status: 404 });
  }

  const isS3 = recipe.imageUrl.includes(`.s3.amazonaws.com/`) || recipe.imageUrl.includes(`s3.us-east-1.amazonaws.com/`);

  if (isS3) {
    const url = new URL(recipe.imageUrl);
    const key = url.pathname.slice(1);
    const result = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const stream = result.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return new Response(Buffer.concat(chunks), {
      headers: {
        "Content-Type": result.ContentType ?? "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  // External URL — proxy it through the server
  const response = await fetch(recipe.imageUrl, {
    headers: { Accept: "image/*" },
  });
  if (!response.ok) return new Response(null, { status: 502 });
  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const data = await response.arrayBuffer();
  return new Response(data, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const recipe = await getRecipe(id);
  if (!recipe) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("image") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }

  const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!validTypes.includes(file.type)) {
    return NextResponse.json({ error: "Invalid image type" }, { status: 400 });
  }

  const ext = file.type.split("/")[1].replace("jpeg", "jpg");
  const key = `recipes/${id}.${ext}`;
  const bytes = await file.arrayBuffer();

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: Buffer.from(bytes),
      ContentType: file.type,
    }),
  );

  const imageUrl = `https://${BUCKET}.s3.amazonaws.com/${key}`;
  await updateRecipe(id, { imageUrl });

  return NextResponse.json({ imageUrl });
}
