import { withTimeout } from '@Utilities/timeout.utility';
import { IExtractedPdf } from '../interfaces/project-document.interface';
import { PDF_JS_ERRORS_ONLY_VERBOSITY } from '../constants/project-document.constant';

interface IPdfExtractionLimits {
  maxPages: number;
  timeoutMs: number;
}

export const extractPdfPages = async (
  content: Buffer,
  limits: IPdfExtractionLimits,
): Promise<IExtractedPdf> => {
  const { getDocumentProxy, extractText } = await import('unpdf');
  const document = await withTimeout(
    getDocumentProxy(new Uint8Array(content), {
      verbosity: PDF_JS_ERRORS_ONLY_VERBOSITY,
    }),
    limits.timeoutMs,
  );

  try {
    if (document.numPages > limits.maxPages) {
      return { totalPages: document.numPages, pages: [] };
    }

    const extracted = await withTimeout(
      extractText(document, { mergePages: false }),
      limits.timeoutMs,
    );

    return { totalPages: extracted.totalPages, pages: extracted.text };
  } finally {
    await document.loadingTask.destroy();
  }
};
