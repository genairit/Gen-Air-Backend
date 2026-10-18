import {
  IProjectStageCount,
  IProjectStageCounts,
} from '../interfaces/project.interface';

export const toProjectStageCounts = (
  stageCounts: IProjectStageCount[],
): IProjectStageCounts => ({
  total: stageCounts.reduce((total, { count }) => total + count, 0),
  byStage: Object.fromEntries(
    stageCounts.map(({ stageId, count }) => [stageId, count]),
  ),
});
