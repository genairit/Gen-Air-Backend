import { Injectable } from '@nestjs/common';
import { ProjectStage } from './entities/project-stage.entity';

@Injectable()
export class ProjectStageRepository {
  findAll(): Promise<ProjectStage[]> {
    return ProjectStage.findAll({ order: [['position', 'ASC']] });
  }

  findById(id: string): Promise<ProjectStage | null> {
    return ProjectStage.findByPk(id);
  }
}
