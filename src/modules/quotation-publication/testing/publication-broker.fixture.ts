import amqplib from 'amqplib';
import { mock } from 'jest-mock-extended';
import { ConfigService } from '@nestjs/config';
import type { ChannelModel, ConfirmChannel } from 'amqplib';
import { PublicationService } from '../publication.service';
import { PublicationRepository } from '../publication.repository';
import { PublicationBrokerService } from '../publication-broker.service';
import { PUBLICATION_BROKER_EVENT } from '../constants/publication.constant';
import { PublicationExecutorService } from '../publication-executor.service';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

export interface IBrokerResourceFixture {
  connectionClose: () => void;
  channel: ReturnType<typeof mock<ConfirmChannel>>;
  connection: ReturnType<typeof mock<ChannelModel>>;
}
export const brokerResource = (): IBrokerResourceFixture => {
  const channel = mock<ConfirmChannel>();
  const connection = mock<ChannelModel>();
  const close = {
    callback: (): void => {
      throw new Error('Close listener missing');
    },
  };
  connection.on.mockImplementation(
    (event: string | symbol, listener: () => void): ChannelModel => {
      if (event === PUBLICATION_BROKER_EVENT.CLOSE) {
        close.callback = listener;
      }

      return connection;
    },
  );
  channel.on.mockReturnValue(channel);
  connection.createConfirmChannel.mockResolvedValue(channel);
  connection.close.mockResolvedValue();
  channel.close.mockResolvedValue();
  channel.assertQueue.mockResolvedValue({
    queue: 'test-queue',
    consumerCount: 0,
    messageCount: 0,
  });
  channel.prefetch.mockResolvedValue({});
  channel.consume.mockResolvedValue({ consumerTag: 'test-consumer' });
  channel.cancel.mockResolvedValue({ consumerTag: 'test-consumer' });
  return { channel, connection, connectionClose: (): void => close.callback() };
};
export const testBroker = (prefix: string): PublicationBrokerService => {
  const repository = mock<PublicationRepository>();
  repository.pending.mockResolvedValue([]);
  return new PublicationBrokerService(
    new ConfigService({
      RABBITMQ_URL: 'amqp://quotation_test:quotation_test@127.0.0.1:5678',
      WORKER_QUEUE_PREFIX: prefix,
    }),
    mock<PublicationService>(),
    repository,
    mock<PublicationExecutorService>(),
    mock<DatabaseTransactionService>(),
  );
};
export const spyOnBrokerConnect = (): jest.SpyInstance<
  ReturnType<typeof amqplib.connect>,
  Parameters<typeof amqplib.connect>
> => jest.spyOn(amqplib, 'connect');
