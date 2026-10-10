import { PAGINATION } from '@Constants/pagination.constant';
import { CursorPaginationDto } from '@Dto/cursor-pagination.dto';
import { ICursorBatch } from '@Interfaces/cursor-page.interface';

export const toCursorBatch = (
  pagination: CursorPaginationDto,
): ICursorBatch => ({
  batchCursor: pagination.batchCursor ?? null,
  batchSize: pagination.batchSize ?? PAGINATION.DEFAULT_BATCH_SIZE,
});
