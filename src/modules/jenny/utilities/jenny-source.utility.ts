import { uniqueBy } from '@Utilities/array.utility';
import { JENNY_LIMITS } from '../constants/jenny.constant';
import { IJennySource } from '../interfaces/jenny.interface';
import { TEXT, TEXT_PATTERNS } from '@Constants/text.constant';

const sourceKey = (source: IJennySource): string =>
  [source.fileId, source.page ?? ''].join(TEXT.KEY_SEPARATOR);

const citableNames = (fileName: string): string[] => {
  const nameWithoutExtension = fileName.replace(
    TEXT_PATTERNS.FILE_EXTENSION,
    '',
  );
  const isDistinctiveStem =
    nameWithoutExtension.length >= JENNY_LIMITS.MIN_CITED_NAME_LENGTH;

  return isDistinctiveStem ? [fileName, nameWithoutExtension] : [fileName];
};

const mentionsSource = (
  message: string,
  name: string,
  page: number | null,
): boolean => {
  if (page === null) {
    return message.includes(name);
  }

  const pageCitation = new RegExp(`^[\\s*_,:"״'()–—-]*עמוד\\s+${page}(?!\\d)`);

  return message
    .split(name)
    .slice(1)
    .some((suffix) => pageCitation.test(suffix));
};

const isCitedIn =
  (message: string) =>
  (source: IJennySource): boolean =>
    citableNames(source.fileName).some((name) =>
      mentionsSource(message, name.toLocaleLowerCase(), source.page),
    );

export const selectCitedSources = (
  message: string,
  candidates: IJennySource[],
): IJennySource[] => {
  const cited = candidates.filter(isCitedIn(message.toLocaleLowerCase()));
  const filesCitedByPage = new Set(
    cited.filter((source) => source.page !== null).map(({ fileId }) => fileId),
  );
  const mostSpecific = cited.filter(
    (source) => source.page !== null || !filesCitedByPage.has(source.fileId),
  );

  return uniqueBy(mostSpecific, sourceKey).slice(0, JENNY_LIMITS.MAX_SOURCES);
};
