import { randomUUID } from 'node:crypto';
import { getHttpErrorResponse } from '@Utilities/http-error.utility';
import { HTTP_ERROR_CODES } from '@Constants/http-error-code.constant';
import { TaskQuotationFixture } from './testing/task-quotation.fixture';

const fixture = new TaskQuotationFixture();
const { projectId, customerId, actor } = fixture;
const db = () => fixture.database();
const service = () => fixture.service();

beforeAll(async () => {
  await fixture.start();
  await fixture.installProjectGuard();
}, 30000);
beforeEach(() => fixture.reset());
afterAll(() => fixture.close());

it('blocks a project deletion or customer change only while a live primary quotation depends on it', async () => {
  const quotation = await service().create({ projectId, customerId }, actor);
  const projectEdit = (sql: string) =>
    db().query(sql, { bind: { projectId, newCustomer: randomUUID() } });
  await projectEdit(
    "UPDATE projects SET customer_id=customer_id,name='Changed' WHERE id=$projectId",
  );
  for (const update of ['deleted_at=now()', 'customer_id=$newCustomer']) {
    const result = await projectEdit(
      `UPDATE projects SET ${update} WHERE id=$projectId`,
    ).catch(getHttpErrorResponse);
    expect(result).toMatchObject({
      statusCode: 409,
      code: HTTP_ERROR_CODES.PROJECT_HAS_QUOTATIONS,
    });
  }
  const apartmentId = randomUUID();
  await db().query(
    'INSERT INTO projects(id,customer_id,parent_project_id) VALUES ($apartmentId,$customerId,$projectId);',
    { bind: { apartmentId, customerId, projectId } },
  );
  await db().query(
    'INSERT INTO quotation_projects(quotation_id,project_id,is_primary,created_at,updated_at) VALUES ($id,$apartmentId,false,now(),now())',
    { bind: { id: quotation.id, apartmentId } },
  );
  await db().query(
    'UPDATE projects SET deleted_at=now() WHERE id=$apartmentId',
    { bind: { apartmentId } },
  );
  await service().delete(
    quotation.id,
    { version: quotation.version },
    actor.id,
  );
  await projectEdit('UPDATE projects SET deleted_at=now() WHERE id=$projectId');
  await db().query('UPDATE projects SET deleted_at=NULL WHERE id=$projectId', {
    bind: { projectId },
  });
});

it('serializes a new quotation and a competing project archive in both directions', async () => {
  const current = service();
  const archive = 'UPDATE projects SET deleted_at=now() WHERE id=$projectId';
  await db().transaction(async (writer) => {
    await current.createDraft({ projectId, customerId }, actor, writer);
    await expect(
      db().transaction(async (editor) => {
        await db().query("SET LOCAL lock_timeout='250ms'", {
          transaction: editor,
        });
        await db().query(archive, { transaction: editor, bind: { projectId } });
      }),
    ).rejects.toMatchObject({ original: { code: '55P03' } });
  });
  expect(
    await db()
      .query(archive, { bind: { projectId } })
      .catch(getHttpErrorResponse),
  ).toMatchObject({ statusCode: 409 });

  await fixture.reset();
  await db().transaction(async (editor) => {
    await db().query(archive, { bind: { projectId }, transaction: editor });
    await expect(
      db().transaction(async (writer) => {
        await db().query("SET LOCAL lock_timeout='250ms'", {
          transaction: writer,
        });
        await current.createDraft({ projectId, customerId }, actor, writer);
      }),
    ).rejects.toMatchObject({ original: { code: '55P03' } });
  });
  await expect(
    current.create({ projectId, customerId }, actor),
  ).rejects.toMatchObject({ status: 404 });
  expect((await db().query('SELECT id FROM quotations'))[0]).toEqual([]);
});
