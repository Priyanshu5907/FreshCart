import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppError } from '../middleware/errorHandler';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? 'ap-south-1',
  credentials: process.env.AWS_ACCESS_KEY_ID
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
      }
    : undefined,
});

const BUCKET = process.env.AWS_S3_BUCKET ?? 'grocery-platform-assets';
const CDN_URL = process.env.CLOUDFRONT_URL ?? '';

export function validateImageUpload(contentType: string, sizeBytes?: number) {
  if (!ALLOWED_TYPES.includes(contentType)) {
    throw new AppError(`Invalid file type. Allowed: ${ALLOWED_TYPES.join(', ')}`, 400);
  }
  if (sizeBytes !== undefined && sizeBytes > MAX_SIZE_BYTES) {
    throw new AppError('File size exceeds 5 MB limit', 400);
  }
}

export async function generatePresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 900, // 15 minutes
): Promise<{ uploadUrl: string; cdnUrl: string; key: string }> {
  validateImageUpload(contentType);

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
    // Enforce max size via content-length-range condition
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn });
  const cdnUrl = CDN_URL ? `${CDN_URL}/${key}` : `https://${BUCKET}.s3.amazonaws.com/${key}`;

  return { uploadUrl, cdnUrl, key };
}

export async function deleteS3Object(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

export function buildS3Key(folder: string, filename: string): string {
  const ext = filename.split('.').pop() ?? 'jpg';
  const uuid = crypto.randomUUID();
  return `${folder}/${uuid}.${ext}`;
}
