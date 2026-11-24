import {
  PUBLICATION_STATE,
  PUBLICATION_LIMITS,
} from './constants/publication.constant';

import {
  PUBLICATION_POLICY,
  PUBLICATION_PROTOCOL,
  PUBLICATION_RESULT_STATUS,
} from './constants/publication.constant';

import {
  brokerResource,
  spyOnBrokerConnect,
} from './testing/publication-broker.fixture';

import {
  context,
  fixture,
  operations,
  createReview,
  currentCycle,
  startPublicationFixture,
  closePublicationFixture,
} from './testing/publication-integration.fixture';

import { mock } from 'jest-mock-extended';
import { ConfigService } from '@nestjs/config';
import { randomUUID, createHash } from 'node:crypto';
import { TIME_UNITS } from '@Constants/time.constant';
import type { ConsumeMessage, ConfirmChannel } from 'amqplib';
import { GOOGLE_DRIVE } from '@Constants/google-drive.constant';
import { pdf, until } from './testing/publication-integration.fixture';
import { PublicationBrokerService } from './publication-broker.service';
import { PublicationExecutorService } from './publication-executor.service';
import { parsePublicationResult } from './utilities/publication-result.utility';

const TRANSPORT_OUTCOME = { CONFIRM: 'confirm', FAILURE: 'failure' } as const;
interface ITransportConsumer {
  handle: ((message: ConsumeMessage | null) => void) | null;
}
interface ITransportProbe {
  pending: Promise<void> | null;
}
jest.setTimeout(2 * TIME_UNITS.MINUTE_MS);
beforeAll(startPublicationFixture);
afterAll(closePublicationFixture);
afterEach((): void => {
  jest.restoreAllMocks();
});

const broker = (): PublicationBrokerService =>
  new PublicationBrokerService(
    new ConfigService({
      RABBITMQ_URL: 'amqp://quotation_test:quotation_test@127.0.0.1:5678',
      WORKER_QUEUE_PREFIX: `captured.test.${randomUUID()}`,
    }),
    context().publication,
    context().repository,
    mock<PublicationExecutorService>(),
    context().transactions,
  );
const operationState = async (
  cycle: Awaited<ReturnType<typeof createReview>>,
): Promise<Awaited<ReturnType<typeof operations>>[number]> =>
  (await operations(cycle))[0];

