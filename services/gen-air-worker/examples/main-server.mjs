import amqp from 'amqplib';
import { randomUUID } from 'node:crypto';
import { TIME } from '../dist/constants/time.constant.js';
import { setTimeout as delay } from 'node:timers/promises';
import { WORKER } from '../dist/constants/worker.constant.js';
import { ConfirmedPublisher } from '../dist/infrastructure/confirmed-publisher.js';

const DEMO = { POLL_INTERVAL_MS: TIME.SECOND_MS / 10 };

const url = process.env.RABBITMQ_URL;
if (!url) {
  throw new Error('Set RABBITMQ_URL for the local demo broker');
}

const connection = await amqp.connect(url);
connection.on('error', () =>
  process.stderr.write('Demo broker connection failed\n'),
);
try {
  const channel = await connection.createConfirmChannel();
  channel.on('error', () =>
    process.stderr.write('Demo broker channel failed\n'),
  );
  const prefix = process.env.WORKER_QUEUE_PREFIX ?? 'genair.worker.v1';
  const jobsQueue = `${prefix}.jobs`;
  const resultsQueue = `${prefix}.results`;
  await channel.checkQueue(jobsQueue);
  await channel.checkQueue(resultsQueue);
  const job = {
    version: WORKER.VERSION,
    jobId: randomUUID(),
    tenantId: 'demo-tenant',
    jobType: WORKER.JOB_TYPE,
    attempt: 1,
    payload: {
      headers: ['Apartment', 'Issue'],
      rows: [
        ['12', 'Missing customer phone'],
        ['27', 'Duplicate apartment'],
      ],
    },
  };
  await new ConfirmedPublisher(channel).publish(jobsQueue, job);
  process.stdout.write(`Queued ${job.jobId}\n`);
  const deadline = Date.now() + WORKER.JOB_TIMEOUT_MS * WORKER.MAX_ATTEMPTS;
  const received = { complete: false };
  while (!received.complete && Date.now() < deadline) {
    const message = await channel.get(resultsQueue, { noAck: false });
    if (!message) {
      await delay(DEMO.POLL_INTERVAL_MS);
      continue;
    }

    const result = JSON.parse(message.content.toString('utf8'));
    const matchesJob =
      result.jobId === job.jobId && result.tenantId === job.tenantId;
    if (!matchesJob) {
      channel.nack(message, false, true);
      throw new Error(
        'Use a dedicated demo queue prefix; another job result was encountered',
      );
    }

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    channel.ack(message);
    received.complete = true;
  }

  if (!received.complete) {
    throw new Error('No result received before demo deadline');
  }
} finally {
  await connection.close();
}
