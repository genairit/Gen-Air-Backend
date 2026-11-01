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

import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { GetUsersByFilterDto } from './dto/get-by-filter.dto';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { ICursorPage } from '@Interfaces/cursor-page.interface';
import { Authenticated } from '@Decorators/authenticated.decorator';
import { UpdateUserPasswordDto } from './dto/update-user-password.dto';
import type { IUser, TUserRoleCounts } from './interfaces/user.interface';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { AuthenticatedUser } from '@Decorators/authenticated-user.decorator';
import { RequirePermissions } from '@Decorators/require-permissions.decorator';

@ApiTags('user')
@ApiBearerAuth()
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  @Authenticated()
  getMe(@AuthenticatedUser() user: IAuthorizedUser): IAuthorizedUser {
    return user;
  }

  @Get('role-counts')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_READ)
  getRoleCounts(): Promise<TUserRoleCounts> {
    return this.userService.getRoleCounts();
  }

  @Get()
  @RequirePermissions(PERMISSIONS.EMPLOYEES_READ)
  getByFilter(
    @Query() filter: GetUsersByFilterDto,
  ): Promise<ICursorPage<IUser>> {
    return this.userService.getByFilter(filter);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_READ)
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<IUser> {
    return this.userService.getById(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.EMPLOYEES_CREATE)
  create(
    @Body() user: CreateUserDto,
    @AuthenticatedUser() actor: IAuthorizedUser,
  ): Promise<IUser> {
    return this.userService.createForActor(user, actor);
  }

  @Patch('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Authenticated()
  updateMyPassword(
    @AuthenticatedUser() user: IUser,
    @Body() changes: UpdateUserPasswordDto,
  ): Promise<void> {
    return this.userService.updatePassword(user.id, changes);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_UPDATE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changes: UpdateUserDto,
    @AuthenticatedUser() actor: IAuthorizedUser,
  ): Promise<IUser> {
    return this.userService.updateForActor(id, changes, actor);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.EMPLOYEES_DELETE)
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthenticatedUser() requester: IUser,
  ): Promise<void> {
    return this.userService.delete(id, requester);
  }
}
