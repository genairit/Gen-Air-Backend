import {
  Inject,
  Injectable,
  forwardRef,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import { ProjectService } from '@Modules/project/project.service';
import { ProjectStageRepository } from './project-stage.repository';
import { IProjectStage } from './interfaces/project-stage.interface';
import { CreateProjectStageDto } from './dto/create-project-stage.dto';
import { UpdateProjectStageDto } from './dto/update-project-stage.dto';
import { ReorderProjectStagesDto } from './dto/reorder-project-stage.dto';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

@Injectable()
export class ProjectStageService {
  constructor(
    private readonly projectStageRepository: ProjectStageRepository,
    private readonly databaseTransactionService: DatabaseTransactionService,
    @Inject(forwardRef(() => ProjectService))
    private readonly projectService: ProjectService,
  ) {}

  getAll(): Promise<IProjectStage[]> {
    return this.projectStageRepository.findAll();
  }

  async getById(id: string): Promise<IProjectStage> {
    const stage = await this.projectStageRepository.findById(id);

    if (!stage) {
      throw new NotFoundException(`Project stage ${id} was not found`);
    }

    return stage;
  }

  async getInitialStage(): Promise<IProjectStage> {
    const initialStage = await this.projectStageRepository.findFirst();

    if (!initialStage) {
      throw new ConflictException('No project stages are configured');
    }

    return initialStage;
  }

  async create(stage: CreateProjectStageDto): Promise<IProjectStage> {
    const maxPosition = await this.projectStageRepository.findMaxPosition();

    return this.projectStageRepository.create({
      name: stage.name,
      tag: stage.tag ?? null,
      color: stage.color ?? null,
      position: maxPosition + 1,
      description: stage.description ?? null,
    });
  }

  async update(
    id: string,
    changes: UpdateProjectStageDto,
  ): Promise<IProjectStage> {
    const isUpdated = await this.projectStageRepository.update(id, changes);

    if (!isUpdated) {
      throw new NotFoundException(`Project stage ${id} was not found`);
    }

    return this.getById(id);
  }

  async reorder(order: ReorderProjectStagesDto): Promise<IProjectStage[]> {
    const stages = await this.projectStageRepository.findAll();
    const existingIds = new Set(stages.map((stage) => stage.id));
    const coversEveryStage = order.stageIds.length === existingIds.size;
    const referencesOnlyExisting = order.stageIds.every((id) =>
      existingIds.has(id),
    );

    if (!coversEveryStage || !referencesOnlyExisting) {
      throw new BadRequestException(
        'stageIds must list every active stage exactly once',
      );
    }

    await this.databaseTransactionService.run((transaction) =>
      this.projectStageRepository.reorder(order.stageIds, transaction),
    );

    return this.getAll();
  }

  async delete(id: string): Promise<void> {
    const [stageCount, projectCount] = await Promise.all([
      this.projectStageRepository.count(),
      this.projectService.countByStage(id),
      this.getById(id),
    ]);

    if (stageCount <= 1) {
      throw new ConflictException('At least one project stage must remain');
    }

    if (projectCount > 0) {
      throw new ConflictException(
        `Stage ${id} still holds ${projectCount} projects; move them first`,
      );
    }

    await this.projectStageRepository.softDelete(id);
  }
}
