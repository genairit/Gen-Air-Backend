import 'reflect-metadata';
import amqp from 'amqplib';
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { WORKER } from '../dist/constants/worker.constant.js';
import { QueueService } from '../dist/modules/worker/queue.service.js';

const createBroker = () => {
  const events = [];
  const channel = new EventEmitter();
  const connection = new EventEmitter();
  const state = { consume: null };
  channel.assertQueue = async (queue, options) => {
    events.push({ type: 'declare', queue, options });
  };
  channel.prefetch = async (count) => {
    events.push({ type: 'prefetch', count });
  };
  channel.consume = async (queue, consume, options) => {
    state.consume = consume;
    events.push({ type: 'consume', queue, options });
    return { consumerTag: 'consumer-1' };
  };
  channel.cancel = async (tag) => {
    events.push({ type: 'cancel', tag });
  };
  channel.ack = (message) => {
    events.push({ type: 'ack', message });
  };
  channel.sendToQueue = (queue, content, options, confirm) => {
    events.push({ type: 'publish', queue, content, options, confirm });
    return true;
  };
  connection.createConfirmChannel = async () => channel;
  connection.close = async () => {
    events.push({ type: 'close' });
    connection.emit('close');
  };
  return { events, channel, connection, state };
};
const createService = (context, worker) => {
  const broker = createBroker();
  const connect = context.mock.method(
    amqp,
    'connect',
    async () => broker.connection,
  );
  const settings = {
    RABBITMQ_URL: 'amqp://localhost:5672',
    WORKER_QUEUE_PREFIX: 'test.worker',
    WORKER_PREFETCH: 2,
  };
  const service = new QueueService(
    { getOrThrow: (key) => settings[key] },
    worker,
  );
  return { ...broker, service, connect };
};
const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

test('queue initialization declares durable quorum topology, bounded prefetch and manual acknowledgments', async (context) => {
  const fixture = createService(context, { process: async () => {} });
  assert.equal(fixture.service.isReady(), false);
  await fixture.service.onModuleInit();
  assert.equal(fixture.service.isReady(), true);
  const [url, options] = fixture.connect.mock.calls[0].arguments;
  assert.equal(
    new URL(url).searchParams.get('heartbeat'),
    String(WORKER.HEARTBEAT_SECONDS),
  );
  assert.equal(options.timeout, WORKER.PUBLISH_TIMEOUT_MS);
  const declarations = fixture.events.filter(({ type }) => type === 'declare');
  assert.deepEqual(
    declarations.map(({ queue }) => queue),
    ['test.worker.failures', 'test.worker.results', 'test.worker.jobs'],
  );
  declarations.forEach(({ options: queueOptions }) => {
    assert.equal(queueOptions.durable, true);
    assert.equal(queueOptions.arguments['x-queue-type'], 'quorum');
    assert.equal(queueOptions.arguments['x-overflow'], 'reject-publish');
    assert.equal(
      queueOptions.arguments['x-max-length-bytes'],
      64 * 1024 * 1024,
    );
  });
  assert.equal(declarations[0].options.arguments['x-delivery-limit'], -1);
  assert.equal(declarations[1].options.arguments['x-delivery-limit'], -1);
  assert.equal(declarations[2].options.arguments['x-delivery-limit'], 10);
  assert.equal(
    declarations[2].options.arguments['x-dead-letter-strategy'],
    'at-least-once',
  );
  assert.equal(declarations[2].options.arguments['x-dead-letter-exchange'], '');
  assert.equal(
    declarations[2].options.arguments['x-dead-letter-routing-key'],
    'test.worker.failures',
  );
  assert.deepEqual(fixture.events.slice(-2), [
    { type: 'prefetch', count: 2 },
    { type: 'consume', queue: 'test.worker.jobs', options: { noAck: false } },
  ]);
  await fixture.service.onApplicationShutdown();
});

['connection', 'channel'].forEach((target) => {
  ['error', 'close'].forEach((event) => {
    test(`${target} ${event} clears readiness and signals failure`, async (context) => {
      const fixture = createService(context, { process: async () => {} });
      await fixture.service.onModuleInit();
      fixture[target].emit(event, new Error('broker failure'));
      await fixture.service.waitForFailure();
      assert.equal(fixture.service.isReady(), false);
      await fixture.service.onApplicationShutdown();
    });
  });
});

test('broker consumer cancellation clears readiness and signals failure', async (context) => {
  const fixture = createService(context, {
    process: async () => assert.fail('cancelled consumer executed'),
  });
  await fixture.service.onModuleInit();
  fixture.state.consume(null);
  await fixture.service.waitForFailure();
  assert.equal(fixture.service.isReady(), false);
  await fixture.service.onApplicationShutdown();
});

