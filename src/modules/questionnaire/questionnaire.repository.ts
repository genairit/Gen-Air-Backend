import { Transaction } from 'sequelize';
import { Injectable } from '@nestjs/common';
import { Questionnaire } from './entities/questionnaire.entity';

@Injectable()
export class QuestionnaireRepository {
  findActive(slug: string): Promise<Questionnaire | null> {
    return Questionnaire.findOne({ where: { slug, acceptingResponses: true } });
  }
  findById(
    id: string,
    transaction: Transaction,
  ): Promise<Questionnaire | null> {
    return Questionnaire.findByPk(id, {
      transaction,
      lock: transaction.LOCK.SHARE,
    });
  }
}
