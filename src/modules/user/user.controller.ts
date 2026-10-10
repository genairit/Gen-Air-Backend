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
import { UserRoles } from '@Decorators/user-roles.decorator';
import { GetUsersByFilterDto } from './dto/get-by-filter.dto';
import { ICursorPage } from '@Interfaces/cursor-page.interface';
import { ROLE_PERMISSIONS } from '@Constants/authorization.constant';
import { UpdateUserPasswordDto } from './dto/update-user-password.dto';
import type { IUser, TUserRoleCounts } from './interfaces/user.interface';
import { AuthenticatedUser } from '@Decorators/authenticated-user.decorator';

@ApiTags('user')
@ApiBearerAuth()
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  getMe(@AuthenticatedUser() user: IUser): IUser {
    return user;
  }

  @Get('role-counts')
  getRoleCounts(): Promise<TUserRoleCounts> {
    return this.userService.getRoleCounts();
  }

  @Get()
  getByFilter(
    @Query() filter: GetUsersByFilterDto,
  ): Promise<ICursorPage<IUser>> {
    return this.userService.getByFilter(filter);
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<IUser> {
    return this.userService.getById(id);
  }

  @Post()
  @UserRoles(ROLE_PERMISSIONS.MANAGE_USERS)
  create(@Body() user: CreateUserDto): Promise<IUser> {
    return this.userService.create(user);
  }

  @Patch('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  updateMyPassword(
    @AuthenticatedUser() user: IUser,
    @Body() changes: UpdateUserPasswordDto,
  ): Promise<void> {
    return this.userService.updatePassword(user.id, changes);
  }

  @Patch(':id')
  @UserRoles(ROLE_PERMISSIONS.MANAGE_USERS)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changes: UpdateUserDto,
  ): Promise<IUser> {
    return this.userService.update(id, changes);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UserRoles(ROLE_PERMISSIONS.MANAGE_USERS)
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @AuthenticatedUser() requester: IUser,
  ): Promise<void> {
    return this.userService.delete(id, requester);
  }
}
