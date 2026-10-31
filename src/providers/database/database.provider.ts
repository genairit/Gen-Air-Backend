import { Provider } from '@nestjs/common';
import { ProviderNames } from './provider-names';
import { TypedLogger } from '@Logger/logger.service';
import { Task } from '@Modules/task/entities/task.entity';
import { User } from '@Modules/user/entities/user.entity';
import { Sequelize, SequelizeOptions } from 'sequelize-typescript';
import { Project } from '@Modules/project/entities/project.entity';
import { Customer } from '@Modules/customer/entities/customer.entity';
import { Quotation } from '@Modules/quotation/entities/quotation.entity';
import { Permission } from '@Modules/permission/entities/permission.entity';
import { EnvironmentManager } from '../../utilities/environment-manager.utility';
import { ProjectType } from '@Modules/project-type/entities/project-type.entity';
import { ProjectStage } from '@Modules/project-stage/entities/project-stage.entity';
import { QuotationRule } from '@Modules/quotation-rule/entities/quotation-rule.entity';
import { CatalogueItem } from '@Modules/catalogue-item/entities/catalogue-item.entity';
import { QuotationItem } from '@Modules/quotation-item/entities/quotation-item.entity';
import { ProjectMember } from '@Modules/project-member/entities/project-member.entity';
import { RolePermission } from '@Modules/role-permission/entities/role-permission.entity';
import { TaskStatusTransition } from '@Modules/task/entities/task-status-transition.entity';
import { CustomerContact } from '@Modules/customer-contact/entities/customer-contact.entity';
import { QuotationSection } from '@Modules/quotation-section/entities/quotation-section.entity';
import { CatalogueItemUsage } from '@Modules/catalogue-item-usage/entities/catalogue-item-usage.entity';
import { DriveTemplateFolder } from '@Modules/drive-template-folder/entities/drive-template-folder.entity';
import { ProjectStageTransition } from '@Modules/project-stage-transition/entities/project-stage-transition.entity';

const logger = new TypedLogger('DatabaseProvider');

const DEFAULT_DB_PORT = '5432';

const buildSequelizeOptions = (): SequelizeOptions => {
  const dbName = EnvironmentManager.get('DB_NAME', { errorOnMissing: true });
  const dbUser = EnvironmentManager.get('DB_USER', { errorOnMissing: true });
  const dbPassword = EnvironmentManager.get('DB_PASS', {
    errorOnMissing: true,
  });
  const dbHost = EnvironmentManager.get('DB_HOST', { errorOnMissing: true });
  const dbPort = EnvironmentManager.get('DB_PORT', {
    defaultValue: DEFAULT_DB_PORT,
  });
  const useSSL = EnvironmentManager.get('DB_SSL') === 'true';

  return {
    host: dbHost,
    port: Number(dbPort),
    database: dbName,
    username: dbUser,
    password: dbPassword,
    dialect: 'postgres',
    logging: EnvironmentManager.get('DB_LOGGING') === 'true',
    timezone: 'UTC',
    define: { underscored: true, timestamps: true },
    pool: {
      min: 0,
      idle: 10000,
      acquire: 60000,
      max: Number(
        EnvironmentManager.get('MAX_CONNECTIONS', { defaultValue: '10' }),
      ),
    },
    ...(useSSL && {
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized:
            EnvironmentManager.get('DB_SSL_REJECT_UNAUTHORIZED') !== 'false',
        },
      },
    }),
  };
};

export const DatabaseProvider: Provider = {
  provide: ProviderNames.SEQUELIZE,
  useFactory: async () => {
    const sequelize = new Sequelize(buildSequelizeOptions());

    sequelize.addModels([
      Quotation,
      QuotationSection,
      QuotationItem,
      CatalogueItem,
      CatalogueItemUsage,
      QuotationRule,
      Permission,
      RolePermission,
      Task,
      TaskStatusTransition,
      User,
      Project,
      Customer,
      CustomerContact,
      ProjectType,
      ProjectStage,
      ProjectMember,
      DriveTemplateFolder,
      ProjectStageTransition,
    ]);

    try {
      await sequelize.authenticate();
      logger.info({ message: 'Connection to database has been established' });
    } catch (error) {
      logger.error({ error, message: 'Unable to connect to the database' });
      throw error;
    }

    return sequelize;
  },
};
