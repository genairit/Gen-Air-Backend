import {
  Get,
  Body,
  Post,
  Param,
  Patch,
  Query,
  Delete,
  HttpCode,
  HttpStatus,
  Controller,
  ParseUUIDPipe,
} from '@nestjs/common';

import { TaskService } from './task.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { GetTasksByFilterDto } from './dto/get-by-filter.dto';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { ICursorPage } from '@Interfaces/cursor-page.interface';
import { ITask, ITaskCounts } from './interfaces/task.interface';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { UpdateTaskUrgencyDto } from './dto/update-task-urgency.dto';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { AuthenticatedUser } from '@Decorators/authenticated-user.decorator';
import { RequirePermissions } from '@Decorators/require-permissions.decorator';
import { ITaskStatusTransition } from './interfaces/task-status-transition.interface';

@ApiTags('task')
@ApiBearerAuth()
@Controller('task')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}
  @Get()
  @RequirePermissions(PERMISSIONS.TASKS_READ)
  getByFilter(
    @Query() filter: GetTasksByFilterDto,
  ): Promise<ICursorPage<ITask>> {
    return this.taskService.getByFilter(filter);
  }
  @Get('my-tasks')
  @RequirePermissions(PERMISSIONS.TASKS_READ)
  getMyTasks(
    @Query() filter: GetTasksByFilterDto,
    @AuthenticatedUser() user: IAuthorizedUser,
  ): Promise<ICursorPage<ITask>> {
    return this.taskService.getMyTasks(filter, user);
  }
  @Get('counts')
  @RequirePermissions(PERMISSIONS.TASKS_READ)
  getCounts(@Query() filter: GetTasksByFilterDto): Promise<ITaskCounts> {
    return this.taskService.getCounts(filter);
  }
  @Get('my-tasks/counts')
  @RequirePermissions(PERMISSIONS.TASKS_READ)
  getMyCounts(
    @Query() filter: GetTasksByFilterDto,
    @AuthenticatedUser() user: IAuthorizedUser,
  ): Promise<ITaskCounts> {
    return this.taskService.getCounts({ ...filter, assigneeId: user.id });
  }
  @Patch(':id/claim')
  @RequirePermissions(PERMISSIONS.TASKS_CLAIM)
  claim(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthenticatedUser() user: IAuthorizedUser,
  ): Promise<ITask> {
    return this.taskService.claim(id, user);
  }
  @Get(':id')
  @RequirePermissions(PERMISSIONS.TASKS_READ)
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<ITask> {
    return this.taskService.getById(id);
  }
  @Post()
  @RequirePermissions(PERMISSIONS.TASKS_CREATE)
  create(
    @Body() input: CreateTaskDto,
    @AuthenticatedUser() user: IAuthorizedUser,
  ): Promise<ITask> {
    return this.taskService.create(input, user);
  }
  @Patch(':id/status')
  @RequirePermissions(PERMISSIONS.TASKS_STATUS_UPDATE)
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateTaskStatusDto,
    @AuthenticatedUser() user: IAuthorizedUser,
  ): Promise<ITask> {
    return this.taskService.updateStatus(id, input.status, user);
  }

  @Get(':id/transitions')
  @RequirePermissions(PERMISSIONS.TASKS_READ)
  getStatusTransitions(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ITaskStatusTransition[]> {
    return this.taskService.getStatusTransitions(id);
  }
  @Patch(':id/urgency')
  @RequirePermissions(PERMISSIONS.TASKS_URGENCY_CHANGE)
  updateUrgency(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateTaskUrgencyDto,
    @AuthenticatedUser() user: IAuthorizedUser,
  ): Promise<ITask> {
    return this.taskService.updateUrgency(id, input.isUrgent, user);
  }
  @Patch(':id')
  @RequirePermissions(PERMISSIONS.TASKS_UPDATE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateTaskDto,
    @AuthenticatedUser() user: IAuthorizedUser,
  ): Promise<ITask> {
    return this.taskService.update(id, input, user);
  }
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.TASKS_DELETE)
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthenticatedUser() user: IAuthorizedUser,
  ): Promise<void> {
    return this.taskService.delete(id, user);
  }
}
