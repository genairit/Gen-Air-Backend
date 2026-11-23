import { spawn } from 'node:child_process';
import { TIME_UNITS } from '@Constants/time.constant';

jest.setTimeout(30 * TIME_UNITS.SECOND_MS);

it('drains an active broker task through real Nest SIGTERM shutdown hooks', async (): Promise<void> => {
  const script = `
    const { Module } = require('@nestjs/common');
    const { NestFactory } = require('@nestjs/core');
    const { ConfigService } = require('@nestjs/config');
    const { PublicationBrokerService } = require('./src/modules/quotation-publication/publication-broker.service');
    const broker = new PublicationBrokerService(new ConfigService({}),{},
      {pending:()=>new Promise((done)=>setTimeout(()=>done([]),300))},{stop:()=>{}},{});
    const original = broker.beforeApplicationShutdown.bind(broker);
    broker.beforeApplicationShutdown=async()=>{await original();process.stdout.write('DRAINED\\n');};
    class TestModule {}
    Module({providers:[{provide:PublicationBrokerService,useValue:broker}]})(TestModule);
    (async()=>{
      const app=await NestFactory.createApplicationContext(TestModule,{logger:false});
      app.enableShutdownHooks();
      const active=broker.tick();
      process.stdout.write('READY\\n');
      await active;
      process.stdout.write('ACTIVE_DONE\\n');
    })().catch(()=>process.exit(2));
  `;
  const child = spawn(
    process.execPath,
    [
      '--require',
      'ts-node/register/transpile-only',
      '--require',
      'tsconfig-paths/register',
      '-e',
      script,
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, RABBITMQ_URL: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const output: string[] = [];
  const state = { signaled: false };
  const outcome = await new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((done, reject): void => {
    const deadline = setTimeout((): void => {
      child.kill('SIGKILL');
      reject(new Error('Shutdown child timed out'));
    }, 20 * TIME_UNITS.SECOND_MS);
    child.stdout.on('data', (chunk: Buffer): void => {
      output.push(chunk.toString());
      if (!state.signaled && output.join('').includes('READY')) {
        state.signaled = true;
        child.kill('SIGTERM');
      }
    });
    child.on('error', reject);
    child.on('exit', (code, signal): void => {
      clearTimeout(deadline);
      done({ code, signal });
    });
  });
  expect(outcome.signal).toBe('SIGTERM');
  expect(output.join('')).toContain('ACTIVE_DONE');
  expect(output.join('')).toContain('DRAINED');
});
