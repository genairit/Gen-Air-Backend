import {
  TASK_TYPES,
  TASK_TYPE_LABELS,
  PROTECTED_TASK_TYPES,
  TASK_STORED_TITLE_LENGTH,
} from '@Modules/task/constants/task-type.constant';

import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { toProjectTaskAttributes } from './project-task.utility';

describe('project automatic task defaults', () => {
  it.each(PROTECTED_TASK_TYPES)(
    'keeps the complete maximum-length project name for %s',
    (type) => {
      const name = 'א'.repeat(FIELD_LENGTHS.PROJECT_NAME);
      const task = toProjectTaskAttributes(
        { id: 'project', name },
        'creator',
        type,
      );
      expect(task.title).toBe(`${TASK_TYPE_LABELS[type]} — ${name}`);
      expect(task.title.length).toBeLessThanOrEqual(TASK_STORED_TITLE_LENGTH);
      expect(task.description).toContain(name);
      expect(task.assigneeId).toBeNull();
      expect(task.dueDate).toBeNull();
      expect(task.customerId).toBeNull();
    },
  );

  it('uses separate meaningful quotation and planning descriptions without new workflow gates', () => {
    const project = { id: 'project', name: 'בניין חדש' };
    const quotation = toProjectTaskAttributes(
      project,
      'creator',
      TASK_TYPES.QUOTATION,
    );
    const planning = toProjectTaskAttributes(
      project,
      'creator',
      TASK_TYPES.PLANNING,
    );
    expect(quotation.description).toContain(
      'קביעת כמויות ומחירים ובדיקת תנאי התשלום',
    );
    expect(planning.description).toContain('גיבוש פתרון המיזוג');
    expect(quotation.taskType).toBe(TASK_TYPES.QUOTATION);
    expect(planning.taskType).toBe(TASK_TYPES.PLANNING);
    expect(quotation.projectId).toBe(project.id);
    expect(planning.projectId).toBe(project.id);
  });
});
