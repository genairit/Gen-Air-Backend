import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';

import {
  ITask,
  TTaskLink,
  ITaskCounts,
  ITaskFilter,
  TTaskLinkInput,
  ITaskUrgentEvent,
  TTaskUpdateAttributes,
} from './interfaces/task.interface';

import {
  isTaskLinkRequested,
  resolveTaskCustomerId,
} from './utilities/task-link.utility';

import { Transaction } from 'sequelize';
import { TaskRepository } from './task.repository';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { UserService } from '@Modules/user/user.service';
import { USER_ROLES } from '@Constants/user-role.constant';
import { TASK_TYPES } from './constants/task-type.constant';
import { GetTasksByFilterDto } from './dto/get-by-filter.dto';
import { isDueDateBeforeToday } from '@Utilities/date.utility';
import { ICursorPage } from '@Interfaces/cursor-page.interface';
import { toCursorBatch } from '@Utilities/cursor-batch.utility';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { ProjectService } from '@Modules/project/project.service';
import { DOMAIN_EVENTS } from '@Constants/domain-events.constant';
import { TaskStatusType } from './constants/task-status.constant';
import { assertPermissions } from '@Utilities/permission.utility';
import { isProtectedTaskType } from './utilities/task-type.utility';
import { findChangedAssigneeId } from './utilities/task-assignee.utility';
import { EMPTY_TASK_STATUS_COUNTS } from './constants/task-status.constant';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { TaskStatusTransitionRepository } from './task-status-transition.repository';
import { ITaskStatusTransition } from './interfaces/task-status-transition.interface';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

