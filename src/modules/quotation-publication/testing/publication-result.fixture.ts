import {
  PUBLICATION_POLICY,
  PUBLICATION_PROTOCOL,
  PUBLICATION_RESULT_STATUS,
} from '../constants/publication.constant';

import type {
  IPublicationCycle,
  IPublicationResult,
  IPublicationOperation,
  IPublicationCorrelation,
} from '../interfaces/publication.interface';

import { createHash } from 'node:crypto';
import type { ConfirmChannel } from 'amqplib';
import { GOOGLE_DRIVE } from '@Constants/google-drive.constant';
import { until, operations } from './publication-integration.fixture';
import { isPublicationRecord } from '../utilities/publication-result.utility';

interface ITestWireArtifact extends IPublicationCorrelation {
  sha256: string;
  pdfBase64: string;
  byteLength: number;
  contentType: typeof GOOGLE_DRIVE.PDF_MIME_TYPE;
}
interface ITestWireResult extends Pick<
  IPublicationResult,
  'jobId' | 'status' | 'correlation'
> {
  output: ITestWireArtifact | null;
  tenantId: typeof PUBLICATION_POLICY.TENANT;
  jobType: typeof PUBLICATION_POLICY.RENDERER;
  version: typeof PUBLICATION_PROTOCOL.VERSION;
}
interface IResultDelivery {
  prefix: string;
  bytes: Buffer | null;
  channel: ConfirmChannel;
  operation: IPublicationOperation;
}
export const renderResult = (
  operation: IPublicationOperation,
  bytes: Buffer | null,
): ITestWireResult => {
  const correlation = {
    operationId: operation.id,
    cycleId: operation.cycleId,
    generation: operation.generation,
    sourceHash: operation.sourceHash,
  };
  const output =
    bytes === null
      ? null
      : {
          ...correlation,
          pdfBase64: bytes.toString('base64'),
          sha256: createHash('sha256').update(bytes).digest('hex'),
          byteLength: bytes.length,
          contentType: GOOGLE_DRIVE.PDF_MIME_TYPE,
        };
  return {
    version: PUBLICATION_PROTOCOL.VERSION,
    jobType: PUBLICATION_POLICY.RENDERER,
    tenantId: PUBLICATION_POLICY.TENANT,
    jobId: operation.jobId,
    correlation,
    status:
      bytes === null
        ? PUBLICATION_RESULT_STATUS.FAILED
        : PUBLICATION_RESULT_STATUS.SUCCEEDED,
    output,
  };
};
export const deliverResult = async (input: IResultDelivery): Promise<void> => {
  input.channel.sendToQueue(
    `${input.prefix}.pdf.results`,
    Buffer.from(JSON.stringify(renderResult(input.operation, input.bytes))),
    { persistent: true },
  );
  await input.channel.waitForConfirms();
};
export const drainReadyResults = (
  channel: ConfirmChannel,
  prefix: string,
): Promise<void> =>
  until(
    async (): Promise<boolean> =>
      (await channel.checkQueue(`${prefix}.pdf.results`)).messageCount === 0,
  );
export const latestOperation = async (
  cycle: IPublicationCycle,
): Promise<IPublicationOperation> => {
  const operation = (await operations(cycle)).at(-1) ?? null;
  if (!operation) {
    throw new Error('Publication operation missing');
  }

  return operation;
};
export const consumeJobId = async (
  channel: ConfirmChannel,
  prefix: string,
): Promise<string> => {
  const message = await channel.get(`${prefix}.pdf.jobs`, { noAck: true });
  if (!message) {
    throw new Error('Published job missing');
  }

  const value: unknown = JSON.parse(message.content.toString('utf8'));
  if (!isPublicationRecord(value)) {
    throw new Error('Published job must be an object');
  }

  if (typeof value.jobId !== 'string') {
    throw new Error('Published job identity missing');
  }

  return value.jobId;
};
