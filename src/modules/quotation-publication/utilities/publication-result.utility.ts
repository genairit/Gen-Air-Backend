import {
  PUBLICATION_LIMITS,
  PUBLICATION_POLICY,
  PUBLICATION_PROTOCOL,
  PUBLICATION_RESULT_STATUS,
} from '../constants/publication.constant';

import type {
  IPublicationResult,
  IPublicationCorrelation,
} from '../interfaces/publication.interface';

import { isUUID } from 'class-validator';
import { createHash } from 'node:crypto';
import { GOOGLE_DRIVE } from '@Constants/google-drive.constant';

export const isPublicationRecord = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const uuid = (value: unknown): string => {
  if (typeof value !== 'string' || !isUUID(value)) {
    throw new Error('Invalid PDF UUID identity');
  }

  return value;
};
const correlationFrom = (value: unknown): IPublicationCorrelation => {
  if (!isPublicationRecord(value)) {
    throw new Error('Invalid PDF correlation');
  }

  const sourceHash = value.sourceHash;
  const validHash =
    typeof sourceHash === 'string' && /^[a-f0-9]{64}$/.test(sourceHash);
  const generation = value.generation;
  const validGeneration =
    typeof generation === 'number' &&
    Number.isSafeInteger(generation) &&
    generation > 0;
  if (
    !validHash ||
    !validGeneration ||
    typeof sourceHash !== 'string' ||
    typeof generation !== 'number'
  ) {
    throw new Error('Invalid PDF correlation proof');
  }

  return {
    operationId: uuid(value.operationId),
    cycleId: uuid(value.cycleId),
    sourceHash,
    generation,
  };
};
const outputFrom = (
  value: unknown,
  identity: IPublicationCorrelation,
): NonNullable<IPublicationResult['output']> => {
  if (!isPublicationRecord(value)) {
    throw new Error('Invalid PDF artifact');
  }

  const supportedMime = value.contentType === GOOGLE_DRIVE.PDF_MIME_TYPE;
  const typedBytes =
    typeof value.pdfBase64 === 'string' &&
    typeof value.sha256 === 'string' &&
    typeof value.byteLength === 'number';
  if (
    !supportedMime ||
    !typedBytes ||
    typeof value.pdfBase64 !== 'string' ||
    typeof value.sha256 !== 'string' ||
    typeof value.byteLength !== 'number'
  ) {
    throw new Error('Invalid PDF artifact fields');
  }

  const correlationMatches = Object.entries(identity).every(
    ([key, item]): boolean => value[key] === item,
  );
  const pdf = Buffer.from(value.pdfBase64, 'base64');
  const boundedBytes =
    pdf.length >= 8 && pdf.length <= PUBLICATION_LIMITS.PDF_BYTES;
  const exactEncoding =
    pdf.length === value.byteLength &&
    pdf.toString('base64') === value.pdfBase64;
  const pdfSignature = pdf.subarray(0, 5).toString() === '%PDF-';
  const hashMatches =
    createHash('sha256').update(pdf).digest('hex') === value.sha256;
  if (
    !correlationMatches ||
    !boundedBytes ||
    !exactEncoding ||
    !pdfSignature ||
    !hashMatches
  ) {
    throw new Error('Invalid PDF artifact proof');
  }

  return {
    pdfBase64: value.pdfBase64,
    sha256: value.sha256,
    byteLength: value.byteLength,
  };
};
export const parsePublicationResult = (bytes: Buffer): IPublicationResult => {
  if (bytes.length > PUBLICATION_LIMITS.RESULT_BYTES) {
    throw new Error('PDF result exceeds limit');
  }

  const value: unknown = JSON.parse(bytes.toString('utf8'));
  if (!isPublicationRecord(value)) {
    throw new Error('Invalid PDF result envelope');
  }

  const matchingProtocol =
    value.version === PUBLICATION_PROTOCOL.VERSION &&
    value.jobType === PUBLICATION_POLICY.RENDERER;
  const matchingTenant = value.tenantId === PUBLICATION_POLICY.TENANT;
  if (!matchingProtocol || !matchingTenant) {
    throw new Error('Foreign PDF result envelope');
  }

  const jobId = uuid(value.jobId);
  const correlation = correlationFrom(value.correlation);
  if (
    value.status === PUBLICATION_RESULT_STATUS.FAILED &&
    value.output === null
  ) {
    return {
      jobId,
      correlation,
      status: PUBLICATION_RESULT_STATUS.FAILED,
      output: null,
    };
  }

  if (value.status !== PUBLICATION_RESULT_STATUS.SUCCEEDED) {
    throw new Error('Invalid PDF result status');
  }

  return {
    jobId,
    correlation,
    status: PUBLICATION_RESULT_STATUS.SUCCEEDED,
    output: outputFrom(value.output, correlation),
  };
};
