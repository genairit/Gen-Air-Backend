import {
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import { Transaction } from 'sequelize';
import { ProjectContactService } from './project-contact.service';
import { Project } from '@Modules/project/entities/project.entity';
import { ProjectContactLink } from './entities/project-contact-link.entity';
import { CustomerContact } from '@Modules/customer-contact/entities/customer-contact.entity';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

const IDS = {
  PROJECT: '11111111-1111-4111-8111-111111111111',
  CONTACT: '22222222-2222-4222-8222-222222222222',
} as const;

const setup = () => {
  const transaction = { LOCK: { UPDATE: 'UPDATE' } } as Transaction;
  const transactions = {
    run: jest.fn((work: (value: Transaction) => Promise<unknown>) =>
      work(transaction),
    ),
  } as DatabaseTransactionService;
  const service = new ProjectContactService(transactions);
  const project = jest
    .spyOn(Project, 'findByPk')
    .mockResolvedValue({ id: IDS.PROJECT } as Project);
  const contact = jest
    .spyOn(CustomerContact, 'findByPk')
    .mockResolvedValue({ id: IDS.CONTACT } as CustomerContact);
  const findLink = jest
    .spyOn(ProjectContactLink, 'findOne')
    .mockResolvedValue(null);
  const updateLinks = jest
    .spyOn(ProjectContactLink, 'update')
    .mockResolvedValue([1]);
  const createLink = jest
    .spyOn(ProjectContactLink, 'create')
    .mockResolvedValue({});
  const links = jest.spyOn(ProjectContactLink, 'findAll').mockResolvedValue([]);
  return {
    service,
    project,
    contact,
    findLink,
    updateLinks,
    createLink,
    links,
    transaction,
  };
};

describe('ProjectContactService fixed role assignment', () => {
  afterEach(() => jest.restoreAllMocks());

  it('replaces the slot atomically without deleting the former link or changing primary state', async () => {
    const context = setup();
    await expect(
      context.service.setRole(IDS.PROJECT, 'architect', IDS.CONTACT),
    ).resolves.toEqual([]);
    expect(context.project).toHaveBeenCalledWith(IDS.PROJECT, {
      transaction: context.transaction,
      lock: context.transaction.LOCK.UPDATE,
    });
    expect(context.updateLinks).toHaveBeenCalledWith(
      { role: null },
      {
        where: { projectId: IDS.PROJECT, role: 'architect' },
        transaction: context.transaction,
      },
    );
    expect(context.createLink).toHaveBeenCalledWith(
      {
        projectId: IDS.PROJECT,
        contactId: IDS.CONTACT,
        role: 'architect',
        isPrimary: false,
      },
      { transaction: context.transaction },
    );
  });

  it('clears a slot without creating or deleting a directory contact', async () => {
    const context = setup();
    await context.service.setRole(IDS.PROJECT, 'consultant', null);
    expect(context.contact).not.toHaveBeenCalled();
    expect(context.createLink).not.toHaveBeenCalled();
    expect(context.updateLinks).toHaveBeenCalledWith(
      { role: null },
      {
        where: { projectId: IDS.PROJECT, role: 'consultant' },
        transaction: context.transaction,
      },
    );
  });

  it('reuses an existing assigned contact idempotently and preserves its primary flag', async () => {
    const context = setup();
    const update = jest.fn().mockResolvedValue(null);
    context.findLink.mockResolvedValue({
      role: 'architect',
      isPrimary: true,
      update,
    } as Partial<ProjectContactLink> as ProjectContactLink);
    await context.service.setRole(IDS.PROJECT, 'architect', IDS.CONTACT);
    expect(update).toHaveBeenCalledWith(
      { role: 'architect' },
      { transaction: context.transaction },
    );
    expect(context.createLink).not.toHaveBeenCalled();
  });

  it('refuses to take a contact from a different named slot', async () => {
    const context = setup();
    context.findLink.mockResolvedValue({
      role: 'consultant',
    } as ProjectContactLink);
    await expect(
      context.service.setRole(IDS.PROJECT, 'architect', IDS.CONTACT),
    ).rejects.toThrow(ConflictException);
    expect(context.updateLinks).not.toHaveBeenCalled();
    expect(context.createLink).not.toHaveBeenCalled();
  });

  it('rejects unknown roles before opening a transaction', async () => {
    const context = setup();
    await expect(
      context.service.setRole(IDS.PROJECT, 'engineer', IDS.CONTACT),
    ).rejects.toThrow(BadRequestException);
    expect(context.project).not.toHaveBeenCalled();
  });

  it('preserves the current slot when the project or target contact does not exist', async () => {
    const context = setup();
    context.contact.mockResolvedValue(null);
    await expect(
      context.service.setRole(IDS.PROJECT, 'architect', IDS.CONTACT),
    ).rejects.toThrow(NotFoundException);
    expect(context.updateLinks).not.toHaveBeenCalled();
    context.project.mockResolvedValue(null);
    await expect(
      context.service.setRole(IDS.PROJECT, 'architect', null),
    ).rejects.toThrow(NotFoundException);
  });

  it('prevents the generic link endpoint from overwriting an occupied fixed slot', async () => {
    const context = setup();
    context.findLink.mockResolvedValue({
      role: 'architect',
    } as ProjectContactLink);
    await expect(
      context.service.link(IDS.PROJECT, {
        contactId: IDS.CONTACT,
        role: 'architect',
      }),
    ).rejects.toThrow(ConflictException);
    expect(context.updateLinks).not.toHaveBeenCalled();
    expect(context.createLink).not.toHaveBeenCalled();
  });
});
