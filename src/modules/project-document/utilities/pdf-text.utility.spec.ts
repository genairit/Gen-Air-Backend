import { extractPdfPages } from './pdf-text.utility';
import { buildTextPdf } from '../testing/pdf.fixture';
import { TIME_UNITS } from '@Constants/time.constant';

const LIMITS = { maxPages: 5, timeoutMs: 10 * TIME_UNITS.SECOND_MS };

describe('extractPdfPages', () => {
  it('extracts text page by page from a real PDF', async () => {
    const pdf = buildTextPdf(['Cooling plan floor 1', 'Electrical layout B']);

    const extracted = await extractPdfPages(pdf, LIMITS);

    expect(extracted.totalPages).toBe(2);
    expect(extracted.pages.map((page) => page.trim())).toEqual([
      'Cooling plan floor 1',
      'Electrical layout B',
    ]);
  });

  it('reports the page count without extracting oversized documents', async () => {
    const pdf = buildTextPdf(['1', '2', '3']);

    await expect(
      extractPdfPages(pdf, { ...LIMITS, maxPages: 2 }),
    ).resolves.toEqual({ totalPages: 3, pages: [] });
  });

  it('rejects bytes that are not a PDF', async () => {
    await expect(
      extractPdfPages(Buffer.from('not a pdf'), LIMITS),
    ).rejects.toThrow();
  });
});
