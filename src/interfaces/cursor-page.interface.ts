import { CursorDirectionType } from '@Constants/pagination.constant';

export interface ICursorPosition {
  id: string;
  createdAt: Date;
}

export interface ICursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ICursorBatch {
  batchSize: number;
  batchCursor: string | null;
  direction?: CursorDirectionType;
}
