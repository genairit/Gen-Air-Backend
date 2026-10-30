import {
  Injectable,
  HttpException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import {
  IApartmentImportFile,
  IApartmentWorkbookRow,
} from './interfaces/apartment-import.interface';

import {
  readApartmentWorkbook,
  createApartmentTemplate,
} from './utilities/apartment-import-workbook.utility';

import {
  readApartmentImportField,
  readApartmentCustomerIdentity,
  prepareApartmentImportCustomer,
  compareApartmentImportCustomer,
  mergeApartmentCustomerDeclaration,
} from './utilities/apartment-import-customer.utility';

import {
  IApartmentImportResult,
  IApartmentImportRowResult,
} from './interfaces/apartment-import-result.interface';

import { Transaction } from 'sequelize';
import { TypedLogger } from '@Logger/logger.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProjectRepository } from './project.repository';
import { IProject } from './interfaces/project.interface';
import { IUser } from '@Modules/user/interfaces/user.interface';
import { DOMAIN_EVENTS } from '@Constants/domain-events.constant';
import { CustomerService } from '@Modules/customer/customer.service';
import { ProjectApartmentService } from './project-apartment.service';
import { HTTP_ERROR_CODES } from '@Constants/http-error-code.constant';
import { getHttpErrorPayload } from '@Utilities/http-error-payload.utility';
import { ICustomer } from '@Modules/customer/interfaces/customer.interface';
import { ApartmentImportRowError } from './errors/apartment-import-row.error';
import { ProjectStageService } from '@Modules/project-stage/project-stage.service';
import { prepareApartmentImportRow } from './utilities/apartment-import-row.utility';
import { buildApartmentImportResult } from './utilities/apartment-import-result.utility';
import { APARTMENT_IMPORT_ROW_STATUS } from './constants/apartment-import-result.constant';
import { CustomerContactService } from '@Modules/customer-contact/customer-contact.service';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import { PRIORITY_SYNC_STATUSES } from '@Modules/customer/constants/priority-sync-status.constant';
import { ProjectStageTransitionService } from '@Modules/project-stage-transition/project-stage-transition.service';

@Injectable()
export class ProjectApartmentImportService {
  private readonly logger = new TypedLogger(ProjectApartmentImportService.name);

  constructor(
    private readonly projects: ProjectRepository,
    private readonly apartments: ProjectApartmentService,
    private readonly customers: CustomerService,
    private readonly contacts: CustomerContactService,
    private readonly stages: ProjectStageService,
    private readonly transitions: ProjectStageTransitionService,
    private readonly transactions: DatabaseTransactionService,
    private readonly events: EventEmitter2,
  ) {}

  async template(buildingId: string): Promise<Buffer> {
    await this.getBuilding(buildingId);
    return createApartmentTemplate();
  }

  async import(
    buildingId: string,
    file: Express.Multer.File | null,
    creator: IUser,
  ): Promise<IApartmentImportResult> {
    if (!file) {
      throw new BadRequestException(
        getHttpErrorPayload(HTTP_ERROR_CODES.APARTMENT_IMPORT_FILE_REQUIRED),
      );
    }
    const input: IApartmentImportFile = {
      name: file.originalname,
      bytes: file.buffer,
      mimeType: file.mimetype,
    };
    const rows = await readApartmentWorkbook(input);
    const building = await this.getBuilding(buildingId);
    const initialStage = await this.stages.getInitialStage();
    const seen = new Set<string>();
    const declarations = new Map<string, readonly string[]>();
    const results: IApartmentImportRowResult[] = [];
    for (const row of rows) {
      const number = readApartmentImportField(row.cells, 'apartment');
      const duplicate = number !== '' && seen.has(number);
      if (duplicate) {
        results.push(
          this.result(
            row,
            APARTMENT_IMPORT_ROW_STATUS.DUPLICATE,
            'מספר הדירה מופיע כבר בשורה קודמת בקובץ',
          ),
        );
        continue;
      }
      if (number !== '') {
        seen.add(number);
      }
      const identity = readApartmentCustomerIdentity(row.cells);
      const declaration = mergeApartmentCustomerDeclaration({
        previous: declarations.get(identity.taxId ?? '') ?? null,
        cells: row.cells,
      });
      if (declaration.errors.length > 0) {
        results.push(
          this.result(
            row,
            APARTMENT_IMPORT_ROW_STATUS.ERROR,
            declaration.errors.join('; '),
          ),
        );
        continue;
      }
      if (identity.taxId) {
        declarations.set(identity.taxId, declaration.cells);
      }
      results.push(
        await this.importRow(row, building, initialStage.id, creator),
      );
    }
    return buildApartmentImportResult(results);
  }

  private async getBuilding(
    id: string,
    transaction?: Transaction,
  ): Promise<IProject> {
    const building = await this.projects.findById(id, transaction);
    if (!building) {
      throw new NotFoundException(
        getHttpErrorPayload(
          HTTP_ERROR_CODES.APARTMENT_IMPORT_BUILDING_NOT_FOUND,
        ),
      );
    }
    if (building.parentProjectId || !building.projectType?.canHaveApartments) {
      throw new BadRequestException(
        getHttpErrorPayload(HTTP_ERROR_CODES.APARTMENT_IMPORT_BUILDING_INVALID),
      );
    }
    return building;
  }

  private async importRow(
    row: IApartmentWorkbookRow,
    building: IProject,
    stageId: string,
    creator: IUser,
  ): Promise<IApartmentImportRowResult> {
    const parsed = await prepareApartmentImportRow(row.cells);
    const identity = readApartmentCustomerIdentity(row.cells);
    const errors = [...row.errors, ...parsed.errors, ...identity.errors];
    if (errors.length > 0 || !parsed.apartment || !identity.taxId) {
      return this.result(
        row,
        APARTMENT_IMPORT_ROW_STATUS.ERROR,
        errors.join('; '),
      );
    }
    const apartment = parsed.apartment;
    const taxId = identity.taxId;
    try {
      const createdId = await this.transactions.run(async (transaction) => {
        const lockedBuilding = await this.projects.lockForImport(
          building.id,
          transaction,
        );
        if (!lockedBuilding) {
          throw new ApartmentImportRowError(['הבניין אינו זמין לייבוא']);
        }
        const currentBuilding = await this.getBuilding(
          building.id,
          transaction,
        );
        const existing = await this.projects.findLiveApartmentByNumber(
          building.id,
          apartment.customerApartment,
          transaction,
        );
        if (existing) {
          return null;
        }
        await this.transactions.lockKey(
          `customer-import:${taxId}`,
          transaction,
        );
        const customer = await this.resolveCustomer(
          row.cells,
          taxId,
          creator,
          transaction,
        );
        const attributes = await this.apartments.resolveNewApartment({
          building: currentBuilding,
          transaction,
          stageId,
          creator,
          apartment: { ...apartment, customerId: customer.id },
        });
        const created = await this.projects.create(attributes, transaction);
        await this.resolveContacts(row.cells, customer, creator, transaction);
        await this.transitions.record(
          {
            projectId: created.id,
            toStageId: stageId,
            fromStageId: null,
            note: null,
            changedBy: creator,
          },
          transaction,
        );
        return created.id;
      });
      if (!createdId) {
        return this.result(
          row,
          APARTMENT_IMPORT_ROW_STATUS.EXISTING,
          'הדירה כבר קיימת בבניין; לא בוצע שינוי',
        );
      }
      await this.publishCreated(createdId);
      return this.result(row, APARTMENT_IMPORT_ROW_STATUS.CREATED, '');
    } catch (error) {
      this.logger.error({
        error: this.safeDiagnostic(error),
        message: 'Apartment import row rejected',
        rowNumber: row.rowNumber,
      });
      const message = this.safeRowMessage(error);
      return this.result(row, APARTMENT_IMPORT_ROW_STATUS.ERROR, message);
    }
  }

  private async resolveCustomer(
    cells: readonly string[],
    taxId: string,
    creator: IUser,
    transaction: Transaction,
  ): Promise<ICustomer> {
    const existing = await this.customers.findByTaxId(taxId, transaction);
    if (!existing) {
      return this.createCustomer(cells, creator, transaction);
    }
    const errors = compareApartmentImportCustomer({
      cells,
      customer: existing,
    });
    if (errors.length > 0) {
      throw new ApartmentImportRowError(errors);
    }
    if (existing.prioritySyncStatus === PRIORITY_SYNC_STATUSES.FAILED) {
      throw new ApartmentImportRowError([
        'לא ניתן לקשר את הלקוח עד לפתרון שגיאת הסנכרון שלו',
      ]);
    }
    return existing;
  }

  private async createCustomer(
    cells: readonly string[],
    creator: IUser,
    transaction: Transaction,
  ): Promise<ICustomer> {
    const prepared = await prepareApartmentImportCustomer(cells);
    if (!prepared.customer) {
      throw new ApartmentImportRowError(prepared.errors);
    }
    return this.customers.createForImport(
      prepared.customer,
      creator.id,
      transaction,
    );
  }

  private async resolveContacts(
    cells: readonly string[],
    customer: ICustomer,
    creator: IUser,
    transaction: Transaction,
  ): Promise<void> {
    await this.contacts.resolveForImport(
      {
        customerId: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        role: null,
        createdById: creator.id,
      },
      transaction,
    );
    const name = readApartmentImportField(cells, 'contactName');
    const phone = readApartmentImportField(cells, 'contactPhone');
    const email = readApartmentImportField(cells, 'contactEmail');
    if (!name && !phone && !email) {
      return;
    }
    await this.contacts.resolveForImport(
      {
        customerId: customer.id,
        name,
        phone: phone || null,
        email: email || null,
        role: null,
        createdById: creator.id,
      },
      transaction,
    );
  }

  private async publishCreated(projectId: string): Promise<void> {
    try {
      await this.events.emitAsync(DOMAIN_EVENTS.PROJECT_CREATED, { projectId });
    } catch (error) {
      this.logger.error({
        error: this.safeDiagnostic(error),
        message: 'Apartment created but post-commit notification failed',
        projectId,
      });
    }
  }

  private safeDiagnostic(error: unknown): Error {
    const name = error instanceof Error ? error.constructor.name : typeof error;
    const code: unknown =
      typeof error === 'object' && error !== null
        ? Reflect.get(error, 'code')
        : null;
    const safeCode =
      typeof code === 'string' && /^[A-Z0-9]{5}$/.test(code) ? code : null;
    return new Error(JSON.stringify({ name, code: safeCode }));
  }

  private safeRowMessage(error: unknown): string {
    if (error instanceof ApartmentImportRowError) {
      return error.reasons.join('; ');
    }

    const response =
      error instanceof HttpException ? error.getResponse() : null;
    const code: unknown =
      typeof response === 'object' && response !== null
        ? Reflect.get(response, 'code')
        : null;
    if (code === HTTP_ERROR_CODES.INVALID_CUSTOMER_CONTACT) {
      return 'פרטי איש הקשר אינם תקינים';
    }

    return 'לא ניתן לשמור את השורה; לא נשמרו שינויים משורה זו';
  }

  private result(
    row: IApartmentWorkbookRow,
    status: IApartmentImportRowResult['status'],
    reason: string,
  ): IApartmentImportRowResult {
    return {
      status,
      reason,
      rowNumber: row.rowNumber,
      cells: row.cells,
      apartment: readApartmentImportField(row.cells, 'apartment'),
    };
  }
}
