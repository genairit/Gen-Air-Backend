import { Injectable, NotFoundException } from '@nestjs/common';
import { ProjectTypeRepository } from './project-type.repository';
import { IProjectType } from './interfaces/project-type.interface';

@Injectable()
export class ProjectTypeService {
  constructor(private readonly projectTypeRepository: ProjectTypeRepository) {}

  getAll(): Promise<IProjectType[]> {
    return this.projectTypeRepository.findAll();
  }

  async getById(id: string): Promise<IProjectType> {
    const projectType = await this.projectTypeRepository.findById(id);

    if (!projectType) {
      throw new NotFoundException(`Project type ${id} was not found`);
    }

    return projectType;
  }
}
