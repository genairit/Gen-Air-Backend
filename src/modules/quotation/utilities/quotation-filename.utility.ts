import type {
  IFilenamePart,
  IFilenamePrefix,
  IBoundedFilenameGroup,
  IQuotationFilenameContext,
} from '../interfaces/quotation-filename.interface';

import { createHash } from 'node:crypto';
import { QUOTATION_FILENAME } from '../constants/quotation-filename.constant';

const safeSegment = (value: string): string =>
  value
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/^[. ]+|[. ]+$/gu, '');

const optionalSegment = (value: string | null): string | null =>
  safeSegment(value ?? '') || null;

export const quotationFilenameInputs = (
  context: IQuotationFilenameContext,
): IQuotationFilenameContext => ({
  quotationId: context.quotationId,
  title: safeSegment(context.title),
  number: safeSegment(context.number),
  customerName: safeSegment(context.customerName),
  projectName: optionalSegment(context.projectName),
  buildingName: optionalSegment(context.buildingName),
  apartmentNumber: optionalSegment(context.apartmentNumber),
  brands: [...new Set(context.brands.map(safeSegment).filter(Boolean))],
});

const buildingParts = (context: IQuotationFilenameContext): IFilenamePart[] =>
  [
    {
      prefix: `${QUOTATION_FILENAME.BUILDING_LABEL} `,
      value: context.buildingName ?? '',
    },
    {
      prefix: `${QUOTATION_FILENAME.APARTMENT_LABEL} `,
      value: context.apartmentNumber ?? '',
    },
  ].filter((part): boolean => part.value.length > 0);

const joinedParts = (parts: IFilenamePart[], separator: string): string =>
  parts.map((part): string => `${part.prefix}${part.value}`).join(separator);

const buildingApartment = (context: IQuotationFilenameContext): string =>
  joinedParts(buildingParts(context), ' ');

const filename = (segments: string[]): string =>
  `${segments.filter(Boolean).join(QUOTATION_FILENAME.SEPARATOR)}${QUOTATION_FILENAME.EXTENSION}`;

const prefixWithinBytes = (value: string, budget: number): string => {
  const graphemes = Array.from(
    new Intl.Segmenter('he', { granularity: 'grapheme' }).segment(value),
    (grapheme): string => grapheme.segment,
  );
  const prefix = graphemes.reduce<IFilenamePrefix>(
    (current, grapheme): IFilenamePrefix => {
      if (!current.complete) {
        return current;
      }

      const next = `${current.value}${grapheme}`;
      const fits = Buffer.byteLength(next, 'utf8') <= budget;
      return fits
        ? { value: next, complete: true }
        : { value: current.value, complete: false };
    },
    { value: '', complete: true },
  );
  return prefix.value.trim();
};

const boundedGroup = ({
  parts,
  separator,
  budget,
}: IBoundedFilenameGroup): string => {
  const complete = joinedParts(parts, separator);
  if (Buffer.byteLength(complete, 'utf8') <= budget) {
    return complete;
  }

  const prefixBytes = parts.reduce(
    (total, part): number => total + Buffer.byteLength(part.prefix),
    0,
  );
  const separatorBytes =
    Math.max(0, parts.length - 1) * Buffer.byteLength(separator);
  const contentBudget = Math.max(0, budget - prefixBytes - separatorBytes);
  const perPartBudget = Math.floor(contentBudget / parts.length);
  const shortened = parts.map((part): string => {
    const value = prefixWithinBytes(part.value, perPartBudget);
    return value ? `${part.prefix}${value}` : '';
  });
  return shortened.filter(Boolean).join(separator);
};

const shortenedOptional = (
  context: IQuotationFilenameContext,
  budget: number,
): string[] => [
  prefixWithinBytes(context.customerName, budget),
  prefixWithinBytes(context.projectName ?? '', budget),
  boundedGroup({ parts: buildingParts(context), separator: ' ', budget }),
  boundedGroup({
    parts: context.brands.map((value): IFilenamePart => ({
      value,
      prefix: '',
    })),
    separator: QUOTATION_FILENAME.BRAND_SEPARATOR,
    budget,
  }),
];

const boundedFilename = (
  context: IQuotationFilenameContext,
  optional: string[],
): string => {
  const digest = createHash('sha256')
    .update(JSON.stringify(context))
    .digest('hex')
    .slice(0, QUOTATION_FILENAME.HASH_LENGTH);
  const required = [context.title, `${context.number}~${digest}`];
  const requiredBytes = Buffer.byteLength(filename(required), 'utf8');
  if (requiredBytes > QUOTATION_FILENAME.MAX_BYTES) {
    throw new Error('Quotation document identity exceeds filename limit');
  }

  const separatorBytes = Buffer.byteLength(QUOTATION_FILENAME.SEPARATOR);
  const separatorsBudget = optional.length * separatorBytes;
  const remaining = QUOTATION_FILENAME.MAX_BYTES - requiredBytes;
  const optionalBudget = Math.max(0, remaining - separatorsBudget);
  const perFieldBudget = Math.floor(optionalBudget / optional.length);
  const shortened = shortenedOptional(context, perFieldBudget);
  return filename([...required, ...shortened]);
};

export const quotationFilename = (
  context: IQuotationFilenameContext,
): string => {
  const normalized = quotationFilenameInputs(context);
  const hasTitle = normalized.title.length > 0;
  const hasNumber = normalized.number.length > 0;
  const hasIdentity = hasTitle && hasNumber;
  if (!hasIdentity) {
    throw new Error('Quotation document identity is required for filename');
  }

  const optional = [
    normalized.customerName,
    normalized.projectName ?? '',
    buildingApartment(normalized),
    normalized.brands.join(QUOTATION_FILENAME.BRAND_SEPARATOR),
  ].filter(Boolean);
  const complete = filename([normalized.title, normalized.number, ...optional]);
  if (Buffer.byteLength(complete, 'utf8') <= QUOTATION_FILENAME.MAX_BYTES) {
    return complete;
  }

  return boundedFilename(normalized, optional);
};
