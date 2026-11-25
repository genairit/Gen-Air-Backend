import { openPdf } from './pdf-library.utility';
import { extractPdfPages } from './pdf-text.utility';
import { IOpenedPdf } from '../interfaces/project-document.interface';

jest.mock('./pdf-library.utility');

const EXTRACTION_TIMEOUT_MS = 20;

describe('extractPdfPages resource cleanup', () => {
  const openPdfMock = jest.mocked(openPdf);
  const destroy = jest.fn<Promise<void>, []>();

  const stubOpenedPdf = (opened: Promise<IOpenedPdf>): void => {
    openPdfMock.mockResolvedValue({ opened, destroy });
  };

  beforeEach(() => {
    jest.resetAllMocks();
    destroy.mockResolvedValue();
  });

  it('destroys the loading task and rejects when parsing outlives the deadline', async () => {
    stubOpenedPdf(new Promise(() => {}));

    await expect(
      extractPdfPages(Buffer.from('%PDF-stalled'), {
        maxPages: 5,
        signal: AbortSignal.timeout(EXTRACTION_TIMEOUT_MS),
      }),
    ).rejects.toThrow();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('destroys the loading task when text extraction outlives the deadline', async () => {
    stubOpenedPdf(
      Promise.resolve({
        pageCount: 2,
        extractPages: () => new Promise<string[]>(() => {}),
      }),
    );

    await expect(
      extractPdfPages(Buffer.from('%PDF-slow'), {
        maxPages: 5,
        signal: AbortSignal.timeout(EXTRACTION_TIMEOUT_MS),
      }),
    ).rejects.toThrow();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('destroys the loading task when the parse itself fails', async () => {
    stubOpenedPdf(Promise.reject(new Error('Invalid PDF structure')));

    await expect(
      extractPdfPages(Buffer.from('broken'), {
        maxPages: 5,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('Invalid PDF structure');
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
