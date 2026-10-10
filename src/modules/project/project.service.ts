import {
  Inject,
  Injectable,
  forwardRef,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';

import {
  IProject,
  IProjectStageCounts,
  IProjectCustomerDetails,
  IProjectStageChangeRequest,
} from './interfaces/project.interface';

import {
  pickCustomerDetails,
  mergeCustomerDetails,
  hasCustomerDetailChanges,
  findMissingCustomerDetails,
  scopeCustomerDetailsToFieldSet,
} from './utilities/project-customer-details.utility';

import { Transaction } from 'sequelize';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MoveProjectDto } from './dto/move-project.dto';
import { ProjectRepository } from './project.repository';
import { USER_ROLES } from '@Constants/user-role.constant';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ICursorPage } from '@Interfaces/cursor-page.interface';
import { toCursorBatch } from '@Utilities/cursor-batch.utility';
import { IUser } from '@Modules/user/interfaces/user.interface';
import { GetProjectsByFilterDto } from './dto/get-by-filter.dto';
import { PROJECT_CODE } from './constants/project-code.constant';
import { DOMAIN_EVENTS } from '@Constants/domain-events.constant';
import { generateProjectCode } from './utilities/project-code.utility';
import { IProjectCreatedEvent } from '@Interfaces/domain-event.interface';
import { GetProjectCountsByFilterDto } from './dto/get-counts-by-filter.dto';
import { ProjectTypeService } from '@Modules/project-type/project-type.service';
import { ProjectStageService } from '@Modules/project-stage/project-stage.service';
import { ProjectMemberService } from '@Modules/project-member/project-member.service';
import { ProjectDetailFieldSetType } from '@Constants/project-detail-field-set.constant';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import { IProjectMemberAssignment } from '@Modules/project-member/interfaces/project-member.interface';
import { ProjectStageTransitionService } from '@Modules/project-stage-transition/project-stage-transition.service';

