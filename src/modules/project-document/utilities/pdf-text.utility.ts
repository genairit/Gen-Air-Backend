import {
  IExtractedPdf,
  IPdfExtractionLimits,
} from '../interfaces/project-document.interface';

import { openPdf } from './pdf-library.utility';
import { withAbort } from '@Utilities/abort.utility';

export const extractPdfPages = async (
  content: Buffer,
  limits: IPdfExtractionLimits,
): Promise<IExtractedPdf> => {
  const pdf = await openPdf(content);

  try {
    const document = await withAbort(pdf.opened, limits.signal);

    if (document.pageCount > limits.maxPages) {
      return { totalPages: document.pageCount, pages: [] };
    }

    const pages = await withAbort(document.extractPages(), limits.signal);

    return { pages, totalPages: document.pageCount };
  } finally {
    await pdf.destroy();
  }
};
