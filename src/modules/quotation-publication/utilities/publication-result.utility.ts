import {
  PUBLICATION_LIMITS,
  PUBLICATION_POLICY,
} from '../constants/publication.constant';

import { createHash } from 'node:crypto';
import { GOOGLE_DRIVE } from '@Constants/google-drive.constant';
import { PUBLICATION_RESULT_STATUS } from '../constants/publication.constant';
import type { IPublicationResult } from '../interfaces/publication.interface';

export const isPublicationRecord = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
export const parsePublicationResult = (bytes: Buffer): IPublicationResult => {
  if (bytes.length > PUBLICATION_LIMITS.RESULT_BYTES) {
    throw new Error('PDF result exceeds limit');
  }

  const value: unknown = JSON.parse(bytes.toString('utf8'));
  if (
    !isPublicationRecord(value) ||
    value.version !== 1 ||
    value.jobType !== PUBLICATION_POLICY.RENDERER ||
    value.tenantId !== PUBLICATION_POLICY.TENANT ||
    typeof value.jobId !== 'string' ||
    !isPublicationRecord(value.correlation)
  ) {
    throw new Error('Invalid PDF result envelope');
  }

  const correlation = value.correlation;
  const validCorrelation =
    typeof correlation.operationId === 'string' &&
    typeof correlation.cycleId === 'string' &&
    typeof correlation.sourceHash === 'string' &&
    /^[a-f0-9]{64}$/.test(correlation.sourceHash) &&
    typeof correlation.generation === 'number' &&
    Number.isSafeInteger(correlation.generation) &&
    correlation.generation > 0;
  if (
    !validCorrelation ||
    typeof correlation.operationId !== 'string' ||
    typeof correlation.cycleId !== 'string' ||
    typeof correlation.sourceHash !== 'string' ||
    typeof correlation.generation !== 'number'
  ) {
    throw new Error('Invalid PDF result correlation');
  }

  const identity = {
    operationId: correlation.operationId,
    cycleId: correlation.cycleId,
    sourceHash: correlation.sourceHash,
    generation: correlation.generation,
  };
  if (
    value.status === PUBLICATION_RESULT_STATUS.FAILED &&
    value.output === null
  ) {
    return {
      jobId: value.jobId,
      status: value.status,
      correlation: identity,
      output: null,
    };
  }

  const output = value.output;
  if (
    value.status !== PUBLICATION_RESULT_STATUS.SUCCEEDED ||
    !isPublicationRecord(output) ||
    output.contentType !== GOOGLE_DRIVE.PDF_MIME_TYPE ||
    typeof output.pdfBase64 !== 'string' ||
    typeof output.sha256 !== 'string' ||
    typeof output.byteLength !== 'number'
  ) {
    throw new Error('Invalid PDF result artifact');
  }

  const matches = Object.entries(identity).every(
    ([key, item]): boolean => output[key] === item,
  );
  const pdf = Buffer.from(output.pdfBase64, 'base64');
  const validBytes =
    pdf.length >= 8 &&
    pdf.length <= PUBLICATION_LIMITS.PDF_BYTES &&
    pdf.length === output.byteLength &&
    pdf.subarray(0, 5).toString() === '%PDF-' &&
    pdf.toString('base64') === output.pdfBase64;
  const validHash =
    createHash('sha256').update(pdf).digest('hex') === output.sha256;
  if (!matches || !validBytes || !validHash) {
    throw new Error('Invalid PDF result proof');
  }

  return {
    jobId: value.jobId,
    status: value.status,
    correlation: identity,
    output: {
      pdfBase64: output.pdfBase64,
      sha256: output.sha256,
      byteLength: output.byteLength,
    },
  };
};
