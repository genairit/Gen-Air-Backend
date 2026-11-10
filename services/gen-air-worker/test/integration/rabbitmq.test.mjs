import 'reflect-metadata';
import amqp from 'amqplib';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { setTimeout as delay } from 'node:timers/promises';
import { TIME } from '../../dist/constants/time.constant.js';
import { WORKER } from '../../dist/constants/worker.constant.js';
import { ConfirmedPublisher } from '../../dist/infrastructure/confirmed-publisher.js';

const INTEGRATION = { POLL_INTERVAL_MS: TIME.SECOND_MS / 40 };

const broker = process.env.TEST_RABBITMQ_URL;
if (
  !broker ||
  !['localhost', '127.0.0.1', '[::1]'].includes(new URL(broker).hostname)
) {
  throw new Error(
    'TEST_RABBITMQ_URL must point to a disposable localhost RabbitMQ 4.1+ broker',
  );
}

const receive = async (channel, queue) => {
  const deadline = Date.now() + 10 * WORKER.PUBLISH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const message = await channel.get(queue, { noAck: false });
    if (message) {
      const value = JSON.parse(message.content.toString('utf8'));
      channel.ack(message);
      return value;
    }

    await delay(INTEGRATION.POLL_INTERVAL_MS);
  }

  throw new Error(`Timed out waiting for ${queue}`);
};

test('real RabbitMQ: durable jobs, duplicate-safe output, invalid jobs and health', async () => {
  const prefix = `genair.worker.integration.${randomUUID()}`;
  Object.assign(process.env, {
    RABBITMQ_URL: broker,
    WORKER_QUEUE_PREFIX: prefix,
    WORKER_PREFETCH: '1',
    PORT: '3001',
  });
  const { AppModule } = await import('../../dist/app.module.js');
  const app = await NestFactory.create(AppModule, { logger: false });
  const connection = await amqp.connect(broker);
  connection.on('error', () => assert.fail('Test broker connection failed'));
  const channel = await connection.createConfirmChannel();
  channel.on('error', () => assert.fail('Test broker channel failed'));
  try {
    await app.listen(0, '127.0.0.1');
    const address = await app.getUrl();
    const publisher = new ConfirmedPublisher(channel);
    const job = {
      version: WORKER.VERSION,
      jobId: randomUUID(),
      tenantId: 'integration-tenant',
      jobType: WORKER.JOB_TYPE,
      attempt: 1,
      payload: {
        headers: ['Apartment', 'Issue'],
        rows: [['12', 'Missing phone']],
      },
    };
    await publisher.publish(`${prefix}.jobs`, job);
    const first = await receive(channel, `${prefix}.results`);
    assert.equal(first.status, 'succeeded');
    assert.equal(first.jobId, job.jobId);
    assert.equal(first.tenantId, job.tenantId);
    assert.match(first.output.csv, /Missing phone/);
    await publisher.publish(`${prefix}.jobs`, job);
    const duplicate = await receive(channel, `${prefix}.results`);
    assert.deepEqual(duplicate.output, first.output);

    await publisher.publish(`${prefix}.jobs`, {
      ...job,
      jobId: randomUUID(),
      payload: {},
    });
    assert.equal(
      (await receive(channel, `${prefix}.results`)).status,
      'failed',
    );
    assert.equal(
      (await receive(channel, `${prefix}.failures`)).result.error,
      'INVALID_JOB',
    );
    await publisher.publish(`${prefix}.jobs`, { unexpected: 'input' });
    assert.equal(
      (await receive(channel, `${prefix}.failures`)).error,
      'INVALID_JOB',
    );

    const largeJob = {
      ...job,
      jobId: randomUUID(),
      payload: {
        headers: ['Apartment', 'Issue'],
        rows: Array.from({ length: 2500 }, (_, index) => [
          String(index),
          'x'.repeat(250),
        ]),
      },
    };
    await publisher.publish(`${prefix}.jobs`, largeJob);
    const started = performance.now();
    const health = await fetch(`${address}/health/ready`);
    assert.equal(health.status, 200);
    const healthMs = performance.now() - started;
    assert.ok(
      healthMs < WORKER.PUBLISH_TIMEOUT_MS,
      'Worker health must respond during report generation',
    );
    assert.equal(
      (await receive(channel, `${prefix}.results`)).output.rowCount,
      2500,
    );
    process.stdout.write(
      `Worker readiness under 2,500-row export: ${healthMs.toFixed(1)} ms\n`,
    );
  } finally {
    await app.close();
    await Promise.all(
      ['jobs', 'results', 'failures'].map((name) =>
        channel.deleteQueue(`${prefix}.${name}`),
      ),
    );
    await connection.close();
  }
});
