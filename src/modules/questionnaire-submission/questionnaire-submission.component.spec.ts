import {
  IQuestionnaireSubmission,
  TQuestionnaireSubmissionCreation,
} from './interfaces/questionnaire-submission.interface';

import request from 'supertest';
import { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '@Guards/auth.guard';
import { AuthService } from '@Modules/auth/auth.service';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { QuestionnaireService } from '@Modules/questionnaire/questionnaire.service';
import { QuestionnaireSubmissionService } from './questionnaire-submission.service';
import { QuestionnaireController } from '@Modules/questionnaire/questionnaire.controller';
import { QuestionnaireRepository } from '@Modules/questionnaire/questionnaire.repository';
import { QuestionnaireSubmissionRepository } from './questionnaire-submission.repository';
import { QuestionnaireSubmissionController } from './questionnaire-submission.controller';
import { QuestionnaireLimitGuard } from '@Modules/questionnaire/questionnaire-limit.guard';
import { IQuestionnaire } from '@Modules/questionnaire/interfaces/questionnaire.interface';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

const questionnaire: IQuestionnaire = {
  id: 'ef1cfdf2-b4cc-5be3-8e4a-6a4634e2ba9c',
  slug: 'genair-workflow',
  version: 1,
  title: 'שאלון',
  introduction: 'בדיקה',
  acceptingResponses: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  definition: Array.from({ length: 7 }, (_, index) => ({
    key: `answer${index + 1}`,
    label: `שאלה ${index + 1}`,
    helpText: '',
    required: false,
    type: 'long-text',
    maxLength: 4000,
  })),
};
const payload = (): TQuestionnaireSubmissionCreation => ({
  questionnaireId: questionnaire.id,
  requestId: randomUUID(),
  fullName: ' ישראל ',
  role: 'מנהל',
  department: 'הנדסה',
  answers: questionnaire.definition.map((field) => ({
    questionKey: field.key,
    value: field.key === 'answer1' ? '  שורה ראשונה\nsecond 😀  ' : '',
  })),
});

describe('Public questionnaire HTTP boundary', () => {
  const previousClientSecret = process.env.QUESTIONNAIRE_CLIENT_SECRET ?? null;
  const state: {
    app: INestApplication<Server> | null;
    active: boolean;
    stored: IQuestionnaireSubmission | null;
  } = { app: null, active: true, stored: null };
  const authenticate = jest.fn();
  const repository = {
    findByRequestId: jest.fn(() => Promise.resolve(state.stored)),
    create: jest.fn((input: TQuestionnaireSubmissionCreation) => {
      state.stored = {
        ...input,
        id: randomUUID(),
        createdAt: new Date(),
      };
      return Promise.resolve(state.stored);
    }),
  };
  const transactions = {
    run: (work: (transaction: object) => Promise<unknown>) => work({}),
    lockKey: jest.fn(() => Promise.resolve()),
  };
  const server = (): Server => {
    if (!state.app) {
      throw new Error('Application unavailable');
    }
    return state.app.getHttpServer();
  };
  beforeAll(async () => {
    process.env.QUESTIONNAIRE_CLIENT_SECRET =
      'questionnaire-component-test-secret-at-least-32-chars';
    const module = await Test.createTestingModule({
      controllers: [QuestionnaireController, QuestionnaireSubmissionController],
      providers: [
        QuestionnaireService,
        QuestionnaireSubmissionService,
        QuestionnaireLimitGuard,
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: AuthService, useValue: { authenticate } },
        { provide: DatabaseTransactionService, useValue: transactions },
        { provide: QuestionnaireSubmissionRepository, useValue: repository },
        {
          provide: QuestionnaireRepository,
          useValue: {
            findActive: () =>
              Promise.resolve(state.active ? questionnaire : null),
            findById: (id: string) =>
              Promise.resolve(
                id === questionnaire.id
                  ? { ...questionnaire, acceptingResponses: state.active }
                  : null,
              ),
          },
        },
      ],
    }).compile();
    state.app = module.createNestApplication<INestApplication<Server>>();
    state.app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await state.app.init();
  });
  beforeEach(() => {
    state.stored = null;
    state.active = true;
    jest.clearAllMocks();
  });
  afterAll(async () => {
    await state.app?.close();
    if (previousClientSecret === null) {
      delete process.env.QUESTIONNAIRE_CLIENT_SECRET;
    } else {
      process.env.QUESTIONNAIRE_CLIENT_SECRET = previousClientSecret;
    }
  });
  it('serves only published questions without requiring credentials', async () => {
    const response = await request(server())
      .get('/questionnaire/genair-workflow')
      .expect(200);
    expect(response.body).toMatchObject({
      id: questionnaire.id,
      definition: questionnaire.definition,
    });
    expect(response.body).not.toHaveProperty('acceptingResponses');
    expect(authenticate).not.toHaveBeenCalled();
  });
  it('stores original text and returns only a receipt; a retry does not insert again', async () => {
    const input = payload();
    const first = await request(server())
      .post('/questionnaire-submission')
      .send(input)
      .expect(201);
    const repeat = await request(server())
      .post('/questionnaire-submission')
      .send(input)
      .expect(201);
    expect(first.body).toEqual(repeat.body);
    const receipt: unknown = first.body;
    if (typeof receipt !== 'object' || receipt === null) {
      throw new Error('Receipt is not an object');
    }
    expect(Object.keys(receipt).sort()).toEqual(['id', 'receivedAt']);
    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(state.stored?.answers[0].value).toBe(input.answers[0].value);
    expect(state.stored?.fullName).toBe(input.fullName);
  });
  it('normalizes UUID casing before locking and idempotency checks', async () => {
    const input = payload();
    const uppercase = {
      ...input,
      questionnaireId: input.questionnaireId.toUpperCase(),
      requestId: input.requestId.toUpperCase(),
    };
    const first = await request(server())
      .post('/questionnaire-submission')
      .send(uppercase)
      .expect(201);
    const repeated = await request(server())
      .post('/questionnaire-submission')
      .send(input)
      .expect(201);
    expect(repeated.body).toEqual(first.body);
    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(state.stored?.requestId).toBe(input.requestId);
  });

  it('conflicts when a request ID is reused with changed answers', async () => {
    const input = payload();
    await request(server())
      .post('/questionnaire-submission')
      .send(input)
      .expect(201);
    await request(server())
      .post('/questionnaire-submission')
      .send({ ...input, fullName: 'Other' })
      .expect(409);
    expect(repository.create).toHaveBeenCalledTimes(1);
  });
  it('accepts retry receipt after closure but rejects new submissions', async () => {
    const input = payload();
    await request(server())
      .post('/questionnaire-submission')
      .send(input)
      .expect(201);
    state.active = false;
    await request(server())
      .post('/questionnaire-submission')
      .send(input)
      .expect(201);
    state.stored = null;
    await request(server())
      .post('/questionnaire-submission')
      .send(payload())
      .expect(404);
    await request(server()).get('/questionnaire/genair-workflow').expect(404);
  });
  it.each([
    'unknown',
    'duplicate',
    'empty',
    'missing',
    'oversized',
    'non-string',
    'extra',
    'blank-identity',
    'bad-version',
  ])('rejects %s input without persisting', async (kind) => {
    const input = payload();
    const variants: Record<string, object> = {
      unknown: {
        ...input,
        answers: input.answers.map((a, i) =>
          i === 0 ? { ...a, questionKey: 'unknown' } : a,
        ),
      },
      duplicate: {
        ...input,
        answers: input.answers.map((a, i) => (i === 1 ? input.answers[0] : a)),
      },
      empty: {
        ...input,
        answers: input.answers.map((a) => ({ ...a, value: '   ' })),
      },
      missing: { ...input, answers: input.answers.slice(1) },
      oversized: {
        ...input,
        answers: input.answers.map((a, i) =>
          i === 0 ? { ...a, value: 'x'.repeat(4001) } : a,
        ),
      },
      'non-string': {
        ...input,
        answers: input.answers.map((a, i) =>
          i === 0 ? { ...a, value: { bad: 'value' } } : a,
        ),
      },
      extra: { ...input, admin: true },
      'blank-identity': { ...input, fullName: '   ' },
      'bad-version': { ...input, questionnaireId: 'invalid' },
    };
    await request(server())
      .post('/questionnaire-submission')
      .send(variants[kind])
      .expect(400);
    expect(repository.create).not.toHaveBeenCalled();
  });
  it('does not expose submission lists, individual responses, or questionnaire edits', async () => {
    await request(server()).get('/questionnaire-submission').expect(404);
    await request(server())
      .get(`/questionnaire-submission/${randomUUID()}`)
      .expect(404);
    await request(server())
      .put('/questionnaire/genair-workflow')
      .send({ title: 'changed' })
      .expect(404);
  });
});
