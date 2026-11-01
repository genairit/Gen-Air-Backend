import { Sequelize } from 'sequelize-typescript';
import { Questionnaire } from './entities/questionnaire.entity';
import { QuestionnaireSubmission } from '@Modules/questionnaire-submission/entities/questionnaire-submission.entity';

describe('Questionnaire Sequelize schema registration', () => {
  const database = new Sequelize({
    dialect: 'postgres',
    logging: false,
    define: { underscored: true, timestamps: true },
    models: [Questionnaire, QuestionnaireSubmission],
  });
  afterAll(async () => database.close());
  it('registers both tables without requiring a database connection', () => {
    expect(Questionnaire.getTableName()).toBe('questionnaires');
    expect(QuestionnaireSubmission.getTableName()).toBe(
      'questionnaire_submissions',
    );
    expect(database.modelManager.models).toEqual(
      expect.arrayContaining([Questionnaire, QuestionnaireSubmission]),
    );
  });
  it('maps properties to the migration columns and preserves JSON data types', () => {
    const fields = QuestionnaireSubmission.getAttributes();
    expect(fields.questionnaireId.field).toBe('questionnaire_id');
    expect(fields.requestId.field).toBe('request_id');
    expect(fields.fullName.field).toBe('full_name');
    expect(String(fields.answers.type)).toBe('JSONB');
    expect(String(Questionnaire.rawAttributes.definition.type)).toBe('JSONB');
    expect(Questionnaire.rawAttributes.acceptingResponses.defaultValue).toBe(
      false,
    );
  });
});
