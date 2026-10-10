import { Injectable } from '@nestjs/common';
import { ProjectType } from './entities/project-type.entity';

@Injectable()
export class ProjectTypeRepository {
  findAll(): Promise<ProjectType[]> {
    return ProjectType.findAll({ order: [['position', 'ASC']] });
  }

  findById(id: string): Promise<ProjectType | null> {
    return ProjectType.findByPk(id);
  }
}
