import 'reflect-metadata';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { Op, QueryTypes } from 'sequelize';
import { readFile } from 'node:fs/promises';
import { Sequelize } from 'sequelize-typescript';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserService } from '@Modules/user/user.service';
import { User } from '@Modules/user/entities/user.entity';
import { Task } from '@Modules/task/entities/task.entity';
import { USER_ROLES } from '@Constants/user-role.constant';
import { TaskRepository } from '@Modules/task/task.repository';
import { ProjectService } from '@Modules/project/project.service';
import { PAYMENT_TERMS } from '@Constants/payment-terms.constant';
import { AddressService } from '@Modules/address/address.service';
import { Project } from '@Modules/project/entities/project.entity';
import { ProviderNames } from '@Providers/database/provider-names';
import { CustomerService } from '@Modules/customer/customer.service';
import { Customer } from '@Modules/customer/entities/customer.entity';
import { ProjectRepository } from '@Modules/project/project.repository';
import { PROJECT_STATUS_IDS } from '@Constants/project-status.constant';
import { CustomerRepository } from '@Modules/customer/customer.repository';
import { TASK_STATUSES } from '@Modules/task/constants/task-status.constant';
import { ProjectIntakeService } from '@Modules/project/project-intake.service';
import { ProjectTypeService } from '@Modules/project-type/project-type.service';
import { ProjectType } from '@Modules/project-type/entities/project-type.entity';
import { ProjectStageService } from '@Modules/project-stage/project-stage.service';
import { ProjectStage } from '@Modules/project-stage/entities/project-stage.entity';
import { ProjectApartmentService } from '@Modules/project/project-apartment.service';
import { ProjectMemberService } from '@Modules/project-member/project-member.service';
import { ProjectTypeRepository } from '@Modules/project-type/project-type.repository';
import { ProjectMember } from '@Modules/project-member/entities/project-member.entity';
import { ProjectStageRepository } from '@Modules/project-stage/project-stage.repository';
import { PROJECT_DETAIL_FIELD_SETS } from '@Constants/project-detail-field-set.constant';
import { ProjectMemberRepository } from '@Modules/project-member/project-member.repository';
import { CustomerContactService } from '@Modules/customer-contact/customer-contact.service';
import { TaskStatusTransition } from '@Modules/task/entities/task-status-transition.entity';
import { CustomerContact } from '@Modules/customer-contact/entities/customer-contact.entity';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import { TaskStatusTransitionRepository } from '@Modules/task/task-status-transition.repository';
import { CustomerContactRepository } from '@Modules/customer-contact/customer-contact.repository';
import { ProjectApartmentImportService } from '@Modules/project/project-apartment-import.service';
import { ProjectTaskInitializationService } from '@Modules/project/project-task-initialization.service';
import { ProjectStageTransitionService } from '@Modules/project-stage-transition/project-stage-transition.service';
import { ProjectStageTransition } from '@Modules/project-stage-transition/entities/project-stage-transition.entity';
import { ProjectStageTransitionRepository } from '@Modules/project-stage-transition/project-stage-transition.repository';

export const MIGRATION_FILE = resolve(
  __dirname,
  '../migrations/2026-10-30-project-task-initialization.sql',
);

