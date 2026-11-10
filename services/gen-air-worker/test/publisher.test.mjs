import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { WORKER } from '../dist/constants/worker.constant.js';
import { ConfirmedPublisher } from '../dist/infrastructure/confirmed-publisher.js';

const createChannel = () => {
  const channel = new EventEmitter();
  channel.publications = [];
  channel.sendToQueue = (queue, content, options, confirm) => {
    channel.publications.push({ queue, content, options, confirm });
    return true;
  };
  return channel;
};

test('publisher requires a broker confirm and sets durable mandatory options', async () => {
  const channel = createChannel();
  const publisher = new ConfirmedPublisher(channel);
  const state = { completed: false };
  const operation = publisher
    .publish('results', { jobId: 'job-1' })
    .then(() => {
      state.completed = true;
    });
  await Promise.resolve();
  assert.equal(state.completed, false);
  const publication = channel.publications[0];
  assert.equal(publication.queue, 'results');
  assert.deepEqual(JSON.parse(publication.content), { jobId: 'job-1' });
  assert.equal(publication.options.mandatory, true);
  assert.equal(publication.options.persistent, true);
  assert.equal(publication.options.contentType, WORKER.CONTENT_TYPE);
  assert.equal(typeof publication.options.messageId, 'string');
  publication.confirm(null);
  await operation;
  assert.equal(state.completed, true);
});

test('publisher rejects mandatory returns even when broker subsequently confirms', async () => {
  const channel = createChannel();
  const operation = new ConfirmedPublisher(channel).publish('missing', {});
  const publication = channel.publications[0];
  const rejected = assert.rejects(operation, /unroutable/);
  channel.emit('return', { properties: publication.options });
  publication.confirm(null);
  await rejected;
});

test('publisher rejects broker nacks', async () => {
  const channel = createChannel();
  const operation = new ConfirmedPublisher(channel).publish('results', {});
  const rejected = assert.rejects(operation, /rejected publication/);
  channel.publications[0].confirm(new Error('nack'));
  await rejected;
});

test('publisher correlates returned messages across concurrent publications', async () => {
  const channel = createChannel();
  const publisher = new ConfirmedPublisher(channel);
  const first = publisher.publish('first', {});
  const second = publisher.publish('second', {});
  const rejected = assert.rejects(first, /unroutable/);
  channel.emit('return', { properties: channel.publications[0].options });
  channel.publications[1].confirm(null);
  await Promise.all([rejected, second]);
});

test('publisher times out without a confirm and rejects oversized payloads', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const channel = createChannel();
  const publisher = new ConfirmedPublisher(channel);
  const rejected = assert.rejects(
    publisher.publish('results', {}),
    /timed out/,
  );
  context.mock.timers.tick(WORKER.PUBLISH_TIMEOUT_MS);
  await rejected;
  await assert.rejects(
    publisher.publish('results', {
      value: 'x'.repeat(WORKER.MAX_RESULT_BYTES + WORKER.MAX_MESSAGE_BYTES),
    }),
    /publication limit/,
  );
  assert.equal(channel.publications.length, 1);
});
