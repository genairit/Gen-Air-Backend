import { Op, WhereOptions } from 'sequelize';
import { ITaskCursorContext } from '../interfaces/task.interface';
import { TASK_DATE_COMPARISONS } from '../constants/task-order.constant';

const taskDateCursorWhere = ({
  position,
  sort,
}: ITaskCursorContext): WhereOptions[] => {
  if (position.dueDate === null) {
    return [{ dueDate: null, id: { [Op.gt]: position.id } }];
  }

  return [
    { dueDate: { [TASK_DATE_COMPARISONS[sort]]: position.dueDate } },
    { dueDate: null },
    { dueDate: position.dueDate, id: { [Op.gt]: position.id } },
  ];
};

export const taskDueCursorPredicate = (
  context: ITaskCursorContext,
): WhereOptions => ({
  [Op.or]: taskDateCursorWhere(context),
});

export const taskUrgentCursorPredicate = (
  context: ITaskCursorContext,
): WhereOptions => {
  const lowerUrgency: WhereOptions[] = context.position.isUrgent
    ? [{ isUrgent: false }]
    : [];
  return {
    [Op.or]: [
      ...lowerUrgency,
      {
        isUrgent: context.position.isUrgent,
        [Op.or]: taskDateCursorWhere(context),
      },
    ],
  };
};
