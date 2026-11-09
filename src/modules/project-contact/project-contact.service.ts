import { Injectable, NotFoundException } from '@nestjs/common';
import { Project } from '@Modules/project/entities/project.entity';
import { LinkProjectContactDto } from './dto/link-project-contact.dto';
import { ProjectContactLink } from './entities/project-contact-link.entity';
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
