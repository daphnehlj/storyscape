import { mkdir, writeFile } from 'node:fs/promises';
import { DRAWING_MAX_BYTES, DRAWING_MIME_TYPES } from '@app/shared';
import { UPLOADS_DIR } from './config.js';

export class BadDrawingError extends Error {}

export interface Drawing {
  // What the model sees, and what the moderation endpoint checks.
  dataUrl: string;
  // Where B can fetch the original to show beside the world.
  url: string;
}

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const MAGIC: [string, number[]][] = [
  ['image/png', [0x89, 0x50, 0x4e, 0x47]],
  ['image/jpeg', [0xff, 0xd8, 0xff]],
  ['image/gif', [0x47, 0x49, 0x46, 0x38]],
  // WEBP is "RIFF....WEBP"; the first four bytes are enough to tell it apart.
  ['image/webp', [0x52, 0x49, 0x46, 0x46]],
];

function sniffType(bytes: Buffer): string | undefined {
  return MAGIC.find(([, magic]) => magic.every((byte, i) => bytes[i] === byte))?.[0];
}

export async function saveDrawing(file: File, worldId: string): Promise<Drawing> {
  return saveDrawingBytes(Buffer.from(await file.arrayBuffer()), worldId);
}

export async function saveDrawingBytes(bytes: Buffer, worldId: string): Promise<Drawing> {
  if (bytes.length === 0) throw new BadDrawingError('The drawing is empty.');
  if (bytes.length > DRAWING_MAX_BYTES) {
    throw new BadDrawingError(`That image is too big — keep it under ${DRAWING_MAX_BYTES / 1024 / 1024}MB.`);
  }

  // The declared content type is ignored: browsers guess it from the file extension.
  const type = sniffType(bytes);
  if (!type || !DRAWING_MIME_TYPES.includes(type as (typeof DRAWING_MIME_TYPES)[number])) {
    throw new BadDrawingError('Send a PNG, JPEG, WEBP or GIF image.');
  }

  const name = `${worldId}.${EXTENSIONS[type]}`;
  await mkdir(UPLOADS_DIR, { recursive: true });
  await writeFile(`${UPLOADS_DIR}/${name}`, bytes);
  return { dataUrl: `data:${type};base64,${bytes.toString('base64')}`, url: `/uploads/${name}` };
}
