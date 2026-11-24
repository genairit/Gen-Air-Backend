import {
  Get,
  Put,
  Post,
  Body,
  Param,
  Delete,
  HttpCode,
  Controller,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';

import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { ProjectContactService } from './project-contact.service';
import { LinkProjectContactDto } from './dto/link-project-contact.dto';
import { ProjectContactLink } from './entities/project-contact-link.entity';
import { SetProjectContactRoleDto } from './dto/set-project-contact-role.dto';
import { RequirePermissions } from '@Decorators/require-permissions.decorator';

@ApiTags('project-contact')
@ApiBearerAuth()
@Controller('project/:projectId/contacts')
export class ProjectContactController {
  constructor(private readonly contacts: ProjectContactService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PROJECTS_READ)
  list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<ProjectContactLink[]> {
    return this.contacts.list(projectId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PROJECTS_UPDATE)
  link(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() input: LinkProjectContactDto,
  ): Promise<ProjectContactLink> {
    return this.contacts.link(projectId, input);
  }

  @Put('roles/:role')
  @RequirePermissions(PERMISSIONS.PROJECTS_UPDATE)
  setRole(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('role') role: string,
    @Body() input: SetProjectContactRoleDto,
  ): Promise<ProjectContactLink[]> {
    return this.contacts.setRole(projectId, role, input.contactId);
  }

  @Delete(':contactId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.PROJECTS_UPDATE)
  unlink(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ): Promise<void> {
    return this.contacts.unlink(projectId, contactId);
  }
}
