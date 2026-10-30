import { Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { ProviderNames } from './provider-names';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class DatabaseTransactionService {
  constructor(
    @Inject(ProviderNames.SEQUELIZE) private readonly sequelize: Sequelize,
  ) {}

  async lockKey(key: string, transaction: Transaction): Promise<void> {
    await this.sequelize.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($key, 0))',
      { bind: { key }, transaction },
    );
  }

  run<T>(work: (transaction: Transaction) => Promise<T>): Promise<T> {
    return this.sequelize.transaction(work);
  }
}
