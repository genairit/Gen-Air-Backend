import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';

import { Op, Transaction } from 'sequelize';
import { Project } from '@Modules/project/entities/project.entity';
import { LinkProjectContactDto } from './dto/link-project-contact.dto';
import { ProjectContactLink } from './entities/project-contact-link.entity';
import { isProjectContactRole } from './utilities/project-contact-role.utility';
import { CustomerContact } from '@Modules/customer-contact/entities/customer-contact.entity';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

@Injectable()
export class ProjectContactService {
  constructor(private readonly transactions: DatabaseTransactionService) {}

  async list(projectId: string): Promise<ProjectContactLink[]> {
    const project = await Project.findByPk(projectId);
    if (!project) {
      throw new NotFoundException('Project was not found');
    }

    return ProjectContactLink.findAll({
      where: { projectId },
      include: [CustomerContact],
      order: [
        ['isPrimary', 'DESC'],
        ['createdAt', 'ASC'],
      ],
    });
  }

  async link(
    projectId: string,
    input: LinkProjectContactDto,
  ): Promise<ProjectContactLink> {
    return this.transactions.run(async (transaction) => {
      const project = await Project.findByPk(projectId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const contact = await CustomerContact.findByPk(input.contactId, {
        transaction,
      });
      if (!project || !contact) {
        throw new NotFoundException('Project or contact was not found');
      }

      await this.assertAvailableRole(
        projectId,
        input.contactId,
        input.role ?? null,
        transaction,
      );

      if (input.isPrimary) {
        await ProjectContactLink.update(
          { isPrimary: false },
          { where: { projectId, isPrimary: true }, transaction },
        );
      }

      const existing = await ProjectContactLink.findOne({
        where: { projectId, contactId: input.contactId },
        transaction,
      });
      if (existing) {
        await existing.update(
          {
            role: input.role ?? null,
            isPrimary: input.isPrimary ?? existing.isPrimary,
          },
          { transaction },
        );
      } else {
        await ProjectContactLink.create(
          {
            projectId,
            contactId: input.contactId,
            role: input.role ?? null,
            isPrimary: input.isPrimary ?? false,
          },
          { transaction },
        );
      }

      const linked = await ProjectContactLink.findOne({
        where: { projectId, contactId: input.contactId },
        include: [CustomerContact],
        transaction,
      });
      if (!linked) {
        throw new NotFoundException('Project contact link was not found');
      }
      return linked;
    });
  }

  async setRole(
    projectId: string,
    role: string,
    contactId: string | null,
  ): Promise<ProjectContactLink[]> {
    if (!isProjectContactRole(role)) {
      throw new BadRequestException('Unknown project contact role');
    }

    return this.transactions.run(async (transaction) => {
      const project = await Project.findByPk(projectId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!project) {
        throw new NotFoundException('Project was not found');
      }

      const target = await this.findRoleContact(
        projectId,
        contactId,
        role,
        transaction,
      );
      const displacedContacts = contactId
        ? { projectId, role, contactId: { [Op.ne]: contactId } }
        : { projectId, role };
      await ProjectContactLink.update(
        { role: null },
        { where: displacedContacts, transaction },
      );
      if (target) {
        await target.update({ role }, { transaction });
      }

      if (contactId && !target) {
        await ProjectContactLink.create(
          { projectId, contactId, role, isPrimary: false },
          { transaction },
        );
      }

      return ProjectContactLink.findAll({
        where: { projectId },
        include: [CustomerContact],
        order: [['createdAt', 'ASC']],
        transaction,
      });
    });
  }

  private async findRoleContact(
    projectId: string,
    contactId: string | null,
    role: string,
    transaction: Transaction,
  ): Promise<ProjectContactLink | null> {
    if (!contactId) {
      return null;
    }

    const contact = await CustomerContact.findByPk(contactId, { transaction });
    if (!contact) {
      throw new NotFoundException('Contact was not found');
    }

    const target = await ProjectContactLink.findOne({
      where: { projectId, contactId },
      transaction,
    });
    const hasAnotherSlot =
      isProjectContactRole(target?.role) && target?.role !== role;
    if (hasAnotherSlot) {
      throw new ConflictException(
        'Contact already fills another project contact role',
      );
    }

    return target;
  }

  private async assertAvailableRole(
    projectId: string,
    contactId: string,
    role: string | null,
    transaction: Transaction,
  ): Promise<void> {
    if (!isProjectContactRole(role)) {
      return;
    }

    const occupied = await ProjectContactLink.findOne({
      where: { projectId, role, contactId: { [Op.ne]: contactId } },
      transaction,
    });
    if (occupied) {
      throw new ConflictException(
        'Project contact role is occupied; replace it explicitly',
      );
    }

    await this.findRoleContact(projectId, contactId, role, transaction);
  }

  async unlink(projectId: string, contactId: string): Promise<void> {
    await this.transactions.run(async (transaction) => {
      const project = await Project.findByPk(projectId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!project) {
        throw new NotFoundException('Project was not found');
      }

      const removed = await ProjectContactLink.destroy({
        where: { projectId, contactId },
        transaction,
      });
      if (!removed) {
        throw new NotFoundException('Project contact link was not found');
      }
    });
  }
}
