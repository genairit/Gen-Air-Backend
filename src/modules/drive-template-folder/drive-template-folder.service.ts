import {
  IDriveTemplateFolder,
  IDriveTemplateFolderNode,
} from './interfaces/drive-template-folder.interface';

import { Injectable, NotFoundException } from '@nestjs/common';
import { buildFolderTree } from './utilities/drive-template-tree.utility';
import { DriveTemplateFolderRepository } from './drive-template-folder.repository';
import { CreateDriveTemplateFolderDto } from './dto/create-drive-template-folder.dto';
import { UpdateDriveTemplateFolderDto } from './dto/update-drive-template-folder.dto';

@Injectable()
export class DriveTemplateFolderService {
  constructor(
    private readonly driveTemplateFolderRepository: DriveTemplateFolderRepository,
  ) {}

  async getTree(): Promise<IDriveTemplateFolderNode[]> {
    const folders = await this.driveTemplateFolderRepository.findAll();

    return buildFolderTree(folders);
  }

  async getById(id: string): Promise<IDriveTemplateFolder> {
    const folder = await this.driveTemplateFolderRepository.findById(id);

    if (!folder) {
      throw new NotFoundException(`Template folder ${id} was not found`);
    }

    return folder;
  }

  async create(
    folder: CreateDriveTemplateFolderDto,
  ): Promise<IDriveTemplateFolder> {
    const parentId = folder.parentId ?? null;

    if (parentId) {
      await this.getById(parentId);
    }

    const maxPosition =
      await this.driveTemplateFolderRepository.findMaxSiblingPosition(parentId);

    return this.driveTemplateFolderRepository.create({
      parentId,
      name: folder.name,
      position: maxPosition + 1,
    });
  }

  async rename(
    id: string,
    changes: UpdateDriveTemplateFolderDto,
  ): Promise<IDriveTemplateFolder> {
    const isRenamed = await this.driveTemplateFolderRepository.rename(
      id,
      changes.name,
    );

    if (!isRenamed) {
      throw new NotFoundException(`Template folder ${id} was not found`);
    }

    return this.getById(id);
  }

  async delete(id: string): Promise<void> {
    const isDeleted = await this.driveTemplateFolderRepository.delete(id);

    if (!isDeleted) {
      throw new NotFoundException(`Template folder ${id} was not found`);
    }
  }
}
