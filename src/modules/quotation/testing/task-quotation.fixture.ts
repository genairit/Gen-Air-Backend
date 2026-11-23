import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { QueryTypes } from 'sequelize';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { mock } from 'jest-mock-extended';
import { execFile } from 'node:child_process';
import { Sequelize } from 'sequelize-typescript';
import { QuotationService } from '../quotation.service';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { UserService } from '@Modules/user/user.service';
import { Quotation } from '../entities/quotation.entity';
import { User } from '@Modules/user/entities/user.entity';
import { USER_ROLES } from '@Constants/user-role.constant';
import { QuotationRepository } from '../quotation.repository';
import { UserRepository } from '@Modules/user/user.repository';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { ProjectService } from '@Modules/project/project.service';
import { PAYMENT_TERMS } from '@Constants/payment-terms.constant';
import { CustomerService } from '@Modules/customer/customer.service';
import { Customer } from '@Modules/customer/entities/customer.entity';
import { UserRoleService } from '@Modules/user-role/user-role.service';
import { ProjectRepository } from '@Modules/project/project.repository';
import { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { quotationRuleFixture } from '../../../testing/quotation.fixture';
import { CustomerRepository } from '@Modules/customer/customer.repository';
import { QuotationSelectionService } from '../quotation-selection.service';
import { TaskQuotationLinksService } from '../task-quotation-links.service';
import { IPaymentConfiguration } from '@Interfaces/payment-configuration.interface';
import { QuotationRuleService } from '@Modules/quotation-rule/quotation-rule.service';
import { CatalogueItemService } from '@Modules/catalogue-item/catalogue-item.service';
import { QuotationItemService } from '@Modules/quotation-item/quotation-item.service';
import { QuotationItem } from '@Modules/quotation-item/entities/quotation-item.entity';
import { QuotationItemRepository } from '@Modules/quotation-item/quotation-item.repository';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import { QuotationSectionService } from '@Modules/quotation-section/quotation-section.service';
import { QuotationProjectService } from '@Modules/quotation-project/quotation-project.service';
import { QuotationProject } from '@Modules/quotation-project/entities/quotation-project.entity';
import { QuotationSection } from '@Modules/quotation-section/entities/quotation-section.entity';
import { QuotationSectionRepository } from '@Modules/quotation-section/quotation-section.repository';
import { QuotationProjectRepository } from '@Modules/quotation-project/quotation-project.repository';
import { validateRuleConfiguration } from '@Modules/quotation-rule/utilities/quotation-rule.utility';

const execute = promisify(execFile);
const binaries = resolve(
  process.cwd(),
  'node_modules',
  '@embedded-postgres',
  `${process.platform}-${process.arch}`,
  'native',
  'bin',
);

export class TaskQuotationFixture {
  readonly taskId = randomUUID();
  readonly customerId = randomUUID();
  readonly projectId = randomUUID();
  readonly actor = mock<IAuthorizedUser>({
    id: randomUUID(),
    firstName: 'Quotation',
    lastName: 'Engineer',
    permissions: [
      PERMISSIONS.TASKS_READ,
      PERMISSIONS.QUOTATIONS_READ,
      PERMISSIONS.QUOTATIONS_CREATE,
      PERMISSIONS.PROJECTS_READ,
      PERMISSIONS.CUSTOMERS_READ,
      PERMISSIONS.EMPLOYEES_READ,
    ],
  });
  private readonly state: { database: Sequelize | null; directory: string } = {
    database: null,
    directory: '',
  };

  database(): Sequelize {
    if (!this.state.database) {
      throw new Error('Database unavailable');
    }
    return this.state.database;
  }
  links(): TaskQuotationLinksService {
    return new TaskQuotationLinksService(this.database());
  }

  service(): QuotationService {
    const customerRepository = mock<CustomerRepository>();
    customerRepository.findById.mockImplementation(async (id, transaction) => {
      const [row] = await this.database().query<
        IPaymentConfiguration & { id: string }
      >(
        'SELECT id,payment_terms AS "paymentTerms",payment_schedule AS "paymentSchedule" FROM customers WHERE id=$id AND deleted_at IS NULL',
        { bind: { id }, transaction, type: QueryTypes.SELECT },
      );
      return row ? mock<Customer>(row) : null;
    });
    const transactions = new DatabaseTransactionService(this.database());
    const customers = new CustomerService(
      customerRepository,
      mock(),
      transactions,
    );
    const projectRepository = mock<ProjectRepository>();
    projectRepository.findQuotationContext.mockImplementation(
      async (id, transaction) => {
        const [row] = await this.database().query<{
          id: string;
          customerId: string | null;
        }>(
          'SELECT id,customer_id AS "customerId" FROM projects WHERE id=$id AND deleted_at IS NULL',
          { bind: { id }, transaction, type: QueryTypes.SELECT },
        );
        return row ?? null;
      },
    );
    const projects = new ProjectService(
      mock(),
      projectRepository,
      mock(),
      mock(),
      customers,
      mock(),
      mock(),
      transactions,
      mock(),
      mock(),
      mock(),
    );
    const userRepository = mock<UserRepository>();
    userRepository.findById.mockImplementation(async (id, transaction) => {
      const [row] = await this.database().query<{ id: string }>(
        'SELECT id FROM fixture_users WHERE id=$id',
        { bind: { id }, transaction, type: QueryTypes.SELECT },
      );
      return row
        ? mock<User>({
            ...row,
            firstName: this.actor.firstName,
            lastName: this.actor.lastName,
          })
        : null;
    });
    const userRoles = mock<UserRoleService>();
    userRoles.getAssignedRolesByUserIds.mockImplementation(
      async (ids, transaction) => {
        await this.database().query(
          'SELECT id FROM fixture_users WHERE id=ANY($ids::uuid[])',
          { bind: { ids }, transaction, type: QueryTypes.SELECT },
        );
        return new Map(ids.map((id) => [id, [USER_ROLES.ENGINEER]]));
      },
    );
    const users = new UserService(
      userRepository,
      userRoles,
      mock(),
      transactions,
    );
    const rules = mock<QuotationRuleService>();
    rules.configuration.mockImplementation(async (transaction) => {
      await this.database().query('SELECT 1', { transaction });
      const configuration = quotationRuleFixture([]);
      return {
        rules: configuration,
        fingerprint: validateRuleConfiguration(configuration).fingerprint,
      };
    });
    const catalogue = mock<CatalogueItemService>();
    catalogue.getByIds.mockResolvedValue([]);
    return new QuotationService(
      new QuotationRepository(),
      rules,
      new QuotationSectionService(new QuotationSectionRepository()),
      new QuotationItemService(new QuotationItemRepository()),
      catalogue,
      new QuotationSelectionService(catalogue, mock()),
      customers,
      projects,
      new QuotationProjectService(new QuotationProjectRepository()),
      transactions,
      users,
      userRoles,
      this.links(),
    );
  }

  async start(): Promise<void> {
    const server = createServer();
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const address = server.address();
    await new Promise<void>((done) => server.close(() => done()));
    if (!address || typeof address === 'string') {
      throw new Error('No database port');
    }
    this.state.directory = await mkdtemp(join(tmpdir(), 'task-quotes-'));
    await execute(resolve(binaries, 'initdb'), [
      '-D',
      this.state.directory,
      '-U',
      'postgres',
      '--auth=trust',
    ]);
    await execute(resolve(binaries, 'pg_ctl'), [
      '-D',
      this.state.directory,
      '-o',
      `-h 127.0.0.1 -p ${address.port}`,
      '-l',
      join(this.state.directory, 'postgres.log'),
      '-w',
      'start',
    ]);
    this.state.database = new Sequelize({
      dialect: 'postgres',
      host: '127.0.0.1',
      port: address.port,
      username: 'postgres',
      password: '',
      database: 'postgres',
      logging: false,
      define: { underscored: true, timestamps: true },
      pool: { max: 3, min: 0, acquire: 3000 },
      models: [Quotation, QuotationSection, QuotationItem, QuotationProject],
    });
    await this.database().query(`CREATE ROLE anon;CREATE ROLE authenticated;
      CREATE TABLE customers(id uuid PRIMARY KEY,name text,deleted_at timestamptz,payment_terms text,payment_schedule jsonb NOT NULL DEFAULT '[]');
      CREATE TABLE project_types(id uuid PRIMARY KEY,can_have_apartments boolean);
      CREATE TABLE projects(id uuid PRIMARY KEY,customer_id uuid,deleted_at timestamptz,name text,code text,parent_project_id uuid,project_type_id uuid,customer_apartment text,customer_floor integer,customer_name text);
      CREATE TABLE tasks(id uuid PRIMARY KEY,title text,task_type text,project_id uuid,customer_id uuid,deleted_at timestamptz);
      CREATE TABLE fixture_users(id uuid PRIMARY KEY);
      INSERT INTO customers(id,payment_terms) VALUES ('${this.customerId}','${PAYMENT_TERMS.PREPAID}');
      INSERT INTO projects(id,customer_id,name,code) VALUES ('${this.projectId}','${this.customerId}','Exact project','P-1');
      INSERT INTO tasks VALUES ('${this.taskId}','Quotation task','quotation','${this.projectId}',NULL,NULL);
      INSERT INTO fixture_users VALUES ('${this.actor.id}');`);
    await Quotation.sync();
    await QuotationSection.sync();
    await QuotationItem.sync();
    await QuotationProject.sync();
    await this.database().query(
      await readFile(
        resolve(
          process.cwd(),
          'migrations/2026-11-23-task-quotation-links.sql',
        ),
        'utf8',
      ),
    );
  }
  async reset(): Promise<void> {
    await this.database().query(
      'TRUNCATE task_quotation_links,quotation_projects,quotation_items,quotation_sections,quotations',
    );
  }
  async close(): Promise<void> {
    await this.state.database?.close();
    if (!this.state.directory) {
      return;
    }
    await execute(resolve(binaries, 'pg_ctl'), [
      '-D',
      this.state.directory,
      '-m',
      'immediate',
      '-w',
      'stop',
    ]);
    await rm(this.state.directory, { recursive: true, force: true });
  }
}
