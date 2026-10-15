import {
  rejectUpload,
  getUploadType,
  assertUploadContent,
} from './drive-upload-policy.utility';

import { open, readFile, stat } from 'node:fs/promises';
import { decodeUploadedFileName } from './upload.utility';
import { validateArchiveFile } from './drive-upload-archive.utility';
import { DRIVE_UPLOAD_POLICY } from '@Constants/drive-upload.constant';

const validateFile = async (file: Express.Multer.File): Promise<string> => {
  const name = decodeUploadedFileName(file.originalname);
  const info = await stat(file.path);
  const type = getUploadType(name, info.size);
  if (type.kind !== 'binary') {
    await validateArchiveFile(name, await readFile(file.path));
    return type.mimeType;
  }
  const handle = await open(file.path, 'r');
  try {
    const buffer = Buffer.alloc(Math.min(info.size, 8192));
    await handle.read(buffer, 0, buffer.length, 0);
    assertUploadContent(type, buffer);
    return type.mimeType;
  } finally {
    await handle.close();
  }
};
export const validateDriveUploads = async (
  files: Express.Multer.File[],
): Promise<string[]> => {
  if (files.length === 0 || files.length > DRIVE_UPLOAD_POLICY.maxFiles) {
    rejectUpload();
  }
  const mimeTypes: string[] = [];
  for (const file of files) {
    try {
      mimeTypes.push(await validateFile(file));
    } catch {
      rejectUpload();
    }
  }
  return mimeTypes;
};
