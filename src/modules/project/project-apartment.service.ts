import {
  Injectable,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';

import {
  IProject,
  IApartmentPage,
  TProjectUpdateAttributes,
  TProjectCreationAttributes,
} from './interfaces/project.interface';

import {
  formatApartmentCode,
  formatApartmentName,
} from './utilities/project-apartment.utility';

import {
  APARTMENT,
  APARTMENT_REQUIRED_FIELDS,
  APARTMENT_EDITABLE_FIELDS,
} from './constants/project-apartment.constant';

import { ProjectRepository } from './project.repository';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CreateApartmentDto } from './dto/create-apartment.dto';
import { ProjectIntakeService } from './project-intake.service';
import { IUser } from '@Modules/user/interfaces/user.interface';
import { EMPTY_PAYMENT_TERMS } from './constants/project-intake.constant';
import { GetApartmentsByFilterDto } from './dto/get-apartments-by-filter.dto';
import { EMPTY_CUSTOMER_DETAILS } from './constants/project-customer-details.constant';

interface IApartmentChangeRequest {
  buildingId: string;
  apartment: IProject;
  changes: UpdateProjectDto;
}

interface INewApartmentRequest {
  creator: IUser;
  stageId: string;
  building: IProject;
  apartment: CreateApartmentDto;
}

@Injectable()
export class ProjectApartmentService {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly projectIntakeService: ProjectIntakeService,
  ) {}

  async resolveNewApartment({
    creator,
    stageId,
    building,
    apartment,
  }: INewApartmentRequest): Promise<TProjectCreationAttributes> {
    this.assertCanHoldApartments(building);

    const contact = this.projectIntakeService.resolveContact(apartment);
    const [, sequence] = await Promise.all([
      this.assertApartmentNumberFree(building.id, apartment.customerApartment),
      this.projectRepository.countApartmentsEverCreated(building.id),
    ]);

    return {
      ...EMPTY_CUSTOMER_DETAILS,
      ...EMPTY_PAYMENT_TERMS,
      ...contact,
      stageId,
      address: null,
      addressCity: null,
      addressPlaceId: null,
      createdById: creator.id,
      parentProjectId: building.id,
      projectTypeId: building.projectTypeId,
      customerFloor: apartment.customerFloor,
      customerName: apartment.customerName ?? null,
      customerPhone: apartment.customerPhone ?? null,
      customerApartment: apartment.customerApartment,
      code: formatApartmentCode(building.code, sequence + 1),
      name: formatApartmentName(apartment.customerApartment),
    };
  }

  async findByBuilding(
    building: IProject,
    filter: GetApartmentsByFilterDto,
  ): Promise<IApartmentPage> {
    this.assertCanHoldApartments(building);

    const apartmentFilter = {
      projectIds: null,
      projectTypeId: null,
      parentProjectId: building.id,
      search: filter.search ?? null,
      stageId: filter.stageId ?? null,
    };
    const [page, total] = await Promise.all([
      this.projectRepository.findByFilter(apartmentFilter, {
        batchCursor: filter.batchCursor ?? null,
        batchSize: filter.batchSize ?? APARTMENT.PAGE_SIZE,
      }),
      this.projectRepository.countByFilter(apartmentFilter),
    ]);

    return { ...page, total };
  }

  async resolveChanges({
    apartment,
    buildingId,
    changes,
  }: IApartmentChangeRequest): Promise<TProjectUpdateAttributes> {
    this.assertOnlyApartmentFields(changes);
    this.assertRequiredFieldsKept(changes);

    const requestedNumber = changes.customerApartment ?? null;
    const isNumberChanging =
      requestedNumber !== null &&
      requestedNumber !== apartment.customerApartment;

    if (isNumberChanging) {
      await this.assertApartmentNumberFree(buildingId, requestedNumber);
    }

    const contact = await this.projectIntakeService.resolveChanges({
      changes,
      fieldSet: null,
      project: apartment,
      isTypeChanging: false,
    });

    return {
      ...contact,
      name: changes.name,
      customerName: changes.customerName,
      customerPhone: changes.customerPhone,
      customerFloor: changes.customerFloor ?? apartment.customerFloor,
      customerApartment: requestedNumber ?? apartment.customerApartment,
    };
  }

  private assertCanHoldApartments(building: IProject): void {
    if (building.parentProjectId) {
      throw new BadRequestException('An apartment cannot hold apartments');
    }

    if (!building.projectType?.canHaveApartments) {
      throw new BadRequestException(
        `Only בנייה רוויה projects hold apartments; ${building.code} is a ${building.projectType?.name ?? 'different'} project`,
      );
    }
  }

  private async assertApartmentNumberFree(
    buildingId: string,
    apartmentNumber: string,
  ): Promise<void> {
    const existing = await this.projectRepository.findLiveApartmentByNumber(
      buildingId,
      apartmentNumber,
    );

    if (existing) {
      throw new ConflictException(
        `Apartment ${apartmentNumber} already exists in this building (${existing.code})`,
      );
    }
  }

  private assertOnlyApartmentFields(changes: UpdateProjectDto): void {
    const disallowedFields = Object.keys(changes).filter(
      (field) =>
        !APARTMENT_EDITABLE_FIELDS.some((allowed) => allowed === field),
    );

    if (disallowedFields.length > 0) {
      throw new BadRequestException(
        `An apartment takes these from its building or cannot change them: ${disallowedFields.join(', ')}`,
      );
    }
  }

  private assertRequiredFieldsKept(changes: UpdateProjectDto): void {
    const clearedFields = APARTMENT_REQUIRED_FIELDS.filter(
      (field) => field in changes && changes[field] === null,
    );

    if (clearedFields.length > 0) {
      throw new BadRequestException(
        `An apartment needs its floor and number: ${clearedFields.join(', ')}`,
      );
    }
  }
}