// Inject successor attempts at the SQL boundary to verify captured-outcome compare-and-set fences independently of advisory retry serialization.
describe('captured transport attempt outcome fences on real PostgreSQL', (): void => {
  it.each(Object.values(TRANSPORT_OUTCOME))(
    'does not let an old publish %s update a successor render attempt',
    async (outcome): Promise<void> => {
      const cycle = await createReview();
      const captured = await operationState(cycle);
      const successor = randomUUID();
      const resources = brokerResource();
      spyOnBrokerConnect().mockResolvedValue(resources.connection);
      jest
        .spyOn(context().repository, 'pending')
        .mockResolvedValue([cycle.quotationId]);
      const probe: ITransportProbe = { pending: null };
      resources.channel.sendToQueue.mockImplementation(
        (_queue, _content, _options, callback): boolean => {
          if (!callback) {
            throw new Error('Publication confirm callback missing');
          }

          const rotated = fixture
            .database()
            .query(
              `UPDATE quotation_publication_operations SET job_id=$successor,state='queued' WHERE id=$id`,
              { bind: { id: captured.id, successor } },
            );
          probe.pending = rotated.then(
            (): void => {
              callback(
                outcome === TRANSPORT_OUTCOME.FAILURE
                  ? new Error('Delayed old publish rejection')
                  : null,
                {},
              );
            },
            (error: unknown): void => {
              callback(error, {});
            },
          );
          return true;
        },
      );
      const service = broker();
      try {
        await service.tick();
        await probe.pending;
        const saved = await operationState(cycle);
        expect(saved.jobId).toBe(successor);
        expect(saved.state).toBe(PUBLICATION_STATE.QUEUED);
        expect(saved.hash).toBeNull();
        expect((await currentCycle(cycle)).state).toBe(
          PUBLICATION_STATE.QUEUED,
        );
      } finally {
        await service.beforeApplicationShutdown();
      }
    },
  );

  it('does not let a captured old timeout fail a successor attempt', async (): Promise<void> => {
    const cycle = await createReview();
    const captured = await operationState(cycle);
    const successor = randomUUID();
    await fixture
      .database()
      .query(
        `UPDATE quotation_publication_operations SET state='rendering',dispatched_at=now()-($age::bigint * interval '1 millisecond') WHERE id=$id`,
        {
          bind: {
            id: captured.id,
            age: PUBLICATION_LIMITS.RENDER_TIMEOUT_MS + TIME_UNITS.SECOND_MS,
          },
        },
      );
    await fixture
      .database()
      .query(
        `UPDATE quotation_publication_cycles SET state='rendering' WHERE id=$id`,
        { bind: { id: cycle.id } },
      );
    const resources = brokerResource();
    spyOnBrokerConnect().mockResolvedValue(resources.connection);
    jest
      .spyOn(context().repository, 'pending')
      .mockResolvedValue([cycle.quotationId]);

    const probe = { rotated: false };
    jest
      .spyOn(context().repository, 'execute')
      .mockImplementation(async (sql, bind, transaction): Promise<void> => {
        const capturedFailure =
          sql.includes('WITH failed AS') && !probe.rotated;
        if (capturedFailure) {
          await fixture
            .database()
            .query(
              `UPDATE quotation_publication_operations SET job_id=$successor,state='rendering',dispatched_at=now() WHERE id=$id`,
              { bind: { id: captured.id, successor } },
            );
          probe.rotated = true;
        }
        await fixture.database().query(sql, { bind, transaction });
      });
    const service = broker();
    try {
      await service.tick();
      const saved = await operationState(cycle);
      expect(probe.rotated).toBe(true);
      expect(saved.jobId).toBe(successor);
      expect(saved.state).toBe(PUBLICATION_STATE.RENDERING);
      expect((await currentCycle(cycle)).state).toBe(
        PUBLICATION_STATE.RENDERING,
      );
    } finally {
      await service.beforeApplicationShutdown();
    }
  });
  it('does not let an adoption captured before attempt rotation write successor bytes', async (): Promise<void> => {
    const cycle = await createReview();
    const captured = await operationState(cycle);
    const successor = randomUUID();
    const resources = brokerResource();
    spyOnBrokerConnect().mockResolvedValue(resources.connection);
    jest
      .spyOn(context().repository, 'pending')
      .mockResolvedValue([cycle.quotationId]);
    resources.channel.sendToQueue.mockImplementation(
      (_queue, _bytes, _options, callback): boolean => {
        if (!callback) {
          throw new Error('Publication confirm callback missing');
        }

        callback(null, {});
        return true;
      },
    );
    const delivery: ITransportConsumer = { handle: null };
    resources.channel.consume.mockImplementation(
      (_queue, onMessage): ReturnType<ConfirmChannel['consume']> => {
        delivery.handle = onMessage;
        return Promise.resolve({ consumerTag: 'captured-consumer' });
      },
    );
    const service = broker();
    try {
      await service.tick();

      const probe = { rotated: false };
      jest
        .spyOn(context().repository, 'execute')
        .mockImplementation(async (sql, bind, transaction): Promise<void> => {
          const capturedAdoption =
            sql.includes('SET pdf=$pdf') && !probe.rotated;
          if (capturedAdoption) {
            await fixture
              .database()
              .query(
                `UPDATE quotation_publication_operations SET job_id=$successor WHERE id=$id`,
                { bind: { id: captured.id, successor } },
              );
            probe.rotated = true;
          }
          await fixture.database().query(sql, { bind, transaction });
        });
      const correlation = {
        operationId: captured.id,
        cycleId: cycle.id,
        generation: captured.generation,
        sourceHash: captured.sourceHash,
      };
      const envelope = {
        version: PUBLICATION_PROTOCOL.VERSION,
        tenantId: PUBLICATION_POLICY.TENANT,
        jobType: PUBLICATION_POLICY.RENDERER,
        jobId: captured.jobId,
        status: PUBLICATION_RESULT_STATUS.SUCCEEDED,
        correlation,
        output: {
          ...correlation,
          pdfBase64: pdf.toString('base64'),
          sha256: createHash('sha256').update(pdf).digest('hex'),
          byteLength: pdf.length,
          contentType: GOOGLE_DRIVE.PDF_MIME_TYPE,
        },
      };
      if (!delivery.handle) {
        throw new Error('Consumer not ready');
      }

      parsePublicationResult(Buffer.from(JSON.stringify(envelope)));
      delivery.handle({
        content: Buffer.from(JSON.stringify(envelope)),
        fields: mock<ConsumeMessage['fields']>(),
        properties: mock<ConsumeMessage['properties']>(),
      });
      await until((): Promise<boolean> =>
        Promise.resolve(
          probe.rotated && resources.channel.ack.mock.calls.length > 0,
        ),
      );
      const saved = await operationState(cycle);
      expect(saved.jobId).toBe(successor);
      expect(saved.hash).toBeNull();
      expect(saved.pdf).toBeNull();
      expect(saved.state).toBe(PUBLICATION_STATE.RENDERING);
    } finally {
      await service.beforeApplicationShutdown();
    }
  });
});
