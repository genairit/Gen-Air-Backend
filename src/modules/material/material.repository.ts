import type {
  MaterialQueryDto,
  CreateMaterialDto,
  UpdateMaterialDto,
} from './dto/material.dto';

import { Injectable } from '@nestjs/common';
import { Op, Transaction } from 'sequelize';
import { Material } from './entities/material.entity';
import { toContainsPattern } from '@Utilities/query.utility';

@Injectable()
export class MaterialRepository {
  search(query: MaterialQueryDto): Promise<Material[]> {
    const pattern = query.search
      ? toContainsPattern(query.search.trim())
      : null;
    return Material.findAll({
      where: {
        ...(query.status && { status: query.status }),
        ...(query.category && { category: query.category }),
        ...(pattern && {
          [Op.or]: [
            { code: { [Op.iLike]: pattern } },
            { name: { [Op.iLike]: pattern } },
            { specification: { [Op.iLike]: pattern } },
          ],
        }),
      },
      order: [['code', 'ASC']],
      limit: query.limit ?? 50,
    });
  }
  findById(id: string, transaction?: Transaction): Promise<Material | null> {
    return Material.findByPk(id, { transaction });
  }
  findByCode(
    code: string,
    transaction?: Transaction,
  ): Promise<Material | null> {
    return Material.findOne({ where: { code }, transaction });
  }
  findByIds(ids: string[], transaction?: Transaction): Promise<Material[]> {
    return Material.findAll({ where: { id: { [Op.in]: ids } }, transaction });
  }
  create(
    values: CreateMaterialDto,
    transaction: Transaction,
  ): Promise<Material> {
    return Material.create(
      {
        ...values,
        specification: values.specification ?? null,
        notes: values.notes ?? '',
      },
      { transaction },
    );
  }
  async update(
    material: Material,
    changes: UpdateMaterialDto,
    transaction: Transaction,
  ): Promise<void> {
    await material.update(changes, { transaction });
  }
}
