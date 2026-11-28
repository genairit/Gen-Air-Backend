import { randomUUID } from 'node:crypto';
import { TIME_UNITS } from '@Constants/time.constant';
import { EngineeringEstimateRepository } from './engineering-estimate.repository';
import { EmbeddedPostgresFixture } from '../../testing/embedded-postgres.fixture';

jest.setTimeout(TIME_UNITS.MINUTE_MS);

describe('engineering estimate project listing on PostgreSQL', () => {
  const postgres = new EmbeddedPostgresFixture([]);
  const projectId = randomUUID();
  const otherProjectId = randomUUID();
  const deletedProjectId = randomUUID();
  const actorId = randomUUID();
  const otherActorId = randomUUID();
  const base = {
    actorId,
    projectId,
    batchSize: 1,
    canReview: false,
    batchCursor: null,
    canReadProjects: true,
  };

  beforeAll(async () => {
    const database = await postgres.start();
    await database.query(`
      CREATE TABLE projects (id uuid PRIMARY KEY, deleted_at timestamptz);
      CREATE TABLE engineering_estimates (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text, project_id uuid, created_by_id uuid, updated_at timestamptz, version integer DEFAULT 1);
      CREATE TABLE engineering_estimate_revisions (estimate_id uuid, version integer, approved_at timestamptz);
    `);
    await database.query(
      'INSERT INTO projects VALUES ($projectId, NULL), ($otherProjectId, NULL), ($deletedProjectId, now())',
      { bind: { projectId, otherProjectId, deletedProjectId } },
    );
    await database.query(
      `INSERT INTO engineering_estimates (name, project_id, created_by_id, updated_at) VALUES
       ('old', $projectId, $actorId, '2026-11-01'), ('new', $projectId, $actorId, '2026-11-03'),
       ('colleague', $projectId, $otherActorId, '2026-11-02'), ('other', $otherProjectId, $actorId, '2026-11-04'),
       ('unassigned', NULL, $actorId, '2026-11-05'), ('deleted', $deletedProjectId, $actorId, '2026-11-06')`,
      {
        bind: {
          actorId,
          projectId,
          otherActorId,
          otherProjectId,
          deletedProjectId,
        },
      },
    );
  });

  afterAll(() => postgres.stop());

  it('paginates within the visible project bills', async () => {
    const repository = new EngineeringEstimateRepository(postgres.database());
    const first = await repository.list(base);
    expect(first.items.map((bill) => bill.name)).toEqual(['new']);
    expect(first.nextCursor).toEqual(expect.any(String));
    const next = await repository.list({
      ...base,
      batchCursor: first.nextCursor,
    });
    expect(next.items.map((bill) => bill.name)).toEqual(['old']);
    expect(next.nextCursor).toBeNull();
  });

  it('honors review and project access in scoped and legacy lists', async () => {
    const repository = new EngineeringEstimateRepository(postgres.database());
    const review = { ...base, batchSize: 10, canReview: true };
    const scoped = await repository.list(review);
    expect(scoped.items.map((bill) => bill.name)).toEqual([
      'new',
      'colleague',
      'old',
    ]);
    const inaccessible = await repository.list({
      ...review,
      canReadProjects: false,
    });
    expect(inaccessible.items).toEqual([]);
    const legacy = await repository.list({ ...review, projectId: null });
    expect(legacy.items.map((bill) => bill.name)).toEqual([
      'unassigned',
      'other',
      'new',
      'colleague',
      'old',
    ]);
  });
});
