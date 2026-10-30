import { IProjectTaskDescription } from '../interfaces/project-task.interface';
import { ProtectedTaskType } from '@Modules/task/constants/task-type.constant';

export const PROJECT_TASK_DESCRIPTIONS: Record<
  ProtectedTaskType,
  IProjectTaskDescription
> = {
  quotation: {
    prefix: 'הכנת הצעת מחיר עבור הפרויקט ',
    suffix:
      ': ריכוז דרישות הלקוח והפריטים הנדרשים, קביעת כמויות ומחירים ובדיקת תנאי התשלום, לצורך הכנת הצעה מסודרת ללקוח.',
  },
  planning: {
    prefix: 'הכנת תכנון עבור הפרויקט ',
    suffix:
      ': בחינת דרישות הפרויקט והתוכניות הזמינות, גיבוש פתרון המיזוג ותיאום הפרטים הנדרשים להכנת תוכנית לביצוע.',
  },
};
