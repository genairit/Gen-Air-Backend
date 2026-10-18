export interface IProjectStage {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  position: number;
  tag: string | null;
  color: string | null;
  deletedAt: Date | null;
  description: string | null;
}

export type TProjectStageCreationAttributes = Pick<
  IProjectStage,
  'name' | 'description' | 'tag' | 'color' | 'position'
>;
