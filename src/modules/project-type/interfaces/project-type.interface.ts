export interface IProjectType {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  position: number;
  tag: string | null;
  icon: string | null;
  subtitle: string | null;
  description: string | null;
}
