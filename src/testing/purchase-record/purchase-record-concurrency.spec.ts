import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { mock } from 'jest-mock-extended';
import { execFile } from 'node:child_process';
import { Sequelize } from 'sequelize-typescript';
import { ConflictException } from '@nestjs/common';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { PERMISSIONS } from '@Constants/authorization.constant';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { ProjectBoqService } from '@Modules/project-boq/project-boq.service';
import { PurchaseRecordService } from '@Modules/purchase-record/purchase-record.service';
import { PurchaseRecord } from '@Modules/purchase-record/entities/purchase-record.entity';
import type { IProjectBoqView } from '@Modules/project-boq/interfaces/project-boq.interface';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import { PurchaseRecordRepository } from '@Modules/purchase-record/purchase-record.repository';
import { PurchaseRecordLine } from '@Modules/purchase-record/entities/purchase-record-line.entity';
import { PurchaseRecordEvent } from '@Modules/purchase-record/entities/purchase-record-event.entity';
import { PurchaseRecordCorrection } from '@Modules/purchase-record/entities/purchase-record-correction.entity';

const executeFile = promisify(execFile);
const binaries = resolve(
  process.cwd(),
  'node_modules',
  '@embedded-postgres',
  `${process.platform}-${process.arch}`,
  'native',
  'bin',
);

const freePort = async (): Promise<number> => {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (!address || typeof address === 'string') {
    throw new Error('No database port');
  }
  return address.port;
};

describe('purchase quantity serialization on PostgreSQL', () => {
  it('allows only one of two simultaneous claims for the last allocation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'purchase-race-'));
    const port = await freePort();
    const projectId = randomUUID();
    const actorId = randomUUID();
    const materialId = randomUUID();
    const boqLineId = randomUUID();
    const sequelize = new Sequelize({
      dialect: 'postgres',
      host: '127.0.0.1',
      port,
      username: 'postgres',
      password: '',
      database: 'postgres',
      logging: false,
      define: { underscored: true, timestamps: true },
      pool: { max: 4, min: 0 },
      models: [
        PurchaseRecord,
        PurchaseRecordLine,
        PurchaseRecordEvent,
        PurchaseRecordCorrection,
      ],
    });
    try {
      await executeFile(resolve(binaries, 'initdb'), [
        '-D',
        directory,
        '-U',
        'postgres',
        '--auth=trust',
      ]);
      await executeFile(resolve(binaries, 'pg_ctl'), [
        '-D',
        directory,
        '-o',
        `-h 127.0.0.1 -p ${port}`,
        '-l',
        resolve(directory, 'postgres.log'),
        '-w',
        'start',
      ]);
      await sequelize.query(`
        CREATE TABLE projects (id uuid PRIMARY KEY);
        CREATE TABLE users (id uuid PRIMARY KEY);
        CREATE TABLE materials (id uuid PRIMARY KEY);
        INSERT INTO projects VALUES ('${projectId}');
        INSERT INTO users VALUES ('${actorId}');
        INSERT INTO materials VALUES ('${materialId}');
      `);
      const migration = await readFile(
        resolve(
          process.cwd(),
          'migrations/2026-11-17-purchase-record-ledger.sql',
        ),
        'utf8',
      );
      await sequelize.query(migration);
      const transactions = new DatabaseTransactionService(sequelize);
      const boq = mock<ProjectBoqService>();
      boq.get.mockResolvedValue(
        mock<IProjectBoqView>({
          projectId,
          revision: 1,
          lines: [
            {
              id: boqLineId,
              sourceKey: 'material:concurrent',
              requiredQuantity: '10',
              reviewState: 'confirmed',
              materialId,
              materialName: 'Pipe',
              materialUnit: 'm',
              materialCategory: 'Pipe',
            },
          ],
        }),
      );
      const user = mock<IAuthorizedUser>({
        id: actorId,
        permissions: [PERMISSIONS.PURCHASE_REQUESTS_REVIEW],
      });
      const service = new PurchaseRecordService(
        new PurchaseRecordRepository(),
        boq,
        transactions,
      );
      const claim = () =>
        service.request(
          projectId,
          {
            idempotencyKey: randomUUID(),
            lines: [{ boqLineId, quantity: '7' }],
          },
          user,
        );
      const results = await Promise.allSettled([claim(), claim()]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1);
      const rejected = results.find((result) => result.status === 'rejected');
      expect(rejected?.status === 'rejected' && rejected.reason).toBeInstanceOf(
        ConflictException,
      );
      const workspace = await service.workspace(projectId);
      expect(workspace.lines[0].requestedQuantity).toBe('7.00000000');
      expect(workspace.lines[0].remainingQuantity).toBe('3.00000000');
    } finally {
      await sequelize.close();
      await executeFile(resolve(binaries, 'pg_ctl'), [
        '-D',
        directory,
        '-m',
        'fast',
        '-w',
        'stop',
      ]);
      await rm(directory, { recursive: true, force: true });
    }
  }, 30000);
});