@Injectable()
export class TaskService {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly taskStatusTransitionRepository: TaskStatusTransitionRepository,
    private readonly projectService: ProjectService,
    private readonly userService: UserService,
    private readonly transactions: DatabaseTransactionService,
    private readonly events: EventEmitter2,
  ) {}

  getById(id: string): Promise<ITask> {
    return this.requireDetailedTask(id);
  }

  getByFilter(filter: GetTasksByFilterDto): Promise<ICursorPage<ITask>> {
    const scopedFilter: ITaskFilter = {
      search: filter.search ?? null,
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
    user: IAuthorizedUser,
  ): Promise<ICursorPage<ITask>> {
    return this.getByFilter({ ...filter, assigneeId: user.id });
  }

  async claim(id: string, user: IAuthorizedUser): Promise<ITask> {
    assertPermissions(user, PERMISSIONS.TASKS_CLAIM);
    await this.assertAssignableEngineer(user.id);
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
      return this.requireDetailedTask(id, transaction);
    });
  }

  async getCounts(filter: GetTasksByFilterDto): Promise<ITaskCounts> {
    const rows = await this.taskRepository.countByFilter({
      search: null,
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

  async create(input: CreateTaskDto, creator: IAuthorizedUser): Promise<ITask> {
    assertPermissions(creator, PERMISSIONS.TASKS_CREATE);
    if (input.assigneeId != null) {
      assertPermissions(creator, PERMISSIONS.TASKS_ASSIGN);
    }

    if (input.taskType != null && input.taskType !== TASK_TYPES.GENERAL) {
      throw new BadRequestException(
        'Quotation and planning tasks are created automatically with a project',
      );
    }
    this.assertDueDateNotPast(input.dueDate ?? null);

    const link = this.requireTaskLink(input);

    await Promise.all([
      this.assertLinkExists(link),
      this.assertAssignableEngineer(input.assigneeId ?? null),
    ]);

    const createdId = await this.transactions.run(async (transaction) => {
      const created = await this.taskRepository.create(
        {
          taskType: TASK_TYPES.GENERAL,
          title: input.title.trim(),
          ...link,
          createdById: creator.id,
          assigneeId: input.assigneeId ?? null,
          description: input.description.trim(),
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
        },
        transaction,
      );

      await this.taskStatusTransitionRepository.create(
        {
          taskId: created.id,
          fromStatus: null,
          toStatus: created.status,
          changedById: creator.id,
        },
        transaction,
      );

      return created.id;
    });

    return this.requireDetailedTask(createdId);
  }

  async update(
    id: string,
    input: UpdateTaskDto,
    user: IAuthorizedUser,
  ): Promise<ITask> {
    assertPermissions(user, PERMISSIONS.TASKS_UPDATE);
    if ('assigneeId' in input) {
      assertPermissions(user, PERMISSIONS.TASKS_ASSIGN);
    }

    this.assertDueDateNotPast(input.dueDate ?? null);
    const link = isTaskLinkRequested(input)
      ? this.requireTaskLink(input)
      : null;

    return this.transactions.run(async (transaction) => {
      const task = await this.requireTask(id, transaction);
      this.assertTaskTypeUnchanged(task, input);
      this.assertProtectedLinkUnchanged(task, link);
      await Promise.all([
        this.assertLinkExists(link),
        this.assertAssignableEngineer(findChangedAssigneeId(task, input)),
      ]);
      const attributes: TTaskUpdateAttributes = {
        ...('title' in input && { title: input.title?.trim() }),
        ...link,
        ...('assigneeId' in input && { assigneeId: input.assigneeId ?? null }),
        ...(input.description && { description: input.description.trim() }),
        ...('dueDate' in input && {
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
        }),
      };
      await this.taskRepository.update(id, attributes, transaction);

      return this.requireDetailedTask(id, transaction);
    });
  }

  async updateStatus(
    id: string,
    status: TaskStatusType,
    user: IAuthorizedUser,
  ): Promise<ITask> {
    assertPermissions(user, PERMISSIONS.TASKS_STATUS_UPDATE);

    return this.transactions.run(async (transaction) => {
      const task = await this.requireTask(id, transaction);

      if (task.status === status) {
        return this.requireDetailedTask(id, transaction);
      }

      await this.taskRepository.update(id, { status }, transaction);
      await this.taskStatusTransitionRepository.create(
        {
          taskId: id,
          toStatus: status,
          changedById: user.id,
          fromStatus: task.status,
        },
        transaction,
      );

      return this.requireDetailedTask(id, transaction);
    });
  }

  async getStatusTransitions(id: string): Promise<ITaskStatusTransition[]> {
    await this.requireTask(id);

    return this.taskStatusTransitionRepository.findByTask(id);
  }

  async updateUrgency(
    id: string,
    isUrgent: boolean,
    user: IAuthorizedUser,
  ): Promise<ITask> {
    assertPermissions(user, PERMISSIONS.TASKS_URGENCY_CHANGE);
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
      const task = await this.requireDetailedTask(id, transaction);

      return { task, becameUrgent };
    });
    if (result.becameUrgent) {
      const event: ITaskUrgentEvent = {
        taskId: result.task.id,
        projectId: result.task.projectId,
        customerId: resolveTaskCustomerId(result.task),
        assigneeId: result.task.assigneeId,
        changedById: user.id,
      };
      await this.events.emitAsync(DOMAIN_EVENTS.TASK_BECAME_URGENT, event);
    }
    return result.task;
  }

  async delete(id: string, user: IAuthorizedUser): Promise<void> {
    assertPermissions(user, PERMISSIONS.TASKS_DELETE);
    await this.transactions.run(async (transaction) => {
      const task = await this.requireTask(id, transaction);
      if (isProtectedTaskType(task.taskType)) {
        throw new ConflictException(
          'Automatic quotation and planning tasks cannot be deleted',
        );
      }
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

  private async requireDetailedTask(
    id: string,
    transaction?: Transaction,
  ): Promise<ITask> {
    const task = await this.taskRepository.findDetailedById(id, transaction);

    if (!task) {
      throw new NotFoundException(`Task ${id} was not found`);
    }

    return task;
  }

  private assertDueDateNotPast(dueDate: string | null): void {
    if (!dueDate) {
      return;
    }

    if (isDueDateBeforeToday(dueDate)) {
      throw new BadRequestException('Task due date cannot be in the past');
    }
  }

  private requireTaskLink(input: TTaskLinkInput): TTaskLink {
    if (!input.projectId || input.customerId != null) {
      throw new BadRequestException(
        'A task must belong to a project; its customer is resolved through the project',
      );
    }
    return { projectId: input.projectId, customerId: null };
  }

  private assertTaskTypeUnchanged(task: ITask, input: UpdateTaskDto): void {
    if (input.taskType != null && input.taskType !== task.taskType) {
      throw new BadRequestException('Task type cannot be changed');
    }
  }

  private assertProtectedLinkUnchanged(
    task: ITask,
    link: TTaskLink | null,
  ): void {
    const isChanged = link !== null && link.projectId !== task.projectId;
    if (isProtectedTaskType(task.taskType) && isChanged) {
      throw new ConflictException(
        'Automatic project tasks cannot move to another project',
      );
    }
  }

  private async assertLinkExists(link: TTaskLink | null): Promise<void> {
    if (link?.projectId) {
      await this.projectService.getById(link.projectId);
    }
  }

  private async assertAssignableEngineer(
    assigneeId: string | null,
  ): Promise<void> {
    if (!assigneeId) {
      return;
    }

    const assignee = await this.userService.getById(assigneeId);

    if (assignee.role !== USER_ROLES.ENGINEER) {
      throw new BadRequestException(
        'Tasks can be assigned only to engineering employees',
      );
    }
  }
}
