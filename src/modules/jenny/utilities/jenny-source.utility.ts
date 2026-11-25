import { uniqueBy } from '@Utilities/array.utility';
import { JENNY_LIMITS } from '../constants/jenny.constant';
import { IJennySource } from '../interfaces/jenny.interface';

const FILE_EXTENSION = /\.[^.]+$/;

const sourceKey = (source: IJennySource): string =>
  [source.fileId, source.page ?? ''].join(':');

const citableNames = (fileName: string): string[] => {
  const nameWithoutExtension = fileName.replace(FILE_EXTENSION, '');
  const isDistinctiveStem =
    nameWithoutExtension.length >= JENNY_LIMITS.MIN_CITED_NAME_LENGTH;

  return isDistinctiveStem ? [fileName, nameWithoutExtension] : [fileName];
};

const mentionsFile = (message: string, fileName: string): boolean => {
  const normalizedMessage = message.toLocaleLowerCase();

  return citableNames(fileName).some((name) =>
    normalizedMessage.includes(name.toLocaleLowerCase()),
  );
};

const mentionsPage = (message: string, page: number | null): boolean => {
  if (page === null) {
    return true;
  }

  return new RegExp(`(?<!\\d)${page}(?!\\d)`).test(message);
};

const isCitedIn =
  (message: string) =>
  (source: IJennySource): boolean =>
    mentionsFile(message, source.fileName) &&
    mentionsPage(message, source.page);

export const selectCitedSources = (
  message: string,
  candidates: IJennySource[],
): IJennySource[] => {
  const cited = candidates.filter(isCitedIn(message));
  const filesCitedByPage = new Set(
    cited.filter((source) => source.page !== null).map(({ fileId }) => fileId),
  );
  const mostSpecific = cited.filter(
    (source) => source.page !== null || !filesCitedByPage.has(source.fileId),
  );

  return uniqueBy(mostSpecific, sourceKey).slice(0, JENNY_LIMITS.MAX_SOURCES);
};
