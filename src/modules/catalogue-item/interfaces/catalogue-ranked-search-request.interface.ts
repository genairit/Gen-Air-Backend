import type { Transaction } from 'sequelize';
import type { CatalogueQueryDto } from '../dto/catalogue-query.dto';

export interface ICatalogueRankedSearchRequest {
  userId: string;
  query: CatalogueQueryDto;
  exactBrand: string | null;
  transaction?: Transaction;
}
