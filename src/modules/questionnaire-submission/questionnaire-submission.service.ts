import {
  Injectable,
  HttpException,
  NotFoundException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';

import {
  hasValidQuestionnaireAnswers,
  isSameQuestionnaireSubmission,
} from './utilities/questionnaire-submission.utility';

import {
  IQuestionnaireReceipt,
  IQuestionnaireSubmission,
  TQuestionnaireSubmissionCreation,
} from './interfaces/questionnaire-submission.interface';

import { TypedLogger } from '@Logger/logger.service';
import { QuestionnaireService } from '@Modules/questionnaire/questionnaire.service';
import { QuestionnaireSubmissionRepository } from './questionnaire-submission.repository';
import { CreateQuestionnaireSubmissionDto } from './dto/create-questionnaire-submission.dto';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

@Injectable()
export class QuestionnaireSubmissionService {
  private readonly logger = new TypedLogger(
    QuestionnaireSubmissionService.name,
  );
  constructor(
    private readonly repository: QuestionnaireSubmissionRepository,
    private readonly questionnaires: QuestionnaireService,
    private readonly transactions: DatabaseTransactionService,
  ) {}
  async submit(
    input: CreateQuestionnaireSubmissionDto,
  ): Promise<IQuestionnaireReceipt> {
    try {
      return await this.persist(input);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error({
        message: 'Questionnaire persistence failed',
        error: new Error('Database operation failed'),
      });
      throw new InternalServerErrorException(
        'Unable to store questionnaire submission',
      );
    }
  }

  private receiptForRetry(
    existing: IQuestionnaireSubmission,
    input: TQuestionnaireSubmissionCreation,
  ): IQuestionnaireReceipt {
    if (!isSameQuestionnaireSubmission(existing, input)) {
      throw new ConflictException(
        'Submission request identifier has already been used',
      );
    }
    return { id: existing.id, receivedAt: existing.createdAt };
  }

  private persist(
    input: CreateQuestionnaireSubmissionDto,
  ): Promise<IQuestionnaireReceipt> {
    return this.transactions.run(async (transaction) => {
      await this.transactions.lockKey(
        `questionnaire-submission:${input.requestId}`,
        transaction,
      );
      const existing = await this.repository.findByRequestId(
        input.requestId,
        transaction,
      );
      if (existing) {
        return this.receiptForRetry(existing, input);
      }
      const questionnaire = await this.questionnaires.findById(
        input.questionnaireId,
        transaction,
      );
      if (!questionnaire?.acceptingResponses) {
        throw new NotFoundException('Questionnaire is not available');
      }
      if (!hasValidQuestionnaireAnswers(questionnaire, input.answers)) {
        throw new BadRequestException(
          'Answers do not match the questionnaire version',
        );
      }
      const submission = await this.repository.create(input, transaction);
      return { id: submission.id, receivedAt: submission.createdAt };
    });
  }
}
