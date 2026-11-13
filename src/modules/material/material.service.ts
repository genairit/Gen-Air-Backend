import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';

import type {
  MaterialQueryDto,
  CreateMaterialDto,
  UpdateMaterialDto,
} from './dto/material.dto';

import { Material } from './entities/material.entity';
import { MaterialRepository } from './material.repository';
import { CatalogueMaterialService } from './catalogue-material.service';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

@Injectable()
export class MaterialService {
  constructor(
    private readonly repository: MaterialRepository,
    private readonly catalogueMaterials: CatalogueMaterialService,
    private readonly transactions: DatabaseTransactionService,
  ) {}

  search(query: MaterialQueryDto): Promise<Material[]> {
    return this.repository.search(query);
  }
  async get(id: string): Promise<Material> {
    const material = await this.repository.findById(id);
    if (!material) {
      throw new NotFoundException('חומר לא נמצא');
    }
    return material;
  }
  create(values: CreateMaterialDto): Promise<Material> {
    this.validateText(values);
    return this.transactions.run(async (transaction) => {
      await this.transactions.lockKey(`material:${values.code}`, transaction);
      if (await this.repository.findByCode(values.code, transaction)) {
        throw new ConflictException('קוד חומר כבר קיים');
      }
      return this.repository.create(values, transaction);
    });
  }
  async update(
    id: string,
    changes: UpdateMaterialDto,
    actorId: string,
  ): Promise<Material> {
    this.validateText(changes);
    await this.transactions.run(async (transaction) => {
      const material = await this.repository.findById(id, transaction);
      if (!material) {
        throw new NotFoundException('חומר לא נמצא');
      }
      const snapshotChanged = this.snapshotChanged(material, changes);
      await this.repository.update(material, changes, transaction);
      if (snapshotChanged) {
        await this.catalogueMaterials.refreshForMaterial(
          id,
          actorId,
          transaction,
        );
      }
    });
    return this.get(id);
  }
  private validateText(values: { name?: string; category?: string }): void {
    if (Reflect.has(values, 'name') && !values.name?.trim()) {
      throw new BadRequestException('שם חומר חובה');
    }
    if (Reflect.has(values, 'category') && !values.category?.trim()) {
      throw new BadRequestException('קטגוריית חומר חובה');
    }
  }
  private snapshotChanged(
    material: Material,
    changes: UpdateMaterialDto,
  ): boolean {
    return (['name', 'category', 'specification', 'status'] as const).some(
      (field) =>
        Reflect.has(changes, field) && changes[field] !== material[field],
    );
  }
}
