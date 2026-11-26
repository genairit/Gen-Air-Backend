import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import {
  estimateSubtotal,
  EstimatePricingService,
} from './estimate-pricing.service';

import {
  hasPermission,
  assertPermissions,
} from '@Utilities/permission.utility';

import type {
  CreateEngineeringEstimateDto,
  UpdateEngineeringEstimateDto,
} from './dto/engineering-estimate.dto';

import {
  getUploadType,
  assertUploadContent,
} from '@Utilities/drive-upload-policy.utility';

import {
  ESTIMATE_SCOPE,
  ESTIMATE_LIMITS,
  ESTIMATE_STATUS,
  ESTIMATE_PLAN_MIME,
  ESTIMATE_SETUP_STEP,
} from './constants/engineering-estimate.constant';

import type {
  IEstimatePlan,
  IEstimateView,
  IEstimateRecord,
  IEstimateSummary,
  IEstimatePlanSource,
} from './interfaces/engineering-estimate.interface';

import { Transaction } from 'sequelize';
import { randomUUID } from 'node:crypto';
import { TIME_UNITS } from '@Constants/time.constant';
import { PAGINATION } from '@Constants/pagination.constant';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { ProjectService } from '@Modules/project/project.service';
import type { ICursorPage } from '@Interfaces/cursor-page.interface';
import type { CursorPaginationDto } from '@Dto/cursor-pagination.dto';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { EngineeringEstimateRepository } from './engineering-estimate.repository';
import { ProjectDriveService } from '@Modules/project-drive/project-drive.service';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

interface IEstimateActor {
  id: string;
  actor: IAuthorizedUser;
}

interface IEstimateCommand extends IEstimateActor {
  version: number;
}

interface IEstimatePlanInput extends IEstimateCommand {
  name: string;
  marked: boolean;
  content: Buffer;
  source?: IEstimatePlanSource;
}

const ALLOWED_MIME: readonly string[] = Object.values(ESTIMATE_PLAN_MIME);
const MARKED_MIME: readonly string[] = [
  ESTIMATE_PLAN_MIME.PNG,
  ESTIMATE_PLAN_MIME.JPEG,
];

@Injectable()
export class EngineeringEstimateService {
  constructor(
    private readonly repository: EngineeringEstimateRepository,
    private readonly transactions: DatabaseTransactionService,
    private readonly projects: ProjectService,
    private readonly projectDrive: ProjectDriveService,
    private readonly pricing: EstimatePricingService,
  ) {}

  list(
    actor: IAuthorizedUser,
    query: CursorPaginationDto,
  ): Promise<ICursorPage<IEstimateSummary>> {
    return this.repository.list({
      actorId: actor.id,
      canReview: hasPermission(
        actor,
        PERMISSIONS.ENGINEERING_ESTIMATES_APPROVE,
      ),
      canReadProjects: hasPermission(actor, PERMISSIONS.PROJECTS_READ),
      batchCursor: query.batchCursor ?? null,
      batchSize: query.batchSize ?? PAGINATION.DEFAULT_BATCH_SIZE,
    });
  }

  async get(request: IEstimateActor): Promise<IEstimateView> {
    return this.view(await this.requireVisible(request), request.actor);
  }

  async create(
    input: CreateEngineeringEstimateDto,
    actor: IAuthorizedUser,
  ): Promise<IEstimateView> {
    const projectId = input.projectId ?? null;
    await this.requireProject(projectId, actor);
    const record: IEstimateRecord = {
      id: randomUUID(),
      name: input.name.trim(),
      projectId,
      version: 1,
      createdById: actor.id,
      updatedAt: new Date(),
      scope: ESTIMATE_SCOPE.HVAC,
      setupStep: ESTIMATE_SETUP_STEP.PROJECT,
      areas: [],
      questions: [],
    };
    await this.transactions.run((transaction): Promise<void> =>
      this.repository.insert(record, transaction),
    );
    return this.view(record, actor);
  }

