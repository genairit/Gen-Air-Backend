import {
  DRIVE_UPLOAD_POLICY,
  UPLOAD_REJECTION_MESSAGE,
} from '@Constants/drive-upload.constant';

import { BadRequestException } from '@nestjs/common';
import { hasControlCharacters } from './control-characters.utility';
import { IDriveUploadType } from '@Interfaces/drive-upload-policy.interface';

export const rejectUpload = (): never => {
  throw new BadRequestException(UPLOAD_REJECTION_MESSAGE);
};
export const getUploadType = (name: string, size: number): IDriveUploadType => {
  const extension = name.split('.').at(-1)?.toLowerCase() ?? '';
  const validName =
    name.length > 0 &&
    name.length <= 255 &&
    name === name.trim() &&
    !new RegExp(DRIVE_UPLOAD_POLICY.blockedNamePattern, 'i').test(name);
  const type = Object.hasOwn(DRIVE_UPLOAD_POLICY.types, extension)
    ? DRIVE_UPLOAD_POLICY.types[extension]
    : null;
  if (
    !validName ||
    !type ||
    size <= 0 ||
    size > DRIVE_UPLOAD_POLICY.maxFileSizeBytes
  ) {
    return rejectUpload();
  }
  const isArchive = type.kind === 'zip' || type.kind === 'office';
  if (isArchive && size > DRIVE_UPLOAD_POLICY.maxArchiveSizeBytes) {
    return rejectUpload();
  }
  const isText = type.kind === 'text' || type.kind === 'dxf';
  if (isText && size > DRIVE_UPLOAD_POLICY.maxTextSizeBytes) {
    return rejectUpload();
  }
  return type;
};
export const assertUploadContent = (
  type: IDriveUploadType,
  bytes: Uint8Array,
): void => {
  const signatureMatches = type.signatures.some((signature) =>
    signature.every((byte, index) => bytes[index] === byte),
  );
  const textKind = type.kind === 'text' || type.kind === 'dxf';
  if (!textKind && !signatureMatches) {
    rejectUpload();
  }
  if (
    type.mimeType === 'image/webp' &&
    Buffer.from(bytes.subarray(8, 12)).toString() !== 'WEBP'
  ) {
    rejectUpload();
  }
  if (
    type.mimeType === 'image/vnd.dwg' &&
    !/^AC10\d{2}/.test(Buffer.from(bytes.subarray(0, 6)).toString())
  ) {
    rejectUpload();
  }
  if (!textKind) {
    return;
  }
  const binaryDxf =
    Buffer.from(bytes.subarray(0, 22)).toString() ===
    'AutoCAD Binary DXF\r\n\x1a\0';
  if (type.kind === 'dxf' && binaryDxf) {
    return;
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const hasBinaryControls = hasControlCharacters(text, [9, 10, 13]);
    if (
      hasBinaryControls ||
      (type.kind === 'dxf' && !/^\s*0\s+SECTION\s*$/im.test(text))
    ) {
      rejectUpload();
    }
  } catch {
    rejectUpload();
  }
};
