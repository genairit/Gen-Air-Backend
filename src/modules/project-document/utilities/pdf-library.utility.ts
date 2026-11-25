import { IPdfLoadingHandle } from '../interfaces/project-document.interface';
import { PROJECT_DOCUMENT_SETTINGS } from '../constants/project-document.constant';

export const openPdf = async (content: Buffer): Promise<IPdfLoadingHandle> => {
  const { extractText, getResolvedPDFJS } = await import('unpdf');
  const { getDocument } = await getResolvedPDFJS();
  const loadingTask = getDocument({
    useSystemFonts: true,
    data: new Uint8Array(content),
    verbosity: PROJECT_DOCUMENT_SETTINGS.PDF_JS_ERRORS_ONLY_VERBOSITY,
  });

  return {
    destroy: () => loadingTask.destroy(),
    opened: loadingTask.promise.then((document) => ({
      pageCount: document.numPages,
      extractPages: async () =>
        (await extractText(document, { mergePages: false })).text,
    })),
  };
};