@Injectable()
export class ProjectService {
  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly projectRepository: ProjectRepository,
    private readonly projectTypeService: ProjectTypeService,
    private readonly projectMemberService: ProjectMemberService,
    private readonly databaseTransactionService: DatabaseTransactionService,
    private readonly projectStageTransitionService: ProjectStageTransitionService,
    @Inject(forwardRef(() => ProjectStageService))
    private readonly projectStageService: ProjectStageService,
  ) {}

  async getById(id: string): Promise<IProject> {
    const project = await this.projectRepository.findById(id);

    if (!project) {
      throw new NotFoundException(`Project ${id} was not found`);
    }

    return project;
  }

  async getByFilter(
    filter: GetProjectsByFilterDto,
  ): Promise<ICursorPage<IProject>> {
    const projectIds = await this.findManagedProjectIds(
      filter.managerId ?? null,
    );

    return this.projectRepository.findByFilter(
      {
        projectIds,
        search: filter.search ?? null,
        stageId: filter.stageId ?? null,
        projectTypeId: filter.projectTypeId ?? null,
      },
      toCursorBatch(filter),
    );
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
      search: filter.search ?? null,
      projectTypeId: filter.projectTypeId ?? null,
    });

    return {
      total: stageCounts.reduce((total, { count }) => total + count, 0),
      byStage: Object.fromEntries(
        stageCounts.map(({ stageId, count }) => [stageId, count]),
      ),
    };
  }

  countByStage(stageId: string): Promise<number> {
    return this.projectRepository.countByStage(stageId);
  }

  async create(project: CreateProjectDto, creator: IUser): Promise<IProject> {
    const [initialStage, projectType] = await Promise.all([
      this.projectStageService.getInitialStage(),
      this.projectTypeService.getById(project.projectTypeId),
      this.projectMemberService.validateAssignments(project.members),
    ]);

    const customerDetails = this.resolveCustomerDetails(
      pickCustomerDetails(project),
      projectType.detailFieldSet,
    );
    const code = await this.generateAvailableCode(creator);

    const createdProject = await this.databaseTransactionService.run(
      async (transaction) => {
        const created = await this.projectRepository.create(
          {
            code,
            ...customerDetails,
            name: project.name,
            createdById: creator.id,
            stageId: initialStage.id,
            projectTypeId: project.projectTypeId,
          },
          transaction,
        );

        await this.projectMemberService.replaceForProject(
          created.id,
          project.members,
          transaction,
        );

        await this.projectStageTransitionService.record(
          {
            note: null,
            fromStageId: null,
            changedBy: creator,
            projectId: created.id,
            toStageId: initialStage.id,
          },
          transaction,
        );

        return created;
      },
    );

    const projectCreated: IProjectCreatedEvent = {
      projectId: createdProject.id,
    };

    await this.eventEmitter.emitAsync(
      DOMAIN_EVENTS.PROJECT_CREATED,
      projectCreated,
    );

    return this.getById(createdProject.id);
  }

  async update(
    id: string,
    changes: UpdateProjectDto,
    editor: IUser,
  ): Promise<IProject> {
    const [project] = await Promise.all([
      this.getById(id),
      this.validateChanges(changes),
    ]);
    const customerDetails = await this.resolveCustomerDetailChanges(
      project,
      changes,
    );

    await this.databaseTransactionService.run(async (transaction) => {
      await this.projectRepository.update(
        id,
        {
          ...customerDetails,
          name: changes.name,
          projectTypeId: changes.projectTypeId,
        },
        transaction,
      );

      await this.replaceMembersWhenProvided(
        id,
        changes.members ?? null,
        transaction,
      );

      await this.applyStageChange(
        {
          project,
          note: null,
          changedBy: editor,
          toStageId: changes.stageId ?? null,
        },
        transaction,
      );
    });

    return this.getById(id);
  }

  async move(
    id: string,
    move: MoveProjectDto,
    changedBy: IUser,
  ): Promise<IProject> {
    const [project] = await Promise.all([
      this.getById(id),
      this.projectStageService.getById(move.stageId),
    ]);

    await this.databaseTransactionService.run((transaction) =>
      this.applyStageChange(
        {
          project,
          changedBy,
          note: move.note ?? null,
          toStageId: move.stageId,
        },
        transaction,
      ),
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

  async delete(id: string): Promise<void> {
    const isDeleted = await this.projectRepository.softDelete(id);

    if (!isDeleted) {
      throw new NotFoundException(`Project ${id} was not found`);
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
    ]);
  }

  private async resolveCustomerDetailChanges(
    project: IProject,
    changes: UpdateProjectDto,
  ): Promise<IProjectCustomerDetails | null> {
    const targetTypeId = changes.projectTypeId ?? project.projectTypeId;
    const isTypeChanging = targetTypeId !== project.projectTypeId;

    if (!isTypeChanging && !hasCustomerDetailChanges(changes)) {
      return null;
    }

    const projectType = await this.projectTypeService.getById(targetTypeId);
    const mergedDetails = mergeCustomerDetails(
      pickCustomerDetails(project),
      changes,
    );

    return this.resolveCustomerDetails(
      mergedDetails,
      projectType.detailFieldSet,
    );
  }

  private resolveCustomerDetails(
    details: IProjectCustomerDetails,
    fieldSet: ProjectDetailFieldSetType,
  ): IProjectCustomerDetails {
    const scopedDetails = scopeCustomerDetailsToFieldSet(details, fieldSet);
    const missingFields = findMissingCustomerDetails(scopedDetails, fieldSet);

    if (missingFields.length > 0) {
      throw new BadRequestException(
        `Missing customer details for this project type: ${missingFields.join(', ')}`,
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

  private async applyStageChange(
    request: IProjectStageChangeRequest,
    transaction: Transaction,
  ): Promise<void> {
    const { project, toStageId } = request;
    const isStageChanging = toStageId !== null && toStageId !== project.stageId;

    if (!isStageChanging) {
      return;
    }

    await this.projectRepository.update(
      project.id,
      { stageId: toStageId },
      transaction,
    );

    await this.projectStageTransitionService.record(
      {
        toStageId,
        note: request.note,
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