export const createProjectTaskEnvironment = async () => {
  const sourceUrl = process.env.PROJECT_TASKS_TEST_DATABASE_URL ?? '';
  if (!sourceUrl) {
    throw new Error(
      'Set PROJECT_TASKS_TEST_DATABASE_URL to a disposable local *_e2e database.',
    );
  }
  const target = new URL(sourceUrl);
  const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(
    target.hostname,
  );
  if (!isLoopback || !target.pathname.endsWith('_e2e')) {
    throw new Error(
      'Project task integration tests require a local disposable *_e2e database.',
    );
  }
  const databaseName = `project_tasks_${randomUUID().replaceAll('-', '')}_e2e`;
  const admin = new Sequelize(sourceUrl, { logging: false });
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  const databaseUrl = new URL(sourceUrl);
  databaseUrl.pathname = `/${databaseName}`;
  const sequelize = new Sequelize(databaseUrl.toString(), {
    logging: false,
    define: { underscored: true, timestamps: true },
    models: [
      User,
      Customer,
      CustomerContact,
      ProjectType,
      ProjectStage,
      Project,
      ProjectMember,
      Task,
      TaskStatusTransition,
      ProjectStageTransition,
    ],
  });
  const close = async () => {
    await sequelize.close();
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await admin.close();
  };
  try {
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS citext');
    await sequelize.sync();
    await sequelize.query(
      'ALTER TABLE public.project_stages ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP, ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP',
    );
    await sequelize.query(
      await readFile(
        resolve(
          __dirname,
          '../migrations/2026-10-16-fixed-project-statuses.sql',
        ),
        'utf8',
      ),
    );
    const creator = await User.create({
      firstName: 'בדיקה',
      lastName: 'זמנית',
      role: USER_ROLES.SYSTEM_ADMIN,
      email: 'project-task-admin@example.invalid',
      phone: '03-1234567',
      passwordHash: 'disposable-hash',
    });
    const engineer = await User.create({
      firstName: 'עובד',
      lastName: 'זמני',
      role: USER_ROLES.ENGINEER,
      email: 'project-task-engineer@example.invalid',
      phone: '03-1234568',
      passwordHash: 'disposable-hash',
    });
    const customer = await Customer.create({
      name: 'לקוח בדיקה',
      taxId: '514287937',
      phone: '03-1234567',
      email: 'customer@example.invalid',
      address: 'רחוב לדוגמה 1',
      contactName: 'איש קשר',
      customerType: PROJECT_DETAIL_FIELD_SETS.COMPANY,
      createdById: creator.id,
    });
    const standaloneType = await ProjectType.create({
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'פרויקט רגיל',
      position: 1,
      detailFieldSet: PROJECT_DETAIL_FIELD_SETS.COMPANY,
      canHaveApartments: false,
    });
    const buildingType = await ProjectType.create({
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'בניין לבדיקה',
      position: 2,
      detailFieldSet: PROJECT_DETAIL_FIELD_SETS.COMPANY,
      canHaveApartments: true,
    });
    const legacyProject = await Project.create({
      name: 'פרויקט קודם',
      code: 'LEGACY-1',
      customerId: customer.id,
      projectTypeId: standaloneType.id,
      stageId: PROJECT_STATUS_IDS.WAITING,
      createdById: creator.id,
    });
    await sequelize.query(
      'ALTER TABLE public.tasks DROP COLUMN task_type; ALTER TABLE public.tasks ALTER COLUMN title TYPE VARCHAR(200)',
    );
    const legacyCustomerTaskId = randomUUID();
    const legacyDualTaskId = randomUUID();
    await sequelize.query(
      `INSERT INTO public.tasks (id, project_id, customer_id, created_by_id, title, description, status, is_urgent, created_at, updated_at) VALUES
      ($customerTask, NULL, $customerId, $creatorId, 'משימת לקוח קודמת', 'אין לשנות', 'in_review', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ($dualTask, $projectId, $customerId, $creatorId, 'משימה עם שני שיוכים', 'אין לשנות שיוכים', 'not_started', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      {
        bind: {
          customerTask: legacyCustomerTaskId,
          dualTask: legacyDualTaskId,
          projectId: legacyProject.id,
          customerId: customer.id,
          creatorId: creator.id,
        },
      },
    );
    await TaskStatusTransition.create({
      taskId: legacyCustomerTaskId,
      fromStatus: TASK_STATUSES.NOT_STARTED,
      toStatus: TASK_STATUSES.IN_REVIEW,
      changedById: creator.id,
    });
    await sequelize.query('GRANT SELECT ON public.tasks TO PUBLIC');
    const beforeMigration = await sequelize.query(
      'SELECT id,project_id,customer_id,title,description,status,due_date,created_at,updated_at FROM public.tasks ORDER BY id',
      { type: QueryTypes.SELECT },
    );
    const beforeProject = await sequelize.query(
      'SELECT id,stage_id,updated_at FROM public.projects ORDER BY id',
      { type: QueryTypes.SELECT },
    );
    const beforeHistory = await sequelize.query(
      'SELECT * FROM public.task_status_transitions ORDER BY id',
      { type: QueryTypes.SELECT },
    );
    const migration = await readFile(MIGRATION_FILE, 'utf8');
    await sequelize.query(migration);
    await sequelize.query(migration);
    const events = { emitAsync: jest.fn().mockResolvedValue([]) };
    const module = await Test.createTestingModule({
      providers: [
        ProjectService,
        ProjectRepository,
        ProjectApartmentService,
        ProjectIntakeService,
        ProjectTaskInitializationService,
        ProjectMemberService,
        ProjectMemberRepository,
        ProjectStageService,
        ProjectStageRepository,
        ProjectTypeService,
        ProjectTypeRepository,
        ProjectStageTransitionService,
        ProjectStageTransitionRepository,
        CustomerService,
        CustomerRepository,
        CustomerContactService,
        CustomerContactRepository,
        DatabaseTransactionService,
        TaskRepository,
        TaskStatusTransitionRepository,
        ProjectApartmentImportService,
        { provide: ProviderNames.SEQUELIZE, useValue: sequelize },
        {
          provide: UserService,
          useValue: {
            findByIds: (ids: string[]) =>
              User.findAll({ where: { id: { [Op.in]: ids } } }),
          },
        },
        {
          provide: AddressService,
          useValue: {
            getVerifiedAddress: () =>
              Promise.resolve({
                placeId: 'disposable-place',
                formattedAddress: 'רחוב לדוגמה 1, תל אביב',
                city: 'תל אביב',
                countryCode: 'IL',
              }),
          },
        },
        { provide: EventEmitter2, useValue: events },
      ],
    }).compile();
    const projectInput = (name: string, projectTypeId = standaloneType.id) => ({
      name,
      projectTypeId,
      customerId: customer.id,
      members: [{ userId: engineer.id, role: USER_ROLES.ENGINEER }],
      addressPlaceId: 'disposable-place',
      paymentTerms: PAYMENT_TERMS.MILESTONES_NET_60,
    });
    const createLegacyProject = (name: string, canHaveApartments = false) =>
      Project.create({
        name,
        code: randomUUID().slice(0, 8),
        createdById: creator.id,
        customerId: customer.id,
        stageId: PROJECT_STATUS_IDS.WAITING,
        projectTypeId: canHaveApartments ? buildingType.id : standaloneType.id,
        paymentTerms: PAYMENT_TERMS.MILESTONES_NET_60,
      });
    const counts = async () =>
      Promise.all([
        Project.count(),
        ProjectMember.count(),
        ProjectStageTransition.count(),
        Task.count(),
        TaskStatusTransition.count(),
        Customer.count(),
        CustomerContact.count(),
      ]);
    const rejectPlanning = async () => {
      await sequelize.query(`CREATE FUNCTION public.test_reject_planning_task() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.task_type = 'planning' THEN RAISE EXCEPTION 'injected planning failure'; END IF; RETURN NEW; END; $$;
        CREATE TRIGGER test_reject_planning BEFORE INSERT ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.test_reject_planning_task()`);
    };
    const restorePlanning = async () => {
      await sequelize.query(
        'DROP TRIGGER IF EXISTS test_reject_planning ON public.tasks; DROP FUNCTION IF EXISTS public.test_reject_planning_task()',
      );
    };
    return {
      sequelize,
      creator,
      engineer,
      customer,
      legacyProject,
      legacyCustomerTaskId,
      legacyDualTaskId,
      beforeMigration,
      beforeProject,
      beforeHistory,
      events,
      projectInput,
      createLegacyProject,
      counts,
      rejectPlanning,
      restorePlanning,
      projects: module.get(ProjectService),
      imports: module.get(ProjectApartmentImportService),
      initialize: module.get(ProjectTaskInitializationService),
      stages: module.get(ProjectStageService),
      transactions: module.get(DatabaseTransactionService),
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
};

export type TProjectTaskEnvironment = Awaited<
  ReturnType<typeof createProjectTaskEnvironment>
>;
