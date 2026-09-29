/**
 * Turn whatever an admin picked — phone photos, a HEIC off an iPhone, a scan,
 * a PDF — into pages small enough to send. Browser only.
 *
 * Photos are re-encoded as JPEG at most 2000 px on the long edge. That keeps a
 * 12 MP phone photo around 400 KB, far inside Vercel's 4.5 MB request limit
 * for several pages, while leaving printed form text sharp: the model reads
 * up to 2576 px, and a letter page at 2000 px is ~180 dpi.
 */

export type PreparedPage = {
  id: string;
  name: string;
  mediaType: 'image/jpeg' | 'application/pdf';
  base64: string;
  /** Object URL for the thumbnail. PDFs have none. */
  previewUrl: string | null;
  bytes: number;
};

const LONG_EDGE = 2000;
const JPEG_QUALITY = 0.85;
/** A PDF goes as-is so the model can read its text layer; past this, ask for photos. */
export const MAX_PDF_BYTES = 3 * 1024 * 1024;
/** Stay under the server's cap with room for JSON framing. */
export const MAX_TOTAL_BASE64 = 4_000_000;

export class PageError extends Error {}

function isHeic(file: File): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

async function decode(blob: Blob): Promise<ImageBitmap> {
  // EXIF orientation applied, so a sideways phone photo arrives upright.
  return createImageBitmap(blob, { imageOrientation: 'from-image' });
}

async function toBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await decode(file);
  } catch {
    if (!isHeic(file)) {
      throw new PageError(`"${file.name}" is not a photo this phone can open. Try taking the photo again.`);
    }
  }
  // Safari opens HEIC itself; other browsers need converting first. Loaded only
  // when needed — it is a large library and most uploads never touch it.
  try {
    const { default: heic2any } = await import('heic2any');
    const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
    return await decode(Array.isArray(converted) ? converted[0] : converted);
  } catch {
    throw new PageError(
      `"${file.name}" is an iPhone HEIC photo this browser cannot open. Use "Take a photo" instead, or export it as JPEG.`
    );
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

let counter = 0;
const nextId = () => `p${Date.now().toString(36)}${(counter++).toString(36)}`;

export async function preparePage(file: File): Promise<PreparedPage> {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    if (file.size > MAX_PDF_BYTES) {
      throw new PageError(
        `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB — too big to send. Take a photo of each page instead.`
      );
    }
    return {
      id: nextId(),
      name: file.name,
      mediaType: 'application/pdf',
      base64: await blobToBase64(file),
      previewUrl: null,
      bytes: file.size
    };
  }

  const bitmap = await toBitmap(file);
  const scale = Math.min(1, LONG_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PageError('This browser cannot prepare photos. Try another browser.');
  // White under any transparency, so a PNG scan does not turn black as JPEG.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new PageError('Could not prepare that photo.'))), 'image/jpeg', JPEG_QUALITY)
  );

  return {
    id: nextId(),
    name: file.name || 'Photo',
    mediaType: 'image/jpeg',
    base64: await blobToBase64(blob),
    previewUrl: URL.createObjectURL(blob),
    bytes: blob.size
  };
}
