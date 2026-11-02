import { BadRequestException, ConflictException } from '@nestjs/common';
import { TASK_TYPES } from '@Modules/task/constants/task-type.constant';
import { TASK_STATUSES } from '@Modules/task/constants/task-status.constant';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { QuotationExecutionEmailService } from './quotation-execution-email.service';
import { QUOTATION_EMAIL_STATUS } from './constants/quotation-execution-email.constant';
import type { SendQuotationExecutionEmailDto } from './dto/send-quotation-execution-email.dto';

const input: SendQuotationExecutionEmailDto = {
  requestId: 'f29c0715-5a7a-45f9-841a-845d4f1f4627',
  recipientContactIds: ['fa7626f2-f6ae-42fa-a901-2f184bd4ffeb'],
  architectContactId: 'fa7626f2-f6ae-42fa-a901-2f184bd4ffeb',
  planVersion: '03',
  planFileId: 'plan-file',
  zipFileId: 'zip-file',
};
const actor = {
  id: 'f613fa13-a05b-4cce-af39-7e95311a4e75',
  firstName: 'Dana',
  lastName: 'Levi',
  email: 'dana@example.test',
} as IAuthorizedUser;

const setup = () => {
  const task = {
    id: 'task-id',
    taskType: TASK_TYPES.QUOTATION,
    status: TASK_STATUSES.PROPOSAL_SENT,
    projectId: 'project-id',
    project: { customer: { id: 'customer-id' } },
    customerId: null,
  };
  let record: Record<string, unknown> | null = null;
  const tasks = { getById: jest.fn().mockResolvedValue(task) };
  const taskRepository = { findById: jest.fn().mockResolvedValue(task) };
  const projects = {
    getById: jest.fn().mockResolvedValue({
      id: 'project-id',
      name: 'Project',
      parentProjectId: null,
      customerApartment: '12',
    }),
  };
  const contacts = {
    list: jest.fn().mockResolvedValue([
      {
        id: input.architectContactId,
        name: 'Architect',
        role: 'Architect',
        email: 'architect@example.test',
      },
    ]),
  };
  const drive = {
    readProjectAttachment: jest
      .fn()
      .mockResolvedValueOnce({
        name: 'plan.pdf',
        mimeType: 'application/pdf',
        content: Buffer.from('pdf'),
      })
      .mockResolvedValueOnce({
        name: 'plans.zip',
        mimeType: 'application/zip',
        content: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x61]),
      }),
  };
  const transactions = {
    run: jest.fn((work: (transaction: object) => Promise<unknown>) => work({})),
    lockKey: jest.fn().mockResolvedValue(undefined),
  };
  const records = {
    findByTaskId: jest.fn(() => Promise.resolve(record)),
    create: jest.fn((values: Record<string, unknown>) => {
      record = { ...values, updatedAt: new Date() };
      return Promise.resolve(record);
    }),
    update: jest.fn((_taskId: string, values: Record<string, unknown>) => {
      record = { ...record, ...values, updatedAt: new Date() };
      return Promise.resolve();
    }),
  };
  const transport = {
    assertReady: jest.fn(),
    send: jest.fn().mockResolvedValue('<sent@example.test>'),
  };
  const service = new QuotationExecutionEmailService(
    tasks as never,
    taskRepository as never,
    projects as never,
    contacts as never,
    drive as never,
    transactions as never,
    records as never,
    transport,
  );
  return {
    service,
    tasks,
    task,
    drive,
    transport,
    records,
    getRecord: () => record,
  };
};

describe('QuotationExecutionEmailService', () => {
  it('does not send while reading optional completion context', async () => {
    const { service, transport } = setup();
    const context = await service.getContext('task-id');
    expect(context.apartmentNumber).toBe('12');
    expect(context.contacts).toHaveLength(1);
    expect(transport.send).not.toHaveBeenCalled();
  });

  it('sends exactly the chosen plan and ZIP once and records the receipt', async () => {
    const { service, transport, records, drive } = setup();
    const receipt = await service.send('task-id', input, actor);
    expect(receipt?.status).toBe(QUOTATION_EMAIL_STATUS.SENT);
    expect(drive.readProjectAttachment).toHaveBeenNthCalledWith(
      1,
      'project-id',
      'plan-file',
      expect.any(Number),
    );
    expect(drive.readProjectAttachment).toHaveBeenNthCalledWith(
      2,
      'project-id',
      'zip-file',
      expect.any(Number),
    );
    expect(transport.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['architect@example.test'],
        attachments: [
          expect.objectContaining({ filename: 'plan.pdf' }),
          expect.objectContaining({ filename: 'plans.zip' }),
        ],
      }),
    );
    expect(records.create).toHaveBeenCalledTimes(1);
    const repeat = await service.send('task-id', input, actor);
    expect(repeat?.status).toBe(QUOTATION_EMAIL_STATUS.SENT);
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it('rejects a recipient outside the linked customer', async () => {
    const { service, transport } = setup();
    await expect(
      service.send(
        'task-id',
        {
          ...input,
          recipientContactIds: [input.architectContactId, 'other-id'],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transport.send).not.toHaveBeenCalled();
  });

  it('marks an attachment preparation failure as retryable without sending', async () => {
    const { service, drive, transport, getRecord } = setup();
    drive.readProjectAttachment
      .mockReset()
      .mockRejectedValue(
        new BadRequestException('File is outside this project'),
      );
    await expect(service.send('task-id', input, actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(getRecord()?.status).toBe(QUOTATION_EMAIL_STATUS.FAILED);
    expect(transport.send).not.toHaveBeenCalled();
  });

  it('blocks an automatic retry after uncertain delivery', async () => {
    const { service, transport, getRecord } = setup();
    transport.send.mockRejectedValue(new Error('Connection lost'));
    await expect(service.send('task-id', input, actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(getRecord()?.status).toBe(QUOTATION_EMAIL_STATUS.UNCERTAIN);
    await expect(
      service.send(
        'task-id',
        { ...input, requestId: '2cd1ac16-4b80-4d0e-a4ca-012bfbfbdc21' },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transport.send).toHaveBeenCalledTimes(1);
  });
});
