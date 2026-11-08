import "server-only"
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3"

// Object storage for parsed-markdown blobs — any S3-compatible store; the
// Kubernetes deployment uses h3llo S3 (Ceph Object Gateway,
// `https://storage.h3llo.cloud`). The endpoint carries no bucket name, so the
// bucket comes from its own variable and is addressed path-style
// (`<endpoint>/<bucket>/<key>`).
const endpoint = process.env.S3_ENDPOINT
const accessKeyId = process.env.S3_ACCESS_KEY_ID
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY
const bucketName = process.env.S3_BUCKET
// Ceph doesn't check the region in the signature; "us-east-1" is the
// conventional placeholder. A store that does care names the expected
// region in its `AuthorizationHeaderMalformed` error — set S3_REGION to it.
const region = process.env.S3_REGION || "us-east-1"

let cachedClient: S3Client | null = null

function getClient(): S3Client {
  if (cachedClient) return cachedClient
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Object storage not configured: set S3_ENDPOINT, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.",
    )
  }
  cachedClient = new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
    // SDK ≥ 3.729 adds CRC32 checksums to every request by default; not
    // every S3-compatible store accepts them. Only send / validate checksums
    // where the operation requires one (DeleteObjects).
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  })
  return cachedClient
}

export async function putMarkdown(
  key: string,
  markdown: string,
): Promise<{ key: string; sizeBytes: number }> {
  if (!bucketName) throw new Error("S3_BUCKET is not configured")
  const body = new TextEncoder().encode(markdown)
  await getClient().send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: body,
      ContentType: "text/markdown; charset=utf-8",
    }),
  )
  return { key, sizeBytes: body.byteLength }
}

// Batch-delete objects by key. Used by the admin source-teardown tool to
// remove the parsed-markdown blobs of the items it hard-deletes. S3's
// DeleteObjects caps at 1000 keys per call, so we chunk. Idempotent: deleting
// a missing key is a no-op (S3 returns success for absent keys). Empty input
// short-circuits. Returns the count of keys requested for deletion.
export async function deleteObjects(keys: string[]): Promise<number> {
  const cleaned = keys.filter((k) => typeof k === "string" && k.length > 0)
  if (cleaned.length === 0) return 0
  if (!bucketName) throw new Error("S3_BUCKET is not configured")
  const client = getClient()
  for (let i = 0; i < cleaned.length; i += 1000) {
    const chunk = cleaned.slice(i, i + 1000)
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
      }),
    )
  }
  return cleaned.length
}

export async function getMarkdown(key: string): Promise<string> {
  if (!bucketName) throw new Error("S3_BUCKET is not configured")
  const res = await getClient().send(
    new GetObjectCommand({ Bucket: bucketName, Key: key }),
  )
  if (!res.Body) throw new Error(`Storage object empty: ${key}`)
  // The S3 SDK's `Body` exposes a `.transformToString()` helper that
  // handles both Node Readable and web ReadableStream variants.
  return await res.Body.transformToString("utf-8")
}
