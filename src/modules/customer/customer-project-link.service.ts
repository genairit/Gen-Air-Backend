import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import { Op } from 'sequelize';
import { Customer } from './entities/customer.entity';
import { Project } from '@Modules/project/entities/project.entity';
import { LinkCustomerProjectsDto } from './dto/link-customer-projects.dto';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

export interface ILinkableProject {
  id: string;
  name: string;
  code: string;
  customerId: string | null;
  parentProjectId: string | null;
  customer: { id: string; name: string } | null;
}

@Injectable()
export class CustomerProjectLinkService {
  constructor(private readonly transactions: DatabaseTransactionService) {}

  async search(
    customerId: string,
    search: string,
  ): Promise<ILinkableProject[]> {
    const customer = await Customer.findByPk(customerId);
    if (!customer) {
      throw new NotFoundException('Customer was not found');
    }

    const pattern = `%${search.trim().replace(/[\\%_]/g, '\\$&')}%`;
    const projects = await Project.findAll({
      where: {
        [Op.or]: [
          { name: { [Op.iLike]: pattern } },
          { code: { [Op.iLike]: pattern } },
          { customerApartment: { [Op.iLike]: pattern } },
        ],
      },
      include: [{ model: Customer, attributes: ['id', 'name'] }],
      order: [
        ['name', 'ASC'],
        ['id', 'ASC'],
      ],
      limit: 50,
    });
    return projects.map((project) => ({
      id: project.id,
      name: project.name,
      code: project.code,
      customerId: project.customerId,
      parentProjectId: project.parentProjectId,
      customer: project.customer
        ? { id: project.customer.id, name: project.customer.name }
        : null,
    }));
  }

  async link(
    customerId: string,
    input: LinkCustomerProjectsDto,
  ): Promise<void> {
    const ids = input.projects.map(({ projectId }) => projectId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Each project may be selected only once');
    }

    await this.transactions.run(async (transaction) => {
      const customer = await Customer.findByPk(customerId, { transaction });
      if (!customer) {
        throw new NotFoundException('Customer was not found');
      }

      for (const requested of [...input.projects].sort((a, b) =>
        a.projectId.localeCompare(b.projectId),
      )) {
        if (!Object.hasOwn(requested, 'expectedCustomerId')) {
          throw new BadRequestException(
            'Expected project customer is required',
          );
        }

        const project = await Project.findByPk(requested.projectId, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!project) {
          throw new NotFoundException(
            `Project ${requested.projectId} was not found`,
          );
        }

        if (project.customerId !== requested.expectedCustomerId) {
          throw new ConflictException(
            `Project ${requested.projectId} changed customer; reload and retry`,
          );
        }

        await project.update({ customerId }, { transaction });
      }
    });
  }
}
