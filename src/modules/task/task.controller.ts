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
import { UserRoles } from '@Decorators/user-roles.decorator';
import { GetTasksByFilterDto } from './dto/get-by-filter.dto';
import { ICursorPage } from '@Interfaces/cursor-page.interface';
import { ITask, ITaskCounts } from './interfaces/task.interface';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import type { IUser } from '@Modules/user/interfaces/user.interface';
import { UpdateTaskUrgencyDto } from './dto/update-task-urgency.dto';
import { ROLE_PERMISSIONS } from '@Constants/authorization.constant';
import { AuthenticatedUser } from '@Decorators/authenticated-user.decorator';
import { ITaskStatusTransition } from './interfaces/task-status-transition.interface';

@ApiTags('task')
@ApiBearerAuth()
@Controller('task')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}
  @Get()
  getByFilter(
    @Query() filter: GetTasksByFilterDto,
  ): Promise<ICursorPage<ITask>> {
    return this.taskService.getByFilter(filter);
  }
  @Get('my-tasks')
  getMyTasks(
    @Query() filter: GetTasksByFilterDto,
    @AuthenticatedUser() user: IUser,
  ): Promise<ICursorPage<ITask>> {
    return this.taskService.getMyTasks(filter, user);
  }
  @Get('counts')
  getCounts(@Query() filter: GetTasksByFilterDto): Promise<ITaskCounts> {
    return this.taskService.getCounts(filter);
  }
  @Get('my-tasks/counts')
  getMyCounts(
    @Query() filter: GetTasksByFilterDto,
    @AuthenticatedUser() user: IUser,
  ): Promise<ITaskCounts> {
    return this.taskService.getCounts({ ...filter, assigneeId: user.id });
  }
  @Patch(':id/claim')
  @UserRoles(ROLE_PERMISSIONS.UPDATE_TASK_STATUS)
  claim(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthenticatedUser() user: IUser,
  ): Promise<ITask> {
    return this.taskService.claim(id, user);
  }
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<ITask> {
    return this.taskService.getById(id);
  }
  @Post()
  @UserRoles(ROLE_PERMISSIONS.MANAGE_TASKS)
  create(
    @Body() input: CreateTaskDto,
    @AuthenticatedUser() user: IUser,
  ): Promise<ITask> {
    return this.taskService.create(input, user);
  }
  @Patch(':id/status')
  @UserRoles(ROLE_PERMISSIONS.UPDATE_TASK_STATUS)
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateTaskStatusDto,
    @AuthenticatedUser() user: IUser,
  ): Promise<ITask> {
    return this.taskService.updateStatus(id, input.status, user);
  }

  @Get(':id/transitions')
  getStatusTransitions(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ITaskStatusTransition[]> {
    return this.taskService.getStatusTransitions(id);
  }
  @Patch(':id/urgency')
  @UserRoles(ROLE_PERMISSIONS.MANAGE_TASKS)
  updateUrgency(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateTaskUrgencyDto,
    @AuthenticatedUser() user: IUser,
  ): Promise<ITask> {
    return this.taskService.updateUrgency(id, input.isUrgent, user);
  }
  @Patch(':id')
  @UserRoles(ROLE_PERMISSIONS.MANAGE_TASKS)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateTaskDto,
    @AuthenticatedUser() user: IUser,
  ): Promise<ITask> {
    return this.taskService.update(id, input, user);
  }
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UserRoles(ROLE_PERMISSIONS.MANAGE_TASKS)
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthenticatedUser() user: IUser,
  ): Promise<void> {
    return this.taskService.delete(id, user);
  }
}
