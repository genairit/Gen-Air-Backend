import { Transaction } from 'sequelize';
import { Injectable } from '@nestjs/common';
import { QuestionnaireSubmission } from './entities/questionnaire-submission.entity';
import { TQuestionnaireSubmissionCreation } from './interfaces/questionnaire-submission.interface';

@Injectable()
export class QuestionnaireSubmissionRepository {
  findByRequestId(
    requestId: string,
    transaction: Transaction,
  ): Promise<QuestionnaireSubmission | null> {
    return QuestionnaireSubmission.findOne({
      where: { requestId },
      transaction,
    });
  }
  create(
    values: TQuestionnaireSubmissionCreation,
    transaction: Transaction,
  ): Promise<QuestionnaireSubmission> {
    return QuestionnaireSubmission.create(values, { transaction });
  }
}
