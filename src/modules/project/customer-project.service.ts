import {
  ICustomerProjectPage,
  ICustomerProjectScope,
} from './interfaces/customer-project.interface';

import {
  decodeCustomerProjectCursor,
  encodeCustomerProjectCursor,
} from './utilities/customer-project-cursor.utility';

import { Injectable, BadRequestException } from '@nestjs/common';
import { CustomerService } from '@Modules/customer/customer.service';
import { GetCustomerProjectsDto } from './dto/get-customer-projects.dto';
import { CustomerProjectRepository } from './customer-project.repository';
import { toCustomerProjectItem } from './utilities/customer-project.utility';
import { toProjectStageCounts } from './utilities/project-stage-counts.utility';
import { CUSTOMER_PROJECT_PAGINATION } from './constants/customer-project.constant';

@Injectable()
export class CustomerProjectService {
  constructor(
    private readonly customers: CustomerService,
    private readonly projects: CustomerProjectRepository,
  ) {}

  async getPage(
    customerId: string,
    filter: GetCustomerProjectsDto,
  ): Promise<ICustomerProjectPage> {
    await this.customers.getById(customerId);
    const scope: ICustomerProjectScope = {
      customerId,
      search: filter.search?.trim() ?? '',
      stageId: filter.stageId ?? null,
    };
    const cursor = filter.batchCursor
      ? decodeCustomerProjectCursor(filter.batchCursor, scope)
      : null;
    if (filter.batchCursor && !cursor) {
      throw new BadRequestException(
        'Invalid or mismatched customer project cursor',
      );
    }

    const defaultSize = cursor
      ? CUSTOMER_PROJECT_PAGINATION.NEXT_SIZE
      : CUSTOMER_PROJECT_PAGINATION.INITIAL_SIZE;
    const size = filter.batchSize ?? defaultSize;
    const [rows, grouped, total] = await Promise.all([
      this.projects.findPage(scope, { size, cursor }),
      this.projects.countByStage(scope),
      this.projects.countAll(scope),
    ]);
    const selected = rows.slice(0, size);
    const last = selected.at(-1);
    const nextCursor =
      rows.length > size && last
        ? encodeCustomerProjectCursor({
            ...scope,
            id: last.id,
            name: last.name,
            updatedAt: last.updatedAt,
          })
        : null;

    return {
      total,
      nextCursor,
      items: selected.map(toCustomerProjectItem),
      counts: toProjectStageCounts(grouped),
    };
  }
}
