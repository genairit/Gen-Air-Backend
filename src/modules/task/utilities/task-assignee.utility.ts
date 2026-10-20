import { ITask } from '../interfaces/task.interface';
import { UpdateTaskDto } from '../dto/update-task.dto';

export const findChangedAssigneeId = (
  task: ITask,
  input: UpdateTaskDto,
): string | null => {
  const requestedAssigneeId = input.assigneeId ?? null;
  const isAssigneeChanging =
    'assigneeId' in input && requestedAssigneeId !== task.assigneeId;

  return isAssigneeChanging ? requestedAssigneeId : null;
};
