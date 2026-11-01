import {
  IQuestionnaire,
  TPublicQuestionnaire,
} from './interfaces/questionnaire.interface';

import { Transaction } from 'sequelize';
import { Injectable, NotFoundException } from '@nestjs/common';
import { QuestionnaireRepository } from './questionnaire.repository';

@Injectable()
export class QuestionnaireService {
  constructor(private readonly repository: QuestionnaireRepository) {}
  async findActive(slug: string): Promise<TPublicQuestionnaire> {
    const questionnaire = await this.repository.findActive(slug);
    if (!questionnaire) {
      throw new NotFoundException('Questionnaire is not available');
    }
    const { id, version, title, introduction, definition } = questionnaire;
    return { id, slug, version, title, introduction, definition };
  }
  findById(
    id: string,
    transaction: Transaction,
  ): Promise<IQuestionnaire | null> {
    return this.repository.findById(id, transaction);
  }
}
