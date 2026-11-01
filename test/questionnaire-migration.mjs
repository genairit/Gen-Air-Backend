import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const MIGRATION_URL = new URL(
  '../migrations/2026-11-01-questionnaire-persistence.sql',
  import.meta.url,
);
const QUESTIONNAIRE_ID = 'ef1cfdf2-b4cc-5be3-8e4a-6a4634e2ba9c';
const ORIGINAL_ANSWER = '  שלום\n עולם 💨  ';
const ANSWERS = Array.from({ length: 7 }, (_, index) => ({
  questionKey: `answer${index + 1}`,
  value: index === 0 ? ORIGINAL_ANSWER : '',
}));
const INSERT_SUBMISSION = `
  INSERT INTO questionnaire_submissions
    (questionnaire_id, request_id, full_name, role, department, answers)
  VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
`;
const INSERT_SECOND_VERSION = `
  INSERT INTO questionnaires
    (slug, version, title, introduction, definition, accepting_responses)
  SELECT slug, 2, title, introduction, definition, true FROM questionnaires
`;
const INVALID_ANSWERS = [
  {
    name: 'missing question',
    answers: ANSWERS.slice(1),
    error: /exactly once/,
  },
  {
    name: 'duplicate question',
    answers: ANSWERS.map((answer) => ({ ...answer, questionKey: 'answer1' })),
    error: /exactly once/,
  },
  {
    name: 'unknown question',
    answers: ANSWERS.map((answer) => ({
      ...answer,
      questionKey:
        answer.questionKey === 'answer1' ? 'unexpected' : answer.questionKey,
    })),
    error: /does not match/,
  },
  {
    name: 'blank answer collection',
    answers: ANSWERS.map((answer) => ({ ...answer, value: ' \n\t' })),
    error: /At least one/,
  },
  {
    name: 'oversized answer',
    answers: ANSWERS.map((answer) => ({ ...answer, value: 'x'.repeat(4001) })),
    error: /does not match/,
  },
  {
    name: 'object instead of text',
    answers: ANSWERS.map((answer) => ({
      ...answer,
      value: { text: 'unexpected' },
    })),
    error: /does not match/,
  },
  {
    name: 'object instead of array',
    answers: { answer1: 'unexpected' },
    error: /must be an array/,
  },
];

await test('questionnaire migration against isolated in-memory PostgreSQL', async (suite) => {
  const database = new PGlite();
  suite.after(async () => database.close());
  await database.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
  `);
  await database.exec(await readFile(MIGRATION_URL, 'utf8'));
  const insert = (answers, requestId) =>
    database.query(INSERT_SUBMISSION, [
      QUESTIONNAIRE_ID,
      requestId,
      '  כפיר  ',
      'פיתוח',
      'תוכנה',
      JSON.stringify(answers),
    ]);

  await suite.test(
    'seeds one inactive immutable version with exact field keys and limits',
    async () => {
      const { rows } = await database.query('SELECT * FROM questionnaires');
      assert.equal(rows.length, 1);
      const questionnaire = rows[0];
      assert.equal(questionnaire.id, QUESTIONNAIRE_ID);
      assert.equal(questionnaire.slug, 'genair-workflow');
      assert.equal(questionnaire.version, 1);
      assert.equal(questionnaire.accepting_responses, false);
      assert.deepEqual(
        questionnaire.definition.map((field) => field.key),
        [
          'fullName',
          'role',
          'department',
          ...ANSWERS.map((answer) => answer.questionKey),
        ],
      );
      assert(
        questionnaire.definition
          .slice(0, 3)
          .every((field) => field.required && field.maxLength === 200),
      );
      assert(
        questionnaire.definition
          .slice(3)
          .every((field) => !field.required && field.maxLength === 4000),
      );
    },
  );

  await suite.test(
    'round-trips all original Unicode, spaces and line breaks without rewriting',
    async () => {
      const {
        rows: [submission],
      } = await insert(ANSWERS, 'c2c6e744-c4cd-4d18-a3c3-2120ef0358f0');
      assert.deepEqual(submission.answers, ANSWERS);
      assert.equal(submission.full_name, '  כפיר  ');
    },
  );

  await suite.test(
    'prevents modification/deletion while allowing explicit questionnaire activation',
    async () => {
      await assert.rejects(
        database.exec("UPDATE questionnaires SET title = 'other'"),
        /immutable/,
      );
      await assert.rejects(
        database.exec('DELETE FROM questionnaires'),
        /cannot be deleted/,
      );
      await database.exec(
        'UPDATE questionnaires SET accepting_responses = true',
      );
      await assert.rejects(
        database.exec(
          "UPDATE questionnaire_submissions SET full_name = 'changed'",
        ),
        /append-only/,
      );
      await assert.rejects(
        database.exec('DELETE FROM questionnaire_submissions'),
        /append-only/,
      );
    },
  );

  await suite.test(
    'enforces unique request identities and one accepting version per slug',
    async () => {
      await assert.rejects(
        insert(ANSWERS, 'c2c6e744-c4cd-4d18-a3c3-2120ef0358f0'),
        /unique/,
      );
      await assert.rejects(database.exec(INSERT_SECOND_VERSION), /unique/);
    },
  );

  for (const [index, invalid] of INVALID_ANSWERS.entries()) {
    await suite.test(`rejects ${invalid.name}`, async () => {
      const requestId = `c2c6e744-c4cd-4d18-a3c3-2120ef0358f${index + 1}`;
      await assert.rejects(insert(invalid.answers, requestId), invalid.error);
    });
  }

  await suite.test(
    'enables RLS and revokes anonymous/authenticated grants inherited from defaults',
    async () => {
      const { rows } = await database.query(`
      SELECT relname, relrowsecurity FROM pg_class
      WHERE relname IN ('questionnaires', 'questionnaire_submissions')
    `);
      assert.equal(rows.length, 2);
      assert(rows.every((table) => table.relrowsecurity));
      for (const role of ['anon', 'authenticated']) {
        await database.exec(`SET ROLE ${role}`);
        await assert.rejects(
          database.query('SELECT * FROM questionnaire_submissions'),
          /permission denied/,
        );
        await assert.rejects(
          database.query('SELECT * FROM questionnaires'),
          /permission denied/,
        );
        await database.exec('RESET ROLE');
      }
    },
  );
});
