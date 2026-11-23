import {
  Injectable,
  OnApplicationBootstrap,
  BeforeApplicationShutdown,
} from '@nestjs/common';

import {
  PUBLICATION_STATE,
  PUBLICATION_LIMITS,
  PUBLICATION_POLICY,
  PUBLICATION_REASON,
} from './constants/publication.constant';

import {
  PUBLICATION_PROTOCOL,
  PUBLICATION_BROKER_EVENT,
} from './constants/publication.constant';

import { connect } from 'amqplib';
import { Transaction } from 'sequelize';
import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PublicationService } from './publication.service';
import { Meta, TypedLogger } from '@Logger/logger.service';
import { PublicationRepository } from './publication.repository';
import { AsyncInterval } from '@Utilities/async-interval.utility';
import type { ChannelModel, ConfirmChannel, ConsumeMessage } from 'amqplib';
import { PublicationExecutorService } from './publication-executor.service';
import { parsePublicationResult } from './utilities/publication-result.utility';
import type { IPublicationOperation } from './interfaces/publication.interface';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

@Injectable()
export class PublicationBrokerService
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private readonly logger = new TypedLogger<Meta>(
    PublicationBrokerService.name,
  );
  private connection: ChannelModel | null = null;
  private readonly closing = new Set<Promise<void>>();
  private consumerTag: string | null = null;
  private channel: ConfirmChannel | null = null;
  private readonly scheduler = new AsyncInterval({
    delay: PUBLICATION_LIMITS.POLL_MS,
    work: async (): Promise<void> => {
      await this.tick();
    },
    onError: (): void => {
      this.logger.warn({ message: 'Publication scheduler failed' });
    },
  });
  private running: Promise<void> | null = null;
  private stopping = false;
  private readonly results = new Set<Promise<void>>();
  constructor(
    private readonly config: ConfigService,
    private readonly publication: PublicationService,
    private readonly repository: PublicationRepository,
    private readonly executor: PublicationExecutorService,
    private readonly transactions: DatabaseTransactionService,
  ) {}
  onApplicationBootstrap(): void {
    this.scheduler.start();
  }
  async beforeApplicationShutdown(): Promise<void> {
    this.stopping = true;
    this.executor.stop();
    await this.scheduler.stop();
    await this.running;
    if (this.channel && this.consumerTag) {
      await this.channel.cancel(this.consumerTag);
      this.consumerTag = null;
    }
    await Promise.all(this.results);
    const channel = this.channel;
    const connection = this.connection;
    this.channel = null;
    this.connection = null;
    this.consumerTag = null;
    if (connection) {
      await this.closeResources(channel, connection);
    }
    await Promise.all(this.closing);
  }
  async tick(): Promise<void> {
    if (this.stopping || this.running) {
      return;
    }

    this.running = this.work();
    try {
      await this.running;
    } catch {
      this.logger.warn({
        message:
          'Quotation publication dispatcher will retry durable pending work',
      });
    } finally {
      this.running = null;
    }
  }
  private async work(): Promise<void> {
    try {
      await this.ensureConnection();
    } catch {
      this.logger.warn({
        message:
          'Publication broker unavailable; durable intent remains pending',
      });
    }
    const quotationIds = await this.repository.pending();
    for (const quotationId of quotationIds) {
      if (this.stopping) {
        return;
      }

      await this.dispatch(quotationId);
      await this.executor.execute(quotationId);
    }
  }
  private prefix(): string {
    const prefix =
      this.config.get<string>('WORKER_QUEUE_PREFIX') ?? 'genair.worker.v1';
    if (!/^[a-zA-Z0-9._-]{1,100}$/.test(prefix)) {
      throw new Error('Invalid worker queue prefix');
    }

    return prefix;
  }
  private async ensureConnection(): Promise<void> {
    if (this.channel || this.stopping) {
      return;
    }

    const url = this.config.get<string>('RABBITMQ_URL');
    if (!url) {
      return;
    }

    const prefix = this.prefix();
    const parsedUrl = new URL(url);
    const supportedProtocol =
      parsedUrl.protocol === PUBLICATION_PROTOCOL.AMQP_SCHEME ||
      parsedUrl.protocol === PUBLICATION_PROTOCOL.AMQPS_SCHEME;
    if (!supportedProtocol) {
      throw new Error('Invalid publication broker protocol');
    }

    const connection = await connect(url, {
      timeout: PUBLICATION_LIMITS.DRIVE_TIMEOUT_MS,
    });
    const setup: { channel: ConfirmChannel | null; closed: boolean } = {
      channel: null,
      closed: false,
    };
    connection.on(PUBLICATION_BROKER_EVENT.ERROR, (): void => {
      this.logger.warn({ message: 'Publication broker connection failed' });
    });
    connection.on(PUBLICATION_BROKER_EVENT.CLOSE, (): void => {
      setup.closed = true;
      if (this.connection !== connection) {
        return;
      }

      this.connection = null;
      this.channel = null;
      this.consumerTag = null;
    });
    try {
      const channel = await connection.createConfirmChannel();
      setup.channel = channel;
      channel.on(PUBLICATION_BROKER_EVENT.ERROR, (): void => {
        this.logger.warn({ message: 'Publication broker channel failed' });
      });
      channel.on(PUBLICATION_BROKER_EVENT.CLOSE, (): void => {
        setup.closed = true;
        if (this.channel !== channel || this.connection !== connection) {
          return;
        }

        this.channel = null;
        this.consumerTag = null;
        const closing = this.closeResources(null, connection).finally(
          (): void => {
            this.closing.delete(closing);
          },
        );
        this.closing.add(closing);
      });
      const durable = {
        durable: true,
        arguments: {
          'x-queue-type': PUBLICATION_PROTOCOL.QUEUE_TYPE,
          'x-delivery-limit': -1,
          'x-overflow': 'reject-publish',
          'x-max-length-bytes': 64 * 1024 * 1024,
        },
      };
      await channel.assertQueue(`${prefix}.pdf.results`, durable);
      await channel.assertQueue(`${prefix}.pdf.jobs`, {
        ...durable,
        arguments: {
          ...durable.arguments,
          'x-delivery-limit': 10,
          'x-dead-letter-strategy': 'at-least-once',
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': `${prefix}.failures`,
        },
      });
      await channel.prefetch(1);
      const consumer = await channel.consume(
        `${prefix}.pdf.results`,
        (message): void => {
          if (!message) {
            return;
          }

          const tracked = this.consume(channel, message).finally((): void => {
            this.results.delete(tracked);
          });
          this.results.add(tracked);
        },
        { noAck: false },
      );
      if (setup.closed || this.stopping) {
        throw new Error('Publication setup closed before adoption');
      }

      this.consumerTag = consumer.consumerTag;
      this.connection = connection;
      this.channel = channel;
    } catch (error: unknown) {
      await this.closeResources(setup.channel, connection);
      throw error;
    }
  }
  private async closeResources(
    channel: ConfirmChannel | null,
    connection: ChannelModel,
  ): Promise<void> {
    try {
      await channel?.close();
    } catch {
      this.logger.warn({ message: 'Publication setup channel already closed' });
    }
    try {
      await connection.close();
    } catch {
      this.logger.warn({
        message: 'Publication setup connection already closed',
      });
    }
  }
  private async consume(
    channel: ConfirmChannel,
    message: ConsumeMessage,
  ): Promise<void> {
    try {
      const result = this.decode(message.content);
      if (!result) {
        channel.reject(message, false);
        return;
      }

      await this.transactions.run(async (transaction): Promise<void> => {
        const operation = await this.repository.operation(
          result.correlation.operationId,
          transaction,
        );
        if (!operation) {
          return;
        }

        const cycle = await this.repository.cycle(
          operation.cycleId,
          transaction,
        );
        await this.publication.lock(cycle.quotationId, transaction);
        const current = await this.repository.operation(
          operation.id,
          transaction,
        );
        const currentCycle = await this.repository.cycle(
          operation.cycleId,
          transaction,
        );
        const obsolete =
          current !== null &&
          !current.effectStarted &&
          (currentCycle.terminal ||
            current.generation < currentCycle.generation);
        const exact =
          current &&
          current.jobId === result.jobId &&
          current.cycleId === result.correlation.cycleId &&
          current.generation === result.correlation.generation &&
          current.sourceHash === result.correlation.sourceHash;
        if (
          !exact ||
          !current ||
          obsolete ||
          current.hash ||
          current.state === PUBLICATION_STATE.ARCHIVED ||
          current.state === PUBLICATION_STATE.PUBLISHED
        ) {
          return;
        }

        if (!result.output) {
          await this.fail(current, PUBLICATION_REASON.WORKER, transaction);
          return;
        }

        await this.repository.execute(
          `UPDATE quotation_publication_operations SET pdf=$pdf,hash=$hash,md5_hash=$md5Hash,state='publishing',reason=NULL,updated_at=now() WHERE id=$id AND job_id=$jobId AND pdf IS NULL AND hash IS NULL AND state NOT IN ('published','archived')`,
          {
            id: current.id,
            jobId: current.jobId,
            pdf: Buffer.from(result.output.pdfBase64, 'base64'),
            hash: result.output.sha256,
            md5Hash: createHash('md5')
              .update(Buffer.from(result.output.pdfBase64, 'base64'))
              .digest('hex'),
          },
          transaction,
        );
      });
      channel.ack(message);
    } catch {
      this.logger.warn({
        message:
          'PDF result not adopted; broker delivery retained for recovery',
      });
      try {
        channel.nack(message, false, true);
      } catch {
        this.logger.warn({
          message:
            'PDF result connection closed before acknowledgement; broker will redeliver',
        });
      }
    }
  }
  private decode(
    bytes: Buffer,
  ): ReturnType<typeof parsePublicationResult> | null {
    try {
      return parsePublicationResult(bytes);
    } catch {
      this.logger.warn({ message: 'Rejected invalid PDF result envelope' });
      return null;
    }
  }
  private async dispatch(quotationId: string): Promise<void> {
    await this.transactions.run(async (transaction): Promise<void> => {
      await this.publication.lock(quotationId, transaction);
      const cycles = await this.repository.cycles(quotationId, transaction);
      for (const cycle of cycles) {
        const operations = await this.repository.operations(
          cycle.id,
          transaction,
        );
        for (const operation of operations) {
          const obsolete =
            cycle.terminal || operation.generation < cycle.generation;
          const unstarted = !operation.effectStarted && !operation.hash;
          if (obsolete && operation.kind !== null && unstarted) {
            await this.repository.execute(
              `UPDATE quotation_publication_operations SET state='archived',reason=$reason,updated_at=now() WHERE id=$id`,
              { id: operation.id, reason: PUBLICATION_REASON.SUPERSEDED },
              transaction,
            );
            continue;
          }

          const timedOut =
            operation.dispatchedAt &&
            Date.now() - new Date(operation.dispatchedAt).getTime() >
              PUBLICATION_LIMITS.RENDER_TIMEOUT_MS;
          if (operation.state === PUBLICATION_STATE.RENDERING && timedOut) {
            await this.fail(operation, PUBLICATION_REASON.TIMEOUT, transaction);
          }
          if (
            operation.state !== PUBLICATION_STATE.QUEUED ||
            !operation.snapshot ||
            !this.channel
          ) {
            continue;
          }

          const envelope = {
            version: PUBLICATION_PROTOCOL.VERSION,
            jobId: operation.jobId,
            tenantId: PUBLICATION_POLICY.TENANT,
            jobType: PUBLICATION_POLICY.RENDERER,
            attempt: 1,
            payload: {
              operationId: operation.id,
              cycleId: cycle.id,
              sourceHash: operation.sourceHash,
              generation: operation.generation,
              document: operation.snapshot.document,
            },
          };
          const bytes = Buffer.from(JSON.stringify(envelope));
          if (bytes.length > PUBLICATION_LIMITS.JOB_BYTES) {
            await this.fail(operation, PUBLICATION_REASON.WORKER, transaction);
            continue;
          }

          await this.publish(bytes);
          await this.repository.execute(
            `WITH confirmed AS (UPDATE quotation_publication_operations SET state='rendering',attempt=attempt+1,dispatched_at=now(),updated_at=now() WHERE id=$id AND job_id=$jobId AND hash IS NULL AND state='queued' RETURNING cycle_id) UPDATE quotation_publication_cycles SET state='rendering',reason=NULL,updated_at=now() WHERE id IN (SELECT cycle_id FROM confirmed)`,
            { id: operation.id, jobId: operation.jobId },
            transaction,
          );
        }
      }
    });
  }
  private async publish(bytes: Buffer): Promise<void> {
    const channel = this.channel;
    if (!channel) {
      throw new Error('PDF broker unavailable');
    }

    await new Promise<void>((resolve, reject): void => {
      const timer = setTimeout((): void => {
        reject(new Error('PDF broker confirmation timed out'));
      }, PUBLICATION_LIMITS.DRIVE_TIMEOUT_MS);
      const returned = (): void => {
        clearTimeout(timer);
        reject(new Error('PDF job queue unavailable'));
      };
      channel.once(PUBLICATION_BROKER_EVENT.RETURN, returned);
      channel.sendToQueue(
        `${this.prefix()}.pdf.jobs`,
        bytes,
        {
          mandatory: true,
          persistent: true,
          contentType: PUBLICATION_PROTOCOL.CONTENT_TYPE,
        },
        (error: unknown): void => {
          clearTimeout(timer);
          channel.removeListener(PUBLICATION_BROKER_EVENT.RETURN, returned);
          if (error) {
            reject(new Error('PDF broker rejected publication'));
            return;
          }

          resolve();
        },
      );
    });
  }
  private async fail(
    operation: IPublicationOperation,
    reason: string,
    transaction: Transaction,
  ): Promise<void> {
    await this.repository.execute(
      `WITH failed AS (UPDATE quotation_publication_operations SET state='failed',reason=$reason,updated_at=now() WHERE id=$id AND job_id=$jobId AND hash IS NULL AND state NOT IN ('published','archived') RETURNING cycle_id) UPDATE quotation_publication_cycles SET state='failed',reason=$reason,updated_at=now() WHERE id IN (SELECT cycle_id FROM failed)`,
      { id: operation.id, jobId: operation.jobId, reason },
      transaction,
    );
  }
}
