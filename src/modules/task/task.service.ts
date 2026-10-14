import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';

import {
  ITask,
  ITaskCounts,
  ITaskFilter,
  ITaskUrgentEvent,
  TTaskUpdateAttributes,
} from './interfaces/task.interface';

import { Transaction } from 'sequelize';
import { TaskRepository } from './task.repository';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { UserService } from '@Modules/user/user.service';
import { GetTasksByFilterDto } from './dto/get-by-filter.dto';
import { isDueDateBeforeToday } from '@Utilities/date.utility';
import { ICursorPage } from '@Interfaces/cursor-page.interface';
import { toCursorBatch } from '@Utilities/cursor-batch.utility';
import { ProjectService } from '@Modules/project/project.service';
import { DOMAIN_EVENTS } from '@Constants/domain-events.constant';
import { TaskStatusType } from './constants/task-status.constant';
import type { IUser } from '@Modules/user/interfaces/user.interface';
import { CustomerService } from '@Modules/customer/customer.service';
import { ROLE_PERMISSIONS } from '@Constants/authorization.constant';
import { EMPTY_TASK_STATUS_COUNTS } from './constants/task-status.constant';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

@Injectable()
export class TaskService {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly projectService: ProjectService,
    private readonly customerService: CustomerService,
    private readonly userService: UserService,
    private readonly transactions: DatabaseTransactionService,
    private readonly events: EventEmitter2,
  ) {}

  async getById(id: string): Promise<ITask> {
    const task = await this.requireTask(id);

    return task;
  }

  getByFilter(filter: GetTasksByFilterDto): Promise<ICursorPage<ITask>> {
    const scopedFilter: ITaskFilter = {
      projectId: filter.projectId ?? null,
      customerId: filter.customerId ?? null,
      status: filter.status ?? null,
      isUrgent: filter.isUrgent ?? null,
      assigneeId: filter.assigneeId ?? null,
      unassigned: filter.unassigned ?? null,
    };
    return this.taskRepository.findByFilter(
      scopedFilter,
      toCursorBatch(filter),
    );
  }

  getMyTasks(
    filter: GetTasksByFilterDto,
    user: IUser,
  ): Promise<ICursorPage<ITask>> {
    return this.getByFilter({ ...filter, assigneeId: user.id });
  }

  async claim(id: string, user: IUser): Promise<ITask> {
    return this.transactions.run(async (transaction) => {
      const task = await this.requireTask(id, transaction);
      if (task.assigneeId !== null) {
        throw new ConflictException('This task has already been assigned');
      }
      await this.taskRepository.update(
        id,
        { assigneeId: user.id },
        transaction,
      );
      return this.requireTask(id, transaction);
    });
  }

  async getCounts(filter: GetTasksByFilterDto): Promise<ITaskCounts> {
    const rows = await this.taskRepository.countByFilter({
      projectId: filter.projectId ?? null,
      customerId: filter.customerId ?? null,
      assigneeId: filter.assigneeId ?? null,
      unassigned: filter.unassigned ?? null,
      status: null,
      isUrgent: null,
    });
    return rows.reduce<ITaskCounts>(
      (counts, row) => ({
        total: counts.total + row.count,
        urgent: counts.urgent + (row.isUrgent ? row.count : 0),
        byStatus: {
          ...counts.byStatus,
          [row.status]: counts.byStatus[row.status] + row.count,
        },
      }),
      { total: 0, urgent: 0, byStatus: { ...EMPTY_TASK_STATUS_COUNTS } },
    );
  }

  async create(input: CreateTaskDto, creator: IUser): Promise<ITask> {
    this.assertManager(creator);
    if (isDueDateBeforeToday(input.dueDate)) {
      throw new BadRequestException('Task due date cannot be in the past');
    }
    await this.validateRelations(
      input.projectId,
      input.customerId,
      input.assigneeId ?? null,
    );
    return this.taskRepository.create({
      title: input.title.trim(),
      projectId: input.projectId,
      customerId: input.customerId,
      createdById: creator.id,
      assigneeId: input.assigneeId ?? null,
      description: input.description.trim(),
      dueDate: new Date(input.dueDate),
    });
  }

  async update(id: string, input: UpdateTaskDto, user: IUser): Promise<ITask> {
    this.assertManager(user);
    return this.transactions.run(async (transaction) => {
      const task = await this.requireTask(id, transaction);
      await this.validateRelations(
        input.projectId ?? task.projectId,
        input.customerId ?? task.customerId,
        'assigneeId' in input ? (input.assigneeId ?? null) : task.assigneeId,
      );
      const attributes: TTaskUpdateAttributes = {
        ...('title' in input && { title: input.title?.trim() }),
        ...('projectId' in input && { projectId: input.projectId }),
        ...('customerId' in input && { customerId: input.customerId }),
        ...('assigneeId' in input && { assigneeId: input.assigneeId ?? null }),
        ...('description' in input && {
          description: input.description ?? null,
        }),
        ...('dueDate' in input && {
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
        }),
      };
      await this.taskRepository.update(id, attributes, transaction);
      return this.requireTask(id, transaction);
    });
  }

  async updateStatus(id: string, status: TaskStatusType): Promise<ITask> {
    return this.transactions.run(async (transaction) => {
      await this.requireTask(id, transaction);
      await this.taskRepository.update(id, { status }, transaction);
      return this.requireTask(id, transaction);
    });
  }

  async updateUrgency(
    id: string,
    isUrgent: boolean,
    user: IUser,
  ): Promise<ITask> {
    this.assertManager(user);
    const result = await this.transactions.run(async (transaction) => {
      const previous = await this.requireTask(id, transaction);
      const becameUrgent = !previous.isUrgent && isUrgent;
      const audit = becameUrgent
        ? { urgencyMarkedById: user.id, urgencyMarkedAt: new Date() }
        : {};
      const clearedAudit = !isUrgent
        ? { urgencyMarkedById: null, urgencyMarkedAt: null }
        : {};
      await this.taskRepository.update(
        id,
        { isUrgent, ...audit, ...clearedAudit },
        transaction,
      );
      return { task: await this.requireTask(id, transaction), becameUrgent };
    });
    if (result.becameUrgent) {
      const event: ITaskUrgentEvent = {
        taskId: result.task.id,
        projectId: result.task.projectId,
        customerId: result.task.customerId,
        assigneeId: result.task.assigneeId,
        changedById: user.id,
      };
      await this.events.emitAsync(DOMAIN_EVENTS.TASK_BECAME_URGENT, event);
    }
    return result.task;
  }

  async delete(id: string, user: IUser): Promise<void> {
    this.assertManager(user);
    await this.transactions.run(async (transaction) => {
      await this.requireTask(id, transaction);
      await this.taskRepository.softDelete(id, transaction);
    });
  }

  private async requireTask(
    id: string,
    transaction?: Transaction,
  ): Promise<ITask> {
    const task = await this.taskRepository.findById(id, transaction);
    if (!task) {
      throw new NotFoundException(`Task ${id} was not found`);
    }
    return task;
  }

  private canManage(user: IUser): boolean {
    return ROLE_PERMISSIONS.MANAGE_TASKS.some((role) => role === user.role);
  }

  private assertManager(user: IUser): void {
    if (!this.canManage(user)) {
      throw new ForbiddenException('Only managers can manage tasks');
    }
  }

  private async validateRelations(
    projectId: string,
    customerId: string,
    assigneeId: string | null,
  ): Promise<void> {
    const [project] = await Promise.all([
      this.projectService.getById(projectId),
      this.customerService.getById(customerId),
      ...(assigneeId ? [this.userService.getById(assigneeId)] : []),
    ]);
    if (project.customerId && project.customerId !== customerId) {
      throw new BadRequestException(
        'Task customer must match the project customer',
      );
    }
  }
}
