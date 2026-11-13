import 'reflect-metadata';
import { validate } from 'class-validator';
import { MoveProjectDto } from './move-project.dto';
import { UpdateProjectDto } from './update-project.dto';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { plainToInstance, ClassConstructor } from 'class-transformer';
import { PROJECT_STATUS_IDS } from '@Constants/project-status.constant';

const STAGE_ID = PROJECT_STATUS_IDS.WAITING_FOR_RESPONSE;
const TOO_LONG_NOTE = 'א'.repeat(FIELD_LENGTHS.TRANSITION_NOTE + 1);

const findInvalidFields = async (
  dto: ClassConstructor<object>,
  payload: object,
): Promise<string[]> => {
  const errors = await validate(plainToInstance(dto, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  return errors.map((error) => error.property);
};

describe('MoveProjectDto', () => {
  it('trims the note', () => {
    const move = plainToInstance(MoveProjectDto, {
      stageId: STAGE_ID,
      note: '\t ממתינים לתשובה \n',
    });

    expect(move.note).toBe('ממתינים לתשובה');
  });

  it('keeps the note optional so the service decides when it is required', async () => {
    await expect(
      findInvalidFields(MoveProjectDto, { stageId: STAGE_ID }),
    ).resolves.toEqual([]);
  });

  it('accepts a note padded beyond the limit when its trimmed text fits', async () => {
    const note = ` ${'א'.repeat(FIELD_LENGTHS.TRANSITION_NOTE)} `;

    await expect(
      findInvalidFields(MoveProjectDto, { stageId: STAGE_ID, note }),
    ).resolves.toEqual([]);
  });

  it('rejects a note longer than the stored column', async () => {
    await expect(
      findInvalidFields(MoveProjectDto, {
        stageId: STAGE_ID,
        note: TOO_LONG_NOTE,
      }),
    ).resolves.toEqual(['note']);
  });
});

describe('UpdateProjectDto stageNote', () => {
  it('trims the stage note', () => {
    const changes = plainToInstance(UpdateProjectDto, {
      stageId: STAGE_ID,
      stageNote: '  ממתינים לתשובה  ',
    });

    expect(changes.stageNote).toBe('ממתינים לתשובה');
  });

  it('rejects a stage note longer than the stored column', async () => {
    await expect(
      findInvalidFields(UpdateProjectDto, {
        stageId: STAGE_ID,
        stageNote: TOO_LONG_NOTE,
      }),
    ).resolves.toEqual(['stageNote']);
  });
});