  async update(
    request: IEstimateActor,
    input: UpdateEngineeringEstimateDto,
  ): Promise<IEstimateView> {
    await this.transactions.run(async (transaction): Promise<void> => {
      const record = await this.lockVersion(
        { ...request, version: input.version },
        transaction,
      );
      const projectId =
        'projectId' in input ? (input.projectId ?? null) : record.projectId;
      const reassigningProject = projectId !== record.projectId;
      if (
        reassigningProject &&
        (await this.repository.hasCopiedPlans(record.id, transaction))
      ) {
        throw new ConflictException(
          'אי אפשר לשנות את הפרויקט לאחר צירוף תוכנית ממנו',
        );
      }

      await this.requireProject(projectId, request.actor, transaction);
      const areas = input.areas ?? record.areas;
      const questions = input.questions ?? record.questions;
      const areaIds = areas.map((area): string => area.id);
      const lineIds = areas.flatMap((area): string[] =>
        area.lines.map((line): string => line.id),
      );
      const questionIds = questions.map((question): string => question.id);
      const duplicates = [areaIds, lineIds, questionIds].some(
        (ids): boolean => new Set(ids).size !== ids.length,
      );
      const invalidAnswers = questions.some(
        ({ answer, options }): boolean =>
          answer != null && !options.includes(answer),
      );
      if (duplicates || invalidAnswers) {
        throw new BadRequestException(
          'נמצאו שורות כפולות או תשובה שאינה ברשימה',
        );
      }

      const scope = input.scope ?? record.scope;
      await this.pricing.calculate(areas, scope, transaction);
      await this.repository.update(
        {
          ...record,
          projectId,
          scope,
          areas,
          questions: questions.map((question) => ({
            ...question,
            answer: question.answer ?? null,
          })),
          setupStep: input.setupStep ?? record.setupStep,
          name: input.name?.trim() ?? record.name,
          version: record.version + 1,
          updatedAt: new Date(),
        },
        transaction,
      );
    });
    return this.get(request);
  }

  async addPlan({
    content,
    marked,
    source,
    name,
    ...request
  }: IEstimatePlanInput): Promise<IEstimateView> {
    const type = getUploadType(name, content.length);
    const allowed = marked ? MARKED_MIME : ALLOWED_MIME;
    const maxBytes = marked
      ? ESTIMATE_LIMITS.MARKED_BYTES
      : ESTIMATE_LIMITS.PLAN_BYTES;
    if (!allowed.includes(type.mimeType) || content.length > maxBytes) {
      throw new BadRequestException('סוג או גודל התוכנית אינו נתמך');
    }

    assertUploadContent(type, content);
    await this.transactions.run(async (transaction): Promise<void> => {
      const record = await this.lockVersion(request, transaction);
      if (source && source.projectId !== record.projectId) {
        throw new ConflictException('הפרויקט שאליו משויך כתב הכמויות השתנה');
      }

      const plans = await this.repository.plans(record.id, transaction);
      if (plans.length >= ESTIMATE_LIMITS.PLANS) {
        throw new BadRequestException('הגעת למספר התוכניות המרבי');
      }

      await this.repository.addPlan(
        record.id,
        {
          id: randomUUID(),
          content,
          name,
          marked,
          mimeType: type.mimeType,
          source: source ?? null,
        },
        transaction,
      );
      await this.repository.update(
        { ...record, version: record.version + 1, updatedAt: new Date() },
        transaction,
      );
    });
    return this.get(request);
  }

