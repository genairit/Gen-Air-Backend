import {
  Inject,
  Injectable,
  forwardRef,
  ConflictException,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';

import {
  IProject,
  TProjectRead,
  INewProjectContext,
  TApartmentReadPage,
  IProjectStageCounts,
  IProjectWaitingReason,
  IProjectFieldSetTarget,
  IProjectCustomerDetails,
  TProjectUpdateAttributes,
  TProjectCreationAttributes,
  IProjectStageChangeRequest,
} from './interfaces/project.interface';

import {
  PROJECT_STATUS_IDS,
  WAITING_REASON_SOURCE_STATUS_IDS,
} from '@Constants/project-status.constant';

import {
  resolveProjectLighting,
  resolveProjectLightingChanges,
} from './utilities/project-lighting.utility';

import {
  resolveStageNote,
  findChangingStageId,
} from './utilities/project-stage-note.utility';

import {
  pickCustomerDetails,
  mergeCustomerDetails,
  isProjectTypeChanging,
  findMissingSiteDetails,
  hasCustomerDetailChanges,
  scopeSiteDetailsToFieldSet,
} from './utilities/project-customer-details.utility';

import { Transaction } from 'sequelize';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MoveProjectDto } from './dto/move-project.dto';
import { ProjectRepository } from './project.repository';
import { USER_ROLES } from '@Constants/user-role.constant';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { CreateApartmentDto } from './dto/create-apartment.dto';
import { ProjectIntakeService } from './project-intake.service';
import { ICursorPage } from '@Interfaces/cursor-page.interface';
import { toCursorBatch } from '@Utilities/cursor-batch.utility';
import { IUser } from '@Modules/user/interfaces/user.interface';
import { GetProjectsByFilterDto } from './dto/get-by-filter.dto';
import { PROJECT_CODE } from './constants/project-code.constant';
import { assertPermissions } from '@Utilities/permission.utility';
import { DOMAIN_EVENTS } from '@Constants/domain-events.constant';
import { CustomerService } from '@Modules/customer/customer.service';
import { ProjectApartmentService } from './project-apartment.service';
import { hasAddressChanges } from './utilities/project-intake.utility';
import { generateProjectCode } from './utilities/project-code.utility';
import { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { IProjectCreatedEvent } from '@Interfaces/domain-event.interface';
import { GetProjectCountsByFilterDto } from './dto/get-counts-by-filter.dto';
import { GetApartmentsByFilterDto } from './dto/get-apartments-by-filter.dto';
import { toProjectStageCounts } from './utilities/project-stage-counts.utility';
import { ProjectTypeService } from '@Modules/project-type/project-type.service';
import { ProjectStageService } from '@Modules/project-stage/project-stage.service';
import { ProjectMemberService } from '@Modules/project-member/project-member.service';
import { ProjectDetailFieldSetType } from '@Constants/project-detail-field-set.constant';
import { CustomerContact } from '@Modules/customer-contact/entities/customer-contact.entity';
import { LinkProjectContactDto } from '@Modules/project-contact/dto/link-project-contact.dto';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import { ProjectContactLink } from '@Modules/project-contact/entities/project-contact-link.entity';
import { PRIORITY_SYNC_STATUSES } from '@Modules/customer/constants/priority-sync-status.constant';
import { IProjectMemberAssignment } from '@Modules/project-member/interfaces/project-member.interface';
import { ProjectStageTransitionService } from '@Modules/project-stage-transition/project-stage-transition.service';

@Injectable()
export class ProjectService {
  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly projectRepository: ProjectRepository,
    private readonly projectIntakeService: ProjectIntakeService,
    private readonly projectApartmentService: ProjectApartmentService,
    private readonly customerService: CustomerService,
    private readonly projectTypeService: ProjectTypeService,
    private readonly projectMemberService: ProjectMemberService,
    private readonly databaseTransactionService: DatabaseTransactionService,
    private readonly projectStageTransitionService: ProjectStageTransitionService,
    @Inject(forwardRef(() => ProjectStageService))
    private readonly projectStageService: ProjectStageService,
  ) {}

  async getById(id: string): Promise<TProjectRead> {
    const project = await this.getStoredById(id);
    const [projectWithReason] = await this.withWaitingReasons([
      this.projectApartmentService.resolveForRead(project),
    ]);

    return projectWithReason;
  }

  async getByFilter(
    filter: GetProjectsByFilterDto,
  ): Promise<ICursorPage<TProjectRead>> {
    const projectIds = await this.findManagedProjectIds(
      filter.managerId ?? null,
    );
    const page = await this.projectRepository.findByFilter(
      {
        projectIds,
        parentProjectId: null,
        search: filter.search ?? null,
        stageId: filter.stageId ?? null,
        projectTypeId: filter.projectTypeId ?? null,
      },
      toCursorBatch(filter),
    );

    return {
      ...page,
      items: await this.withWaitingReasons(
        page.items.map((project) =>
          this.projectApartmentService.resolveForRead(project),
        ),
      ),
    };
  }

  async getStageCounts(
    filter: GetProjectCountsByFilterDto,
  ): Promise<IProjectStageCounts> {
    const projectIds = await this.findManagedProjectIds(
      filter.managerId ?? null,
    );
    const stageCounts = await this.projectRepository.countGroupedByStage({
      projectIds,
      stageId: null,
      parentProjectId: null,
      search: filter.search ?? null,
      projectTypeId: filter.projectTypeId ?? null,
    });

    return toProjectStageCounts(stageCounts);
  }

  async getApartmentStageCounts(
    buildingId: string,
  ): Promise<IProjectStageCounts> {
    const building = await this.getStoredById(buildingId);

    return this.projectApartmentService.countByStage(building);
  }

  countByStage(stageId: string): Promise<number> {
    return this.projectRepository.countByStage(stageId);
  }

  isNameAvailable(name: string, excludeId: string | null): Promise<boolean> {
    return this.projectRepository.isNameAvailable(name, excludeId);
  }

  async create(
    project: CreateProjectDto,
    creator: IUser,
  ): Promise<TProjectRead> {
    const [initialStage, projectType] = await Promise.all([
      this.projectStageService.getInitialStage(),
      this.projectTypeService.getById(project.projectTypeId),
      this.projectMemberService.validateAssignments(project.members),
      this.assertLinkableCustomer(project.customerId),
    ]);

    this.assertBuildingEngineerNotAssigned(
      projectType.canHaveApartments,
      null,
      project.members,
    );

    const customerDetails = this.resolveCustomerDetails(
      pickCustomerDetails(project),
      projectType.detailFieldSet,
    );
    const intake = await this.projectIntakeService.resolveForCreate(
      project,
      projectType.detailFieldSet,
    );
    const code = await this.generateAvailableCode(creator);

    const createdProjectId = await this.persistNewProject(
      {
        code,
        ...intake,
        ...customerDetails,
        ...resolveProjectLighting(project),
        name: project.name.trim(),
        createdById: creator.id,
        stageId: initialStage.id,
        projectTypeId: project.projectTypeId,
        notes: project.notes ?? null,
        customerId: project.customerId,
      },
      { members: project.members, creator },
      project.contacts ?? [],
    );

    return this.completeProjectCreation(createdProjectId);
  }

  async createApartment(
    buildingId: string,
    apartment: CreateApartmentDto,
    creator: IUser,
  ): Promise<TProjectRead> {
    const members = [
      ...(apartment.members ?? []),
      ...(apartment.engineerUserId
        ? [{ role: USER_ROLES.ENGINEER, userId: apartment.engineerUserId }]
        : []),
    ];
    const [building, initialStage] = await Promise.all([
      this.getStoredById(buildingId),
      this.projectStageService.getInitialStage(),
      this.projectMemberService.validateAssignments(members),
      this.assertLinkableCustomer(apartment.customerId),
    ]);

    const attributes = await this.projectApartmentService.resolveNewApartment({
      creator,
      building,
      apartment,
      stageId: initialStage.id,
    });
    const apartmentId = await this.persistNewProject(attributes, {
      members,
      creator,
    });

    return this.completeProjectCreation(apartmentId);
  }

  async getApartments(
    buildingId: string,
    filter: GetApartmentsByFilterDto,
  ): Promise<TApartmentReadPage> {
    const building = await this.getStoredById(buildingId);
    const page = await this.projectApartmentService.findByBuilding(
      building,
      filter,
    );

    return { ...page, items: await this.withWaitingReasons(page.items) };
  }

  async listBuildingApartments(
    buildingId: string,
    transaction?: Transaction,
  ): Promise<IProject[]> {
    const building = await this.getStoredById(buildingId, transaction);

    return this.projectApartmentService.listAll(building, transaction);
  }

  updateForActor(
    id: string,
    input: UpdateProjectDto,
    actor: IAuthorizedUser,
  ): Promise<TProjectRead> {
    assertPermissions(actor, PERMISSIONS.PROJECTS_UPDATE);
    if ('stageId' in input) {
      assertPermissions(actor, PERMISSIONS.PROJECTS_STATUS_CHANGE);
    }

    return this.update(id, input, actor);
  }

  async update(
    id: string,
    changes: UpdateProjectDto,
    editor: IUser,
  ): Promise<TProjectRead> {
    const [project] = await Promise.all([
      this.getStoredById(id),
      this.validateChanges(changes),
    ]);
    const stageChange = this.resolveStageChange({
      project,
      changedBy: editor,
      note: changes.stageNote ?? null,
      toStageId: changes.stageId ?? null,
    });
    const targetType = changes.projectTypeId
      ? await this.projectTypeService.getById(changes.projectTypeId)
      : (project.projectType ??
        (await this.projectTypeService.getById(project.projectTypeId)));
    this.assertBuildingEngineerNotAssigned(
      targetType.canHaveApartments,
      project.parentProjectId,
      changes.members ?? project.members ?? [],
    );
    const attributes = await this.resolveUpdateAttributes(project, changes);
    const removeEngineerBeforeTypeChange =
      !project.parentProjectId &&
      targetType.canHaveApartments &&
      changes.projectTypeId !== undefined &&
      project.members?.some((member) => member.role === USER_ROLES.ENGINEER) &&
      changes.members !== undefined;

    await this.databaseTransactionService.run(async (transaction) => {
      if (removeEngineerBeforeTypeChange) {
        await this.replaceMembersWhenProvided(
          id,
          changes.members ?? null,
          transaction,
        );
      }
      await this.projectRepository.update(id, attributes, transaction);

      if (project.parentProjectId) {
        await this.updateApartmentMembers(id, changes, transaction);
      } else if (!removeEngineerBeforeTypeChange) {
        await this.replaceMembersWhenProvided(
          id,
          changes.members ?? null,
          transaction,
        );
      }

      await this.applyStageChange(stageChange, transaction);
    });

    return this.getById(id);
  }

  async move(
    id: string,
    move: MoveProjectDto,
    changedBy: IUser,
  ): Promise<TProjectRead> {
    const [project] = await Promise.all([
      this.getStoredById(id),
      this.projectStageService.getById(move.stageId),
    ]);
    const stageChange = this.resolveStageChange({
      project,
      changedBy,
      note: move.note ?? null,
      toStageId: move.stageId,
    });

    await this.databaseTransactionService.run((transaction) =>
      this.applyStageChange(stageChange, transaction),
    );

    return this.getById(id);
  }

  async setDriveFolderId(
    projectId: string,
    driveFolderId: string,
  ): Promise<void> {
    const isUpdated = await this.projectRepository.updateDriveFolderId(
      projectId,
      driveFolderId,
    );

    if (!isUpdated) {
      throw new NotFoundException(`Project ${projectId} was not found`);
    }
  }

  async setSharedDocumentFileId(
    projectId: string,
    fileId: string | null,
  ): Promise<void> {
    const isUpdated = await this.projectRepository.updateSharedDocumentFileId(
      projectId,
      fileId,
    );

    if (!isUpdated) {
      throw new NotFoundException(`Parent project ${projectId} was not found`);
    }
  }

  async delete(id: string): Promise<void> {
    const apartmentCount = await this.projectRepository.countLiveApartments(id);

    if (apartmentCount > 0) {
      throw new ConflictException(
        `This building still has ${apartmentCount} apartments; delete them first`,
      );
    }

    const isDeleted = await this.projectRepository.softDelete(id);

    if (!isDeleted) {
      throw new NotFoundException(`Project ${id} was not found`);
    }
  }

  private async completeProjectCreation(
    projectId: string,
  ): Promise<TProjectRead> {
    const projectCreated: IProjectCreatedEvent = { projectId };
    await this.eventEmitter.emitAsync(
      DOMAIN_EVENTS.PROJECT_CREATED,
      projectCreated,
    );
    return this.getById(projectId);
  }

  private async withWaitingReasons<T extends IProject>(
    projects: T[],
  ): Promise<(T & IProjectWaitingReason)[]> {
    const waitingProjectIds = projects
      .filter(
        (project) =>
          project.stageId === PROJECT_STATUS_IDS.WAITING_FOR_RESPONSE,
      )
      .map((project) => project.id);
    const reasonByProjectId =
      await this.projectStageTransitionService.findLatestNotesByTargetStages({
        projectIds: waitingProjectIds,
        toStageIds: WAITING_REASON_SOURCE_STATUS_IDS,
      });

    return projects.map((project) => ({
      ...project,
      waitingReason: reasonByProjectId.get(project.id) ?? null,
    }));
  }

  private async getStoredById(
    id: string,
    transaction?: Transaction,
  ): Promise<IProject> {
    const project = await this.projectRepository.findById(id, transaction);

    if (!project) {
      throw new NotFoundException(`Project ${id} was not found`);
    }

    return project;
  }

  private async persistNewProject(
    attributes: TProjectCreationAttributes,
    { members, creator }: INewProjectContext,
    contacts: LinkProjectContactDto[] = [],
  ): Promise<string> {
    return this.databaseTransactionService.run(async (transaction) => {
      const created = await this.projectRepository.create(
        attributes,
        transaction,
      );

      if (contacts.length > 0) {
        const uniqueIds = new Set(contacts.map((contact) => contact.contactId));
        const primaryCount = contacts.filter(
          (contact) => contact.isPrimary,
        ).length;
        const existingCount = await CustomerContact.count({
          where: { id: [...uniqueIds] },
          transaction,
        });
        if (
          uniqueIds.size !== contacts.length ||
          primaryCount > 1 ||
          existingCount !== contacts.length
        ) {
          throw new BadRequestException('Invalid project contacts');
        }

        await ProjectContactLink.bulkCreate(
          contacts.map((contact) => ({
            projectId: created.id,
            contactId: contact.contactId,
            role: contact.role ?? null,
            isPrimary: contact.isPrimary ?? false,
          })),
          { transaction },
        );
      }

      await this.projectMemberService.replaceForProject(
        created.id,
        members,
        transaction,
      );

      await this.projectStageTransitionService.record(
        {
          note: null,
          fromStageId: null,
          changedBy: creator,
          projectId: created.id,
          toStageId: attributes.stageId,
        },
        transaction,
      );

      return created.id;
    });
  }

  private resolveUpdateAttributes(
    project: IProject,
    changes: UpdateProjectDto,
  ): Promise<TProjectUpdateAttributes> {
    if (project.parentProjectId) {
      return this.projectApartmentService.resolveChanges({
        changes,
        apartment: project,
        buildingId: project.parentProjectId,
      });
    }

    if ('hasOwnLighting' in changes) {
      throw new BadRequestException(
        'Only apartments can override building lighting',
      );
    }

    return this.resolveProjectChanges(project, changes);
  }

  private async resolveProjectChanges(
    project: IProject,
    changes: UpdateProjectDto,
  ): Promise<TProjectUpdateAttributes> {
    if ('apartmentOwnership' in changes || 'apartmentCredit' in changes) {
      throw new BadRequestException(
        'Apartment ownership and credit belong to apartments only',
      );
    }

    if ('engineerUserId' in changes) {
      throw new BadRequestException('Only apartments can assign an engineer');
    }

    if ('hasOwnTeam' in changes) {
      throw new BadRequestException(
        'Team inheritance can only be changed for apartments',
      );
    }

    const isTypeChanging = isProjectTypeChanging(project, changes);
    const [fieldSet] = await Promise.all([
      this.findTargetFieldSet(project, changes),
      this.assertLinkableCustomer(changes.customerId ?? null),
      this.assertTypeKeepsApartments(project, changes),
    ]);
    const customerDetails = this.resolveCustomerDetailChanges(
      project,
      changes,
      { isTypeChanging, fieldSet },
    );
    const intake = await this.projectIntakeService.resolveChanges({
      project,
      changes,
      fieldSet,
      isTypeChanging,
    });

    return {
      ...intake,
      ...customerDetails,
      ...resolveProjectLightingChanges(changes, project),
      name: changes.name?.trim(),
      notes: changes.notes,
      customerId: changes.customerId,
      projectTypeId: changes.projectTypeId,
    };
  }

  private async assertLinkableCustomer(
    customerId: string | null,
  ): Promise<void> {
    if (!customerId) {
      return;
    }

    const customer = await this.customerService.findById(customerId);

    if (!customer) {
      throw new BadRequestException(`Customer ${customerId} was not found`);
    }

    if (customer.prioritySyncStatus === PRIORITY_SYNC_STATUSES.FAILED) {
      throw new BadRequestException(
        `Customer ${customer.name} has not reached Priority yet; retry its sync before linking it to a project`,
      );
    }
  }

  private async assertTypeKeepsApartments(
    project: IProject,
    changes: UpdateProjectDto,
  ): Promise<void> {
    if (!isProjectTypeChanging(project, changes)) {
      return;
    }

    const apartmentCount = await this.projectRepository.countLiveApartments(
      project.id,
    );

    if (apartmentCount === 0) {
      return;
    }

    const projectType = await this.projectTypeService.getById(
      changes.projectTypeId ?? project.projectTypeId,
    );

    if (!projectType.canHaveApartments) {
      throw new BadRequestException(
        `This building has ${apartmentCount} apartments, and a ${projectType.name} project cannot hold apartments`,
      );
    }
  }

  private async findManagedProjectIds(
    managerId: string | null,
  ): Promise<string[] | null> {
    if (!managerId) {
      return null;
    }

    return this.projectMemberService.findProjectIdsByMember(
      managerId,
      USER_ROLES.PROJECT_MANAGER,
    );
  }

  private async validateChanges(changes: UpdateProjectDto): Promise<void> {
    await Promise.all([
      changes.stageId
        ? this.projectStageService.getById(changes.stageId)
        : null,
      changes.members
        ? this.projectMemberService.validateAssignments(changes.members)
        : null,
      changes.engineerUserId
        ? this.projectMemberService.validateAssignments([
            { userId: changes.engineerUserId, role: USER_ROLES.ENGINEER },
          ])
        : null,
    ]);
  }

  private assertBuildingEngineerNotAssigned(
    canHaveApartments: boolean,
    parentProjectId: string | null,
    members: readonly { role: string }[],
  ): void {
    const isResidentialBuilding = canHaveApartments && !parentProjectId;
    const hasEngineer = members.some(
      (member) => member.role === USER_ROLES.ENGINEER,
    );

    if (isResidentialBuilding && hasEngineer) {
      throw new BadRequestException(
        'Assign engineering workers to apartments, not their parent building',
      );
    }
  }

  private async findTargetFieldSet(
    project: IProject,
    changes: UpdateProjectDto,
  ): Promise<ProjectDetailFieldSetType | null> {
    const needsFieldSet =
      isProjectTypeChanging(project, changes) ||
      hasCustomerDetailChanges(changes) ||
      hasAddressChanges(changes);

    if (!needsFieldSet) {
      return null;
    }

    const projectType = await this.projectTypeService.getById(
      changes.projectTypeId ?? project.projectTypeId,
    );

    return projectType.detailFieldSet;
  }

  private resolveCustomerDetailChanges(
    project: IProject,
    changes: UpdateProjectDto,
    target: IProjectFieldSetTarget,
  ): IProjectCustomerDetails | null {
    const isDetailChanging =
      target.isTypeChanging || hasCustomerDetailChanges(changes);

    if (!target.fieldSet || !isDetailChanging) {
      return null;
    }

    const mergedDetails = mergeCustomerDetails(
      pickCustomerDetails(project),
      changes,
    );

    return this.resolveCustomerDetails(mergedDetails, target.fieldSet);
  }

  private resolveCustomerDetails(
    details: IProjectCustomerDetails,
    fieldSet: ProjectDetailFieldSetType,
  ): IProjectCustomerDetails {
    const scopedDetails = scopeSiteDetailsToFieldSet(details, fieldSet);
    const missingFields = findMissingSiteDetails(scopedDetails, fieldSet);

    if (missingFields.length > 0) {
      throw new BadRequestException(
        `Missing site details for this project type: ${missingFields.join(', ')}`,
      );
    }

    return scopedDetails;
  }

  private async replaceMembersWhenProvided(
    projectId: string,
    members: IProjectMemberAssignment[] | null,
    transaction: Transaction,
  ): Promise<void> {
    if (!members) {
      return;
    }

    await this.projectMemberService.replaceForProject(
      projectId,
      members,
      transaction,
    );
  }

  private resolveStageChange(
    request: IProjectStageChangeRequest,
  ): IProjectStageChangeRequest {
    const toStageId = findChangingStageId(request);

    if (!toStageId) {
      return request;
    }

    return {
      ...request,
      note: resolveStageNote({ toStageId, note: request.note }),
    };
  }

  private async updateApartmentMembers(
    projectId: string,
    changes: UpdateProjectDto,
    transaction: Transaction,
  ): Promise<void> {
    const team = changes.hasOwnTeam === false ? [] : (changes.members ?? null);
    const legacyEngineer = changes.members?.find(
      (member) => member.role === USER_ROLES.ENGINEER,
    );
    const engineerChanged = 'engineerUserId' in changes || legacyEngineer;

    if (team) {
      await this.projectMemberService.replaceApartmentTeam(
        projectId,
        team,
        transaction,
      );
    }

    if (engineerChanged) {
      await this.projectMemberService.setApartmentEngineer(
        projectId,
        'engineerUserId' in changes
          ? (changes.engineerUserId ?? null)
          : (legacyEngineer?.userId ?? null),
        transaction,
      );
    }
  }

  private async applyStageChange(
    request: IProjectStageChangeRequest,
    transaction: Transaction,
  ): Promise<void> {
    const { project, note } = request;
    const toStageId = findChangingStageId(request);

    if (!toStageId) {
      return;
    }

    await this.projectRepository.update(
      project.id,
      { stageId: toStageId },
      transaction,
    );

    await this.projectStageTransitionService.record(
      {
        note,
        toStageId,
        projectId: project.id,
        fromStageId: project.stageId,
        changedBy: request.changedBy,
      },
      transaction,
    );
  }

  private async generateAvailableCode(
    creator: IUser,
    attemptsLeft: number = PROJECT_CODE.MAX_GENERATION_ATTEMPTS,
  ): Promise<string> {
    if (attemptsLeft === 0) {
      throw new InternalServerErrorException(
        'Could not generate a unique project code',
      );
    }

    const code = generateProjectCode(creator);
    const isTaken = await this.projectRepository.isCodeTaken(code);

    if (!isTaken) {
      return code;
    }

    return this.generateAvailableCode(creator, attemptsLeft - 1);
  }
}
