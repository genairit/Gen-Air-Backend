import { TEXT } from '@Constants/text.constant';

const XREF_OFFSET_WIDTH = 10;
const OBJECTS_PER_PAGE = 2;
const FIRST_PAGE_OBJECT_ID = 4;
const FREE_XREF_ENTRY = '0000000000 65535 f ';

const toPdfLines = (...lines: string[]): string =>
  lines.map((line) => `${line}${TEXT.LINE_BREAK}`).join('');

const toPageObjectId = (pageIndex: number): number =>
  FIRST_PAGE_OBJECT_ID + pageIndex * OBJECTS_PER_PAGE;

const escapePdfText = (text: string): string =>
  text.replace(/[\\()]/g, (character) => `\\${character}`);

const pageObjects = (texts: string[]): string[] =>
  texts.flatMap((text, index) => {
    const contentsId = toPageObjectId(index) + 1;
    const stream = `BT /F1 18 Tf 72 720 Td (${escapePdfText(text)}) Tj ET`;

    return [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentsId} 0 R >>`,
      [`<< /Length ${stream.length} >>`, 'stream', stream, 'endstream'].join(
        TEXT.LINE_BREAK,
      ),
    ];
  });

const buildPdfObjects = (texts: string[]): string[] => {
  const pageReferences = texts
    .map((_text, index) => `${toPageObjectId(index)} 0 R`)
    .join(' ');

  return [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageReferences}] /Count ${texts.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...pageObjects(texts),
  ];
};

export const buildTextPdf = (texts: string[]): Buffer => {
  const header = toPdfLines('%PDF-1.4');
  const bodies = buildPdfObjects(texts).map((body, index) =>
    toPdfLines(`${index + 1} 0 obj`, body, 'endobj'),
  );
  const offsets = bodies.map(
    (_body, index) =>
      header.length +
      bodies.slice(0, index).reduce((sum, body) => sum + body.length, 0),
  );
  const xrefStart = header.length + bodies.join('').length;
  const objectCount = bodies.length + 1;
  const trailer = toPdfLines(
    'xref',
    `0 ${objectCount}`,
    FREE_XREF_ENTRY,
    ...offsets.map(
      (offset) => `${String(offset).padStart(XREF_OFFSET_WIDTH, '0')} 00000 n `,
    ),
    'trailer',
    `<< /Size ${objectCount} /Root 1 0 R >>`,
    'startxref',
    String(xrefStart),
    '%%EOF',
  );

  return Buffer.from(`${header}${bodies.join('')}${trailer}`, 'latin1');
};
