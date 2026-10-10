import { Sequelize } from 'sequelize-typescript';
import { ProviderNames } from './provider-names';
import { DatabaseProvider } from './database.provider';
import { Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { DatabaseTransactionService } from './database-transaction.service';

@Module({
  providers: [DatabaseProvider, DatabaseTransactionService],
  exports: [DatabaseProvider, DatabaseTransactionService],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(
    @Inject(ProviderNames.SEQUELIZE) private readonly sequelize: Sequelize,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.sequelize.close();
  }
}
