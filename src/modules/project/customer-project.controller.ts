import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { CustomerProjectService } from './customer-project.service';
import { GetCustomerProjectsDto } from './dto/get-customer-projects.dto';
import { Get, Param, Query, Controller, ParseUUIDPipe } from '@nestjs/common';
import { RequirePermissions } from '@Decorators/require-permissions.decorator';
import { ICustomerProjectPage } from './interfaces/customer-project.interface';

@ApiTags('customer')
@ApiBearerAuth()
@Controller('customer')
export class CustomerProjectController {
  constructor(private readonly projects: CustomerProjectService) {}

  @Get(':id/projects')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_READ, PERMISSIONS.PROJECTS_READ)
  getPage(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() filter: GetCustomerProjectsDto,
  ): Promise<ICustomerProjectPage> {
    return this.projects.getPage(id, filter);
  }
}
