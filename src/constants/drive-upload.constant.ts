import { IDriveUploadPolicy } from '@Interfaces/drive-upload-policy.interface';
import { UPLOAD_LIMITS } from '@Modules/project-drive/constants/project-drive.constant';

const office = (
  directory: string,
  entry: string,
  mimeType: string,
  contentType: string,
) => ({
  kind: 'office' as const,
  mimeType,
  signatures: [[80, 75, 3, 4]],
  requiredEntry: `${directory}/${entry}.xml`,
  contentType,
});
export const DRIVE_UPLOAD_POLICY: IDriveUploadPolicy = {
  maxFiles: UPLOAD_LIMITS.MAX_FILES,
  maxFileSizeBytes: UPLOAD_LIMITS.MAX_FILE_SIZE_BYTES,
  maxArchiveSizeBytes: 50 * 1024 * 1024,
  maxTextSizeBytes: 10 * 1024 * 1024,
  blockedNamePattern: String.raw`[\\/:\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]|(?:^|\.)(?:exe|dll|com|scr|msi|msp|bat|cmd|ps1|psm1|sh|bash|zsh|js|mjs|cjs|jsx|ts|tsx|vbs|vbe|wsf|wsh|hta|html|htm|svg|jar|class|apk|app|deb|rpm|dmg|iso|lnk|url|reg|py|pyc|rb|php|pl|ps|eps|docm|xlsm|pptm|dotm|xlam)(?:\.|$)`,
  types: {
    pdf: {
      kind: 'binary',
      mimeType: 'application/pdf',
      signatures: [[37, 80, 68, 70, 45]],
    },
    png: {
      kind: 'binary',
      mimeType: 'image/png',
      signatures: [[137, 80, 78, 71, 13, 10, 26, 10]],
    },
    jpg: {
      kind: 'binary',
      mimeType: 'image/jpeg',
      signatures: [[255, 216, 255]],
    },
    jpeg: {
      kind: 'binary',
      mimeType: 'image/jpeg',
      signatures: [[255, 216, 255]],
    },
    gif: {
      kind: 'binary',
      mimeType: 'image/gif',
      signatures: [
        [71, 73, 70, 56, 55, 97],
        [71, 73, 70, 56, 57, 97],
      ],
    },
    webp: {
      kind: 'binary',
      mimeType: 'image/webp',
      signatures: [[82, 73, 70, 70]],
    },
    tif: {
      kind: 'binary',
      mimeType: 'image/tiff',
      signatures: [
        [73, 73, 42, 0],
        [77, 77, 0, 42],
      ],
    },
    tiff: {
      kind: 'binary',
      mimeType: 'image/tiff',
      signatures: [
        [73, 73, 42, 0],
        [77, 77, 0, 42],
      ],
    },
    bmp: { kind: 'binary', mimeType: 'image/bmp', signatures: [[66, 77]] },
    txt: { kind: 'text', mimeType: 'text/plain', signatures: [] },
    csv: { kind: 'text', mimeType: 'text/csv', signatures: [] },
    dwg: {
      kind: 'binary',
      mimeType: 'image/vnd.dwg',
      signatures: [[65, 67, 49, 48]],
    },
    dxf: { kind: 'dxf', mimeType: 'image/vnd.dxf', signatures: [] },
    zip: {
      kind: 'zip',
      mimeType: 'application/zip',
      signatures: [[80, 75, 3, 4]],
    },
    docx: office(
      'word',
      'document',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
    ),
    xlsx: office(
      'xl',
      'workbook',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
    ),
    pptx: office(
      'ppt',
      'presentation',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
    ),
  },
};
export const ARCHIVE_LIMITS = {
  MAX_DEPTH: 3,
  MAX_ENTRIES: 1000,
  MAX_EXPANDED_BYTES: 100 * 1024 * 1024,
  MAX_COMPRESSION_RATIO: 100,
};
export const UPLOAD_REJECTION_MESSAGE =
  'Upload rejected: use supported documents, images, CAD files or ZIP archives without executable, script, macro or encrypted content.';
