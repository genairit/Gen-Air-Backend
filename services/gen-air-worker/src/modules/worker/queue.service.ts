import {
  Injectable,
  OnModuleInit,
  OnApplicationShutdown,
} from '@nestjs/common';

import amqp from 'amqplib';
import { ConfigService } from '@nestjs/config';
import { WorkerService } from './worker.service.js';
import { WORKER } from '../../constants/worker.constant.js';
import { TypedLogger } from '../../logger/logger.service.js';
import type { IQueueNames } from '../../interfaces/worker.interface.js';
import type { ChannelModel, ConfirmChannel, ConsumeMessage } from 'amqplib';
import { ConfirmedPublisher } from '../../infrastructure/confirmed-publisher.js';

@Injectable()
export class QueueService implements OnModuleInit, OnApplicationShutdown {
  private ready = false;
  private stopping = false;
  private consumerTag: string | null = null;
  private channel: ConfirmChannel | null = null;
  private connection: ChannelModel | null = null;
  private readonly active = new Set<Promise<void>>();
  private readonly failure = Promise.withResolvers<void>();
  private readonly logger = new TypedLogger(QueueService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly worker: WorkerService,
  ) {}

  isReady = (): boolean => this.ready;
  waitForFailure = (): Promise<void> => this.failure.promise;

  onModuleInit = async (): Promise<void> => {
    const channel = await this.openChannel();
    const queues = this.getQueueNames();
    await this.declareQueues(channel, queues);
    await this.startConsumer(channel, queues);
  };

  private openChannel = async (): Promise<ConfirmChannel> => {
    const url = new URL(this.config.getOrThrow<string>('RABBITMQ_URL'));
    url.searchParams.set('heartbeat', String(WORKER.HEARTBEAT_SECONDS));
    const connection = await amqp.connect(url.toString(), {
      timeout: WORKER.PUBLISH_TIMEOUT_MS,
    });
    this.connection = connection;
    connection.on('error', this.fail);
    connection.on('close', this.fail);
    const channel = await connection.createConfirmChannel();
    this.channel = channel;
    channel.on('error', this.fail);
    channel.on('close', this.fail);
    return channel;
  };

  private getQueueNames = (): IQueueNames => {
    const prefix = this.config.getOrThrow<string>('WORKER_QUEUE_PREFIX');
    return {
      jobs: `${prefix}.jobs`,
      results: `${prefix}.results`,
      failures: `${prefix}.failures`,
    };
  };

  private startConsumer = async (
    channel: ConfirmChannel,
    queues: IQueueNames,
  ): Promise<void> => {
    await channel.prefetch(this.config.getOrThrow<number>('WORKER_PREFETCH'));
    const publisher = new ConfirmedPublisher(channel);
    const consumer = await channel.consume(
      queues.jobs,
      (message) => this.consume(message, publisher, queues),
      { noAck: false },
    );
    this.consumerTag = consumer.consumerTag;
    this.ready = true;
    this.logger.info({ message: 'Queue consumer ready' });
  };

  onApplicationShutdown = async (): Promise<void> => {
    this.stopping = true;
    this.ready = false;
    const timeout = setTimeout(this.forceShutdown, WORKER.SHUTDOWN_TIMEOUT_MS);
    try {
      await this.stopConsumer();
      await Promise.all(this.active);
    } catch {
      this.logger.warn({
        message:
          'Queue shutdown interrupted; unfinished jobs will be redelivered',
      });
    } finally {
      await this.closeConnection();
      clearTimeout(timeout);
    }
  };

  private forceShutdown = (): never => {
    this.logger.error({
      message:
        'Shutdown deadline reached; exiting to release unfinished deliveries',
    });
    process.exit(1);
  };

  private declareQueues = async (
    channel: ConfirmChannel,
    queues: IQueueNames,
  ): Promise<void> => {
    const durable = {
      durable: true,
      arguments: {
        'x-queue-type': WORKER.QUEUE_TYPE,
        'x-delivery-limit': -1,
        'x-overflow': 'reject-publish',
        'x-max-length-bytes': 64 * 1024 * 1024,
      },
    };
    await channel.assertQueue(queues.failures, durable);
    await channel.assertQueue(queues.results, durable);
    await channel.assertQueue(queues.jobs, {
      ...durable,
      arguments: {
        ...durable.arguments,
        'x-delivery-limit': 10,
        'x-dead-letter-strategy': 'at-least-once',
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': queues.failures,
      },
    });
  };

  private consume = (
    message: ConsumeMessage | null,
    publisher: ConfirmedPublisher,
    queues: IQueueNames,
  ): void => {
    if (!message) {
      this.fail();
      return;
    }

    const operation = this.worker.process(message.content, {
      acknowledge: () => this.channel?.ack(message),
      publishResult: (result) => publisher.publish(queues.results, result),
      publishRetry: (job) => publisher.publish(queues.jobs, job),
      publishFailure: (failure) => publisher.publish(queues.failures, failure),
    });
    const tracked = operation
      .catch(this.fail)
      .finally(() => this.active.delete(tracked));
    this.active.add(tracked);
  };

  private fail = (): void => {
    this.ready = false;
    if (this.stopping) {
      return;
    }

    this.logger.error({
      message: 'Queue connection or publication failed; restart required',
    });
    this.failure.resolve();
  };

  private stopConsumer = async (): Promise<void> => {
    if (this.channel && this.consumerTag) {
      await this.channel.cancel(this.consumerTag);
    }
  };

  private closeConnection = async (): Promise<void> => {
    try {
      await this.connection?.close();
    } catch {
      this.logger.warn({ message: 'Broker connection was already closed' });
    }
  };
}
