import {
  getUploadType,
  assertUploadContent,
} from './drive-upload-policy.utility';

import {
  ARCHIVE_LIMITS,
  DRIVE_UPLOAD_POLICY,
} from '@Constants/drive-upload.constant';

import { BadRequestException } from '@nestjs/common';
import { zipFixture } from '../../test/helpers/zip-fixture';
import { validateArchiveFile } from './drive-upload-archive.utility';

const pdf = Buffer.from('%PDF-1.7\nexample\n%%EOF');
const office = (extension: string) => {
  const type = DRIVE_UPLOAD_POLICY.types[extension];
  return zipFixture([
    {
      name: '[Content_Types].xml',
      bytes: Buffer.from(`<Types>${type.contentType}</Types>`),
    },
    { name: type.requiredEntry ?? '', bytes: Buffer.from('<document/>') },
  ]);
};
describe('Drive upload content validation', () => {
  it.each([
    'exe',
    'sh',
    'js',
    'svg',
    'html',
    'docm',
    'xlsm',
    'pptm',
    'unknown',
  ])('rejects .%s uploads', (extension) => {
    expect(() => getUploadType(`plan.${extension}`, 10)).toThrow(
      BadRequestException,
    );
  });
  it.each([
    'report.exe.pdf',
    '../plan.pdf',
    'a\\b.pdf',
    'a.pdf ',
    'a:stream.pdf',
    'a\u202epdf.exe',
  ])('rejects unsafe names %s', (name) => {
    expect(() => getUploadType(name, 10)).toThrow(BadRequestException);
  });
  it('rejects zero, oversized, overlarge text/archive and prototype-name extensions', () => {
    for (const [name, size] of [
      ['a.pdf', 0],
      ['a.pdf', DRIVE_UPLOAD_POLICY.maxFileSizeBytes + 1],
      ['a.txt', DRIVE_UPLOAD_POLICY.maxTextSizeBytes + 1],
      ['a.zip', DRIVE_UPLOAD_POLICY.maxArchiveSizeBytes + 1],
      ['a.constructor', 10],
    ] as const) {
      expect(() => getUploadType(name, size)).toThrow();
    }
  });
  it('rejects a renamed executable even if the declared MIME and extension claim PDF', async () => {
    await expect(
      validateArchiveFile('plan.pdf', Buffer.from('MZ executable')),
    ).rejects.toThrow(BadRequestException);
  });
  it.each(['pdf', 'png', 'jpg', 'gif', 'webp', 'tif', 'bmp', 'dwg'])(
    'recognizes supported .%s signatures',
    (extension) => {
      const type = DRIVE_UPLOAD_POLICY.types[extension];
      const bytes = Buffer.concat([
        Buffer.from(type.signatures[0]),
        Buffer.alloc(40),
      ]);
      if (extension === 'webp') {
        bytes.write('WEBP', 8);
      }
      if (extension === 'dwg') {
        bytes.write('AC1032', 0);
      }
      expect(() => assertUploadContent(type, bytes)).not.toThrow();
    },
  );
  it('accepts Unicode text and ASCII/binary DXF, rejects binary disguised as text and invalid DXF', async () => {
    await expect(
      validateArchiveFile('notes.txt', Buffer.from('תוכנית לפרויקט')),
    ).resolves.toBeUndefined();
    await expect(
      validateArchiveFile(
        'plan.dxf',
        Buffer.from('0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nEOF'),
      ),
    ).resolves.toBeUndefined();
    await expect(
      validateArchiveFile(
        'plan.dxf',
        Buffer.concat([
          Buffer.from('AutoCAD Binary DXF\r\n\x1a\0'),
          Buffer.from([255, 0, 128]),
        ]),
      ),
    ).resolves.toBeUndefined();
    await expect(
      validateArchiveFile('notes.txt', Buffer.from([77, 90, 0, 255])),
    ).rejects.toThrow();
    await expect(
      validateArchiveFile('plan.dxf', Buffer.from('not CAD')),
    ).rejects.toThrow();
  });
  it.each(['docx', 'xlsx', 'pptx'])(
    'accepts a minimal non-macro %s package',
    async (extension) => {
      await expect(
        validateArchiveFile(`plan.${extension}`, office(extension)),
      ).resolves.toBeUndefined();
    },
  );
  it('rejects missing Office markers, macro payloads, encrypted entries, symlinks, traversal, corrupt CRC and duplicate entries', async () => {
    const safe = { name: 'plan.pdf', bytes: pdf };
    const crcBroken = zipFixture([safe]);
    crcBroken[30 + safe.name.length] ^= 1;
    const archives = [
      zipFixture([safe]),
      zipFixture([
        {
          name: '[Content_Types].xml',
          bytes: Buffer.from('<Types>macroEnabled</Types>'),
        },
        { name: 'word/vbaProject.bin', bytes: Buffer.from('macro') },
      ]),
      zipFixture([{ ...safe, encrypted: true }]),
      zipFixture([{ ...safe, mode: 0xa000 }]),
      zipFixture([{ ...safe, name: '../plan.pdf' }]),
      crcBroken,
      zipFixture([safe, safe]),
    ];
    await expect(
      validateArchiveFile('fake.docx', archives[0]),
    ).rejects.toThrow();
    for (const bytes of archives.slice(1)) {
      await expect(validateArchiveFile('files.zip', bytes)).rejects.toThrow();
    }
  });
  it('rejects nested executables and disguised executable bytes inside ZIPs', async () => {
    for (const name of ['plan.exe', 'plan.pdf']) {
      const inner = zipFixture([{ name, bytes: Buffer.from('MZ executable') }]);
      await expect(
        validateArchiveFile(
          'files.zip',
          zipFixture([{ name: 'nested.zip', bytes: inner }]),
        ),
      ).rejects.toThrow();
    }
  });
  it('accepts ZIPs containing supported documents, CAD files and nested safe ZIPs', async () => {
    const nested = zipFixture([{ name: 'תוכנית.pdf', bytes: pdf }]);
    await expect(
      validateArchiveFile(
        'files.zip',
        zipFixture([
          { name: 'plans/nested.zip', bytes: nested },
          { name: 'cad/plan.dwg', bytes: Buffer.from('AC1032 content') },
          { name: 'plan.docx', bytes: office('docx') },
        ]),
      ),
    ).resolves.toBeUndefined();
  });
  it('bounds archive recursion, compression ratio and entry counts', async () => {
    const wrap = (bytes: Buffer, depth: number): Buffer =>
      depth === 0
        ? bytes
        : wrap(zipFixture([{ name: 'nested.zip', bytes }]), depth - 1);
    await expect(
      validateArchiveFile(
        'files.zip',
        wrap(
          zipFixture([{ name: 'plan.pdf', bytes: pdf }]),
          ARCHIVE_LIMITS.MAX_DEPTH + 1,
        ),
      ),
    ).rejects.toThrow();
    await expect(
      validateArchiveFile(
        'bomb.zip',
        zipFixture([
          {
            name: 'notes.txt',
            bytes: Buffer.alloc(1024 * 1024, 65),
            compress: true,
          },
        ]),
      ),
    ).rejects.toThrow();
    await expect(
      validateArchiveFile(
        'many.zip',
        zipFixture(
          Array.from(
            { length: ARCHIVE_LIMITS.MAX_ENTRIES + 1 },
            (_, index) => ({ name: `${index}.txt`, bytes: Buffer.from('a') }),
          ),
        ),
      ),
    ).rejects.toThrow();
  });
  it('rejects macros and binary payloads hidden inside Office packages', async () => {
    const type = DRIVE_UPLOAD_POLICY.types.docx;
    const base = [
      {
        name: '[Content_Types].xml',
        bytes: Buffer.from(`<Types>${type.contentType}</Types>`),
      },
      { name: 'word/document.xml', bytes: Buffer.from('<document/>') },
    ];
    await expect(
      validateArchiveFile(
        'plan.docx',
        zipFixture([
          ...base,
          { name: 'word/vbaProject.bin', bytes: Buffer.from('macro') },
        ]),
      ),
    ).rejects.toThrow();
    await expect(
      validateArchiveFile(
        'plan.docx',
        zipFixture([
          base[0],
          { name: 'word/document.xml', bytes: Buffer.from('MZ executable') },
        ]),
      ),
    ).rejects.toThrow();
    await expect(
      validateArchiveFile(
        'plan.docx',
        zipFixture([
          {
            name: '[Content_Types].xml',
            bytes: Buffer.from(
              '<Types>application/vnd.ms-word.document.macroEnabled.main+xml</Types>',
            ),
          },
          base[1],
        ]),
      ),
    ).rejects.toThrow();
  });
  it('enforces a shared expansion budget across entries', async () => {
    const original = ARCHIVE_LIMITS.MAX_EXPANDED_BYTES;
    ARCHIVE_LIMITS.MAX_EXPANDED_BYTES = 40;
    try {
      const bytes = zipFixture([
        { name: 'a.txt', bytes: Buffer.alloc(25, 65) },
        { name: 'b.txt', bytes: Buffer.alloc(25, 65) },
      ]);
      await expect(validateArchiveFile('files.zip', bytes)).rejects.toThrow();
    } finally {
      ARCHIVE_LIMITS.MAX_EXPANDED_BYTES = original;
    }
  });
});
