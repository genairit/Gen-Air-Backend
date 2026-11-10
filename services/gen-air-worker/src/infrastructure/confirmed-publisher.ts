import { randomUUID } from 'node:crypto';
import type { ConfirmChannel, Message } from 'amqplib';
import { WORKER } from '../constants/worker.constant.js';

export class ConfirmedPublisher {
  private readonly pending = new Map<string, (error: Error) => void>();

  constructor(private readonly channel: ConfirmChannel) {
    channel.on('return', this.rejectReturnedMessage);
  }

  publish = async (queue: string, value: object): Promise<void> => {
    const content = Buffer.from(JSON.stringify(value));
    if (content.length > WORKER.MAX_RESULT_BYTES + WORKER.MAX_MESSAGE_BYTES) {
      throw new Error('Message exceeds publication limit');
    }

    const publishId = randomUUID();
    const result = Promise.withResolvers<void>();
    const timeout = setTimeout(
      () => result.reject(new Error('Broker confirmation timed out')),
      WORKER.PUBLISH_TIMEOUT_MS,
    );
    this.pending.set(publishId, result.reject);
    try {
      this.channel.sendToQueue(
        queue,
        content,
        {
          messageId: publishId,
          mandatory: true,
          persistent: true,
          contentType: WORKER.CONTENT_TYPE,
        },
        (error: unknown) => {
          if (error) {
            result.reject(new Error('Broker rejected publication'));
            return;
          }

          result.resolve();
        },
      );
      await result.promise;
    } finally {
      clearTimeout(timeout);
      this.pending.delete(publishId);
    }
  };

  private rejectReturnedMessage = (message: Message): void => {
    const publishId: unknown = message.properties.messageId;
    if (typeof publishId !== 'string') {
      return;
    }

    this.pending.get(publishId)?.(new Error('Publication was unroutable'));
  };
}
