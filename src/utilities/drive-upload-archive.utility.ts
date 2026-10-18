import {
  rejectUpload,
  getUploadType,
  assertUploadContent,
} from './drive-upload-policy.utility';

import { buf as crc32 } from 'crc-32';
import { fromBuffer, Entry, ZipFile } from 'yauzl';
import { ARCHIVE_LIMITS } from '@Constants/drive-upload.constant';
import { hasControlCharacters } from './control-characters.utility';
import { IDriveUploadType } from '@Interfaces/drive-upload-policy.interface';

interface IArchiveBudget {
  entries: number;
  expandedBytes: number;
}
const openArchive = (bytes: Buffer): Promise<ZipFile> =>
  new Promise((resolve, reject) => {
    fromBuffer(
      bytes,
      { lazyEntries: true, strictFileNames: true, validateEntrySizes: true },
      (error, zip) => {
        if (error || !zip) {
          reject(new Error('Invalid archive'));
          return;
        }
        resolve(zip);
      },
    );
  });
const nextEntry = (zip: ZipFile): Promise<Entry | null> =>
  new Promise((resolve, reject) => {
    const cleanup = () => {
      zip.off('entry', entry);
      zip.off('end', end);
      zip.off('error', error);
    };
    const entry = (value: Entry) => {
      cleanup();
      resolve(value);
    };
    const end = () => {
      cleanup();
      resolve(null);
    };
    const error = () => {
      cleanup();
      reject(new Error('Invalid archive'));
    };
    zip.once('entry', entry);
    zip.once('end', end);
    zip.once('error', error);
    zip.readEntry();
  });
const readEntry = (
  zip: ZipFile,
  entry: Entry,
  budget: IArchiveBudget,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(new Error('Unreadable archive entry'));
        return;
      }
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => {
        budget.expandedBytes += chunk.length;
        if (budget.expandedBytes > ARCHIVE_LIMITS.MAX_EXPANDED_BYTES) {
          stream.destroy(new Error('Archive expansion limit'));
          return;
        }
        chunks.push(chunk);
      });
      stream.once('error', reject);
      stream.once('end', () => resolve(Buffer.concat(chunks)));
    });
  });
const validateArchiveName = (name: string): string => {
  const segments = name.split('/');
  if (
    name.startsWith('/') ||
    name.includes('\\') ||
    segments.some((segment) => segment === '..' || segment === '.') ||
    hasControlCharacters(name) ||
    /[\u202a-\u202e\u2066-\u2069:]/.test(name)
  ) {
    return rejectUpload();
  }
  return segments.at(-1) ?? '';
};
const validateOfficeEntry = (name: string, bytes: Buffer): void => {
  const extension = name.split('.').at(-1)?.toLowerCase() ?? '';
  const allowed = [
    'xml',
    'rels',
    'png',
    'jpeg',
    'jpg',
    'gif',
    'bmp',
    'emf',
    'wmf',
    'ttf',
    'odttf',
  ];
  if (
    !allowed.includes(extension) ||
    /(?:vba|activex|embeddings|macros)/i.test(name)
  ) {
    rejectUpload();
  }
  if (['png', 'jpeg', 'jpg', 'gif', 'bmp'].includes(extension)) {
    assertUploadContent(
      getUploadType(name.split('/').at(-1) ?? '', bytes.length),
      bytes,
    );
  }
  if (['xml', 'rels'].includes(extension)) {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (
      !text.trimStart().startsWith('<') ||
      hasControlCharacters(text, [9, 10, 13])
    ) {
      rejectUpload();
    }
  }
  if (
    ['xml', 'rels'].includes(extension) &&
    /(?:macroEnabled|vbaProject|oleObject|<!(?:DOCTYPE|ENTITY))/i.test(
      bytes.toString('utf8'),
    )
  ) {
    rejectUpload();
  }
};
const inspectEntries = async (
  zip: ZipFile,
  type: IDriveUploadType,
  depth: number,
  budget: IArchiveBudget,
  seen: Set<string>,
): Promise<void> => {
  const entry = await nextEntry(zip);
  if (!entry) {
    return;
  }
  budget.entries += 1;
  const name = entry.fileName;
  const basename = validateArchiveName(name);
  const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
  const unsafeMode = mode !== 0 && mode !== 0x8000 && mode !== 0x4000;
  const tooLarge =
    entry.uncompressedSize > ARCHIVE_LIMITS.MAX_EXPANDED_BYTES ||
    entry.uncompressedSize >
      Math.max(entry.compressedSize, 1) * ARCHIVE_LIMITS.MAX_COMPRESSION_RATIO;
  if (
    unsafeMode ||
    budget.entries > ARCHIVE_LIMITS.MAX_ENTRIES ||
    tooLarge ||
    (entry.generalPurposeBitFlag & 1) !== 0 ||
    seen.has(name)
  ) {
    rejectUpload();
  }
  seen.add(name);
  if (!name.endsWith('/')) {
    const bytes = await readEntry(zip, entry, budget);
    if (crc32(bytes) >>> 0 !== entry.crc32) {
      rejectUpload();
    }
    if (type.kind === 'office') {
      validateOfficeEntry(name, bytes);
    }
    if (type.kind !== 'office') {
      await validateArchiveFile(basename, bytes, depth + 1, budget);
    }
    if (
      name === '[Content_Types].xml' &&
      type.contentType &&
      !bytes.toString('utf8').includes(type.contentType)
    ) {
      rejectUpload();
    }
  }
  await inspectEntries(zip, type, depth, budget, seen);
};
export const validateArchiveFile = async (
  name: string,
  bytes: Buffer,
  depth = 0,
  budget: IArchiveBudget = { entries: 0, expandedBytes: 0 },
): Promise<void> => {
  const type = getUploadType(name, bytes.length);
  assertUploadContent(type, bytes);
  const archive = type.kind === 'zip' || type.kind === 'office';
  if (!archive) {
    return;
  }
  if (depth > ARCHIVE_LIMITS.MAX_DEPTH) {
    rejectUpload();
  }
  const zip = await openArchive(bytes);
  const seen = new Set<string>();
  try {
    await inspectEntries(zip, type, depth, budget, seen);
    if (
      seen.size === 0 ||
      (type.kind === 'office' &&
        (!seen.has('[Content_Types].xml') ||
          !seen.has(type.requiredEntry ?? '')))
    ) {
      rejectUpload();
    }
  } finally {
    zip.close();
  }
};
