import { Transaction } from 'sequelize';
import { Injectable } from '@nestjs/common';
import { DriveTemplateFolder } from './entities/drive-template-folder.entity';
import { TDriveTemplateFolderCreationAttributes } from './interfaces/drive-template-folder.interface';

@Injectable()
export class DriveTemplateFolderRepository {
  findAll(): Promise<DriveTemplateFolder[]> {
    return DriveTemplateFolder.findAll();
  }

  findById(id: string): Promise<DriveTemplateFolder | null> {
    return DriveTemplateFolder.findByPk(id);
  }

  async findMaxSiblingPosition(parentId: string | null): Promise<number> {
    const maxPosition = await DriveTemplateFolder.max<
      number | null,
      DriveTemplateFolder
    >('position', { where: { parentId } });

    return maxPosition ?? 0;
  }

  create(
    attributes: TDriveTemplateFolderCreationAttributes,
    transaction?: Transaction,
  ): Promise<DriveTemplateFolder> {
    return DriveTemplateFolder.create(attributes, { transaction });
  }

  async rename(
    id: string,
    name: string,
    transaction?: Transaction,
  ): Promise<boolean> {
    const [updatedCount] = await DriveTemplateFolder.update(
      { name },
      { where: { id }, transaction },
    );

    return updatedCount > 0;
  }

  async delete(id: string, transaction?: Transaction): Promise<boolean> {
    const deletedCount = await DriveTemplateFolder.destroy({
      where: { id },
      transaction,
    });

    return deletedCount > 0;
  }
}