test('failed confirmed publication signals failure without acknowledging delivery', async (context) => {
  const fixture = createService(context, {
    process: async (content, transport) => {
      assert.equal(content.toString(), 'job');
      await transport.publishResult({ jobId: 'job-1' });
      transport.acknowledge();
    },
  });
  await fixture.service.onModuleInit();
  fixture.state.consume({ content: Buffer.from('job') });
  const publication = fixture.events.find(({ type }) => type === 'publish');
  assert.equal(publication.queue, 'test.worker.results');
  publication.confirm(new Error('nack'));
  await fixture.service.waitForFailure();
  assert.equal(fixture.service.isReady(), false);
  assert.equal(
    fixture.events.some(({ type }) => type === 'ack'),
    false,
  );
  await fixture.service.onApplicationShutdown();
});

test('shutdown cancels consumption, drains active work, then closes connection', async (context) => {
  const completed = Promise.withResolvers();
  const fixture = createService(context, {
    process: async (content, transport) => {
      await completed.promise;
      transport.acknowledge();
    },
  });
  await fixture.service.onModuleInit();
  const delivery = { content: Buffer.from('job') };
  fixture.state.consume(delivery);
  const shutdown = fixture.service.onApplicationShutdown();
  await flushPromises();
  assert.equal(fixture.service.isReady(), false);
  assert.deepEqual(fixture.events.at(-1), {
    type: 'cancel',
    tag: 'consumer-1',
  });
  assert.equal(
    fixture.events.some(({ type }) => type === 'close'),
    false,
  );
  completed.resolve();
  await shutdown;
  assert.deepEqual(fixture.events.slice(-3), [
    { type: 'cancel', tag: 'consumer-1' },
    { type: 'ack', message: delivery },
    { type: 'close' },
  ]);
});

['cancel', 'close'].forEach((operation) => {
  test(`shutdown watchdog exits when broker ${operation} never settles`, async (context) => {
    context.mock.timers.enable({ apis: ['setTimeout'] });
    const exit = context.mock.method(process, 'exit', () => {});
    const blocked = Promise.withResolvers();
    const fixture = createService(context, { process: async () => {} });
    await fixture.service.onModuleInit();
    const target =
      operation === 'cancel' ? fixture.channel : fixture.connection;
    context.mock.method(target, operation, () => blocked.promise);
    const shutdown = fixture.service.onApplicationShutdown();
    await flushPromises();
    context.mock.timers.tick(WORKER.SHUTDOWN_TIMEOUT_MS - 1);
    assert.equal(exit.mock.callCount(), 0);
    context.mock.timers.tick(1);
    assert.equal(exit.mock.callCount(), 1);
    assert.deepEqual(exit.mock.calls[0].arguments, [1]);
    blocked.resolve();
    await shutdown;
  });
});

test('connection initialization failure rejects and leaves readiness false', async (context) => {
  const fixture = createService(context, { process: async () => {} });
  fixture.connect.mock.mockImplementation(async () => {
    throw new Error('connection refused');
  });
  await assert.rejects(fixture.service.onModuleInit(), /connection refused/);
  assert.equal(fixture.service.isReady(), false);
  assert.deepEqual(fixture.events, []);
  await fixture.service.onApplicationShutdown();
});

test('shutdown watchdog also covers an active job that never drains', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const exit = context.mock.method(process, 'exit', () => {});
  const blocked = Promise.withResolvers();
  const fixture = createService(context, { process: () => blocked.promise });
  await fixture.service.onModuleInit();
  fixture.state.consume({ content: Buffer.from('job') });
  const shutdown = fixture.service.onApplicationShutdown();
  await flushPromises();
  context.mock.timers.tick(WORKER.SHUTDOWN_TIMEOUT_MS);
  assert.deepEqual(exit.mock.calls[0].arguments, [1]);
  assert.equal(
    fixture.events.some(({ type }) => type === 'ack'),
    false,
  );
  blocked.resolve();
  await shutdown;
});

test('successful shutdown clears its forced-exit watchdog', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const exit = context.mock.method(process, 'exit', () => {});
  const fixture = createService(context, { process: async () => {} });
  await fixture.service.onModuleInit();
  await fixture.service.onApplicationShutdown();
  context.mock.timers.tick(WORKER.SHUTDOWN_TIMEOUT_MS);
  assert.equal(exit.mock.callCount(), 0);
});
