import 'reflect-metadata';
import test from 'node:test';
import { Module } from '@nestjs/common';
import assert from 'node:assert/strict';
import { NestFactory } from '@nestjs/core';
import { QueueService } from '../dist/modules/worker/queue.service.js';
import { WorkerController } from '../dist/modules/worker/worker.controller.js';

test('HTTP health routes report liveness and broker readiness independently', async (context) => {
  const state = { ready: false };
  class HealthTestModule {}
  Module({
    controllers: [WorkerController],
    providers: [
      { provide: QueueService, useValue: { isReady: () => state.ready } },
    ],
  })(HealthTestModule);
  const app = await NestFactory.create(HealthTestModule, { logger: false });
  context.after(() => app.close());
  await app.listen(0, '127.0.0.1');
  const baseUrl = await app.getUrl();
  const live = await fetch(`${baseUrl}/health/live`);
  assert.equal(live.status, 200);
  assert.deepEqual(await live.json(), { status: 'ok' });
  assert.equal((await fetch(`${baseUrl}/health/ready`)).status, 503);
  state.ready = true;
  const ready = await fetch(`${baseUrl}/health/ready`);
  assert.equal(ready.status, 200);
  assert.deepEqual(await ready.json(), { status: 'ready' });
  state.ready = false;
  assert.equal((await fetch(`${baseUrl}/health/ready`)).status, 503);
});
