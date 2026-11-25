const PDF_LINE_BREAK = '\n';
const XREF_OFFSET_WIDTH = 10;

const escapePdfText = (text: string): string =>
  text.replace(/[\\()]/g, (character) => `\\${character}`);

const pageObjects = (texts: string[]): string[] =>
  texts.flatMap((text, index) => {
    const pageId = 4 + index * 2;
    const stream = `BT /F1 18 Tf 72 720 Td (${escapePdfText(text)}) Tj ET`;

    return [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId + 1} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    ];
  });

const buildPdfObjects = (texts: string[]): string[] => {
  const pageReferences = texts
    .map((_text, index) => `${4 + index * 2} 0 R`)
    .join(' ');

  return [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageReferences}] /Count ${texts.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...pageObjects(texts),
  ];
};

export const buildTextPdf = (texts: string[]): Buffer => {
  const header = `%PDF-1.4${PDF_LINE_BREAK}`;
  const bodies = buildPdfObjects(texts).map(
    (body, index) => `${index + 1} 0 obj\n${body}\nendobj${PDF_LINE_BREAK}`,
  );
  const offsets = bodies.map(
    (_body, index) =>
      header.length +
      bodies.slice(0, index).reduce((sum, body) => sum + body.length, 0),
  );
  const xrefStart = header.length + bodies.join('').length;
  const xrefEntries = offsets
    .map(
      (offset) =>
        `${String(offset).padStart(XREF_OFFSET_WIDTH, '0')} 00000 n ${PDF_LINE_BREAK}`,
    )
    .join('');
  const trailer = [
    `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n${xrefEntries}`,
    `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\n`,
    `startxref\n${xrefStart}\n%%EOF`,
  ].join('');

  return Buffer.from(`${header}${bodies.join('')}${trailer}`, 'latin1');
};
