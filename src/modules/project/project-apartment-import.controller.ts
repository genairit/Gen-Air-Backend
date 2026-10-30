import {
  Get,
  Post,
  Param,
  Controller,
  UploadedFile,
  ParseUUIDPipe,
  StreamableFile,
  UseInterceptors,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';
import { PERMISSIONS } from '@Constants/authorization.constant';
import type { IUser } from '@Modules/user/interfaces/user.interface';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { APARTMENT_IMPORT } from './constants/apartment-import.constant';
import { AuthenticatedUser } from '@Decorators/authenticated-user.decorator';
import { RequirePermissions } from '@Decorators/require-permissions.decorator';
import { ProjectApartmentImportService } from './project-apartment-import.service';
import { IApartmentImportResult } from './interfaces/apartment-import-result.interface';

@ApiTags('project')
@ApiBearerAuth()
@Controller('project/:id/apartments/import')
export class ProjectApartmentImportController {
  constructor(private readonly imports: ProjectApartmentImportService) {}

  @Get('template')
  @RequirePermissions(
    PERMISSIONS.APARTMENTS_CREATE,
    PERMISSIONS.CUSTOMERS_CREATE,
    PERMISSIONS.CUSTOMERS_UPDATE,
  )
  async template(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    return new StreamableFile(await this.imports.template(id), {
      type: APARTMENT_IMPORT.MIME_TYPE,
      disposition: `attachment; filename="${APARTMENT_IMPORT.TEMPLATE_FILENAME}"`,
    });
  }

  @Post()
  @RequirePermissions(
    PERMISSIONS.APARTMENTS_CREATE,
    PERMISSIONS.CUSTOMERS_CREATE,
    PERMISSIONS.CUSTOMERS_UPDATE,
  )
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        files: 1,
        fileSize: APARTMENT_IMPORT.MAX_FILE_BYTES,
        fields: 0,
      },
    }),
  )
  import(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | null,
    @AuthenticatedUser() creator: IUser,
  ): Promise<IApartmentImportResult> {
    return this.imports.import(id, file ?? null, creator);
  }
}