  async linkPlan(
    request: IEstimateCommand,
    fileId: string,
  ): Promise<IEstimateView> {
    assertPermissions(
      request.actor,
      PERMISSIONS.DRIVE_READ,
      PERMISSIONS.PROJECTS_READ,
    );
    const record = await this.requireVisible(request);
    if (!record.projectId || record.version !== request.version) {
      throw new ConflictException('יש לבחור פרויקט ולרענן את כתב הכמויות');
    }

    const projectId = record.projectId;
    const files = await this.projectDrive.listProjectFiles(projectId);
    const file = files.find((candidate) => candidate.id === fileId);
    if (!file?.name) {
      throw new NotFoundException('התוכנית לא נמצאה בפרויקט');
    }

    const content = await this.projectDrive.downloadProjectFile({
      projectId,
      fileId,
      maxBytes: ESTIMATE_LIMITS.PLAN_BYTES,
      signal: AbortSignal.timeout(30 * TIME_UNITS.SECOND_MS),
    });
    return this.addPlan({
      ...request,
      name: file.name,
      content,
      marked: false,
      source: { projectId, fileId },
    });
  }

  async downloadPlan(
    request: IEstimateActor,
    planId: string,
  ): Promise<IEstimatePlan & { content: Buffer }> {
    const record = await this.requireVisible(request);
    const plan = await this.repository.getPlan(request.id, planId);
    if (!plan) {
      throw new NotFoundException('התוכנית לא נמצאה');
    }

    if (plan.source) {
      const canReadDrive = hasPermission(request.actor, PERMISSIONS.DRIVE_READ);
      const sameProject = plan.source.projectId === record.projectId;
      if (!canReadDrive || !sameProject) {
        throw new NotFoundException('התוכנית לא נמצאה');
      }
    }

    return plan;
  }

  async requireVisible(
    { id, actor }: IEstimateActor,
    transaction?: Transaction,
  ): Promise<IEstimateRecord> {
    const record = await this.repository.find(id, transaction);
    const canReview = hasPermission(
      actor,
      PERMISSIONS.ENGINEERING_ESTIMATES_APPROVE,
    );
    if (!record || (record.createdById !== actor.id && !canReview)) {
      throw new NotFoundException('כתב הכמויות לא נמצא');
    }

    assertPermissions(actor, PERMISSIONS.ENGINEERING_ESTIMATES_READ);
    await this.requireProject(record.projectId, actor, transaction);
    return record;
  }

  async lockVersion(
    request: IEstimateCommand,
    transaction: Transaction,
  ): Promise<IEstimateRecord> {
    await this.transactions.lockKey(
      `engineering-estimate:${request.id}`,
      transaction,
    );
    const record = await this.requireVisible(request, transaction);
    if (record.version !== request.version) {
      throw new ConflictException('כתב הכמויות השתנה. יש לרענן ולנסות שוב');
    }

    return record;
  }

  private async requireProject(
    projectId: string | null,
    actor: IAuthorizedUser,
    transaction?: Transaction,
  ): Promise<void> {
    if (projectId === null) {
      return;
    }

    assertPermissions(actor, PERMISSIONS.PROJECTS_READ);
    await this.projects.quotationSnapshot(projectId, transaction);
  }

  private view(
    record: IEstimateRecord,
    actor: IAuthorizedUser,
  ): Promise<IEstimateView> {
    return this.transactions.run(
      async (transaction): Promise<IEstimateView> => {
        const revision = await this.repository.revision(
          record.id,
          record.version,
          transaction,
        );
        const canReadDrive = hasPermission(actor, PERMISSIONS.DRIVE_READ);
        const plans = await this.repository.plans(
          record.id,
          transaction,
          canReadDrive,
        );
        const lines =
          revision?.snapshot.lines ??
          (await this.pricing.calculate(
            record.areas,
            record.scope,
            transaction,
          ));
        const status = revision?.status ?? ESTIMATE_STATUS.DRAFT;
        const { createdById, ...view } = record;
        void createdById;
        return {
          ...view,
          plans,
          lines,
          subtotal: estimateSubtotal(lines),
          status,
          approvedVersion:
            status === ESTIMATE_STATUS.APPROVED ? record.version : null,
          quotationId: revision?.quotationUnavailable
            ? null
            : (revision?.quotationId ?? null),
          quotationUnavailable: revision?.quotationUnavailable ?? false,
          quotationCustomerId: revision?.snapshot.customerId ?? null,
        };
      },
    );
  }
}
