import { Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { ProviderNames } from './provider-names';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class DatabaseTransactionService {
  constructor(
    @Inject(ProviderNames.SEQUELIZE) private readonly sequelize: Sequelize,
  ) {}

  run<T>(work: (transaction: Transaction) => Promise<T>): Promise<T> {
    return this.sequelize.transaction(work);
  }
}
