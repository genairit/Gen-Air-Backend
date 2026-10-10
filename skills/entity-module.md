# Entity Module

## Purpose

Define the one canonical way an **entity module** is laid out and written in a NestJS server, so
every entity in the codebase looks like it was written by the same person on the same day.

An entity module owns exactly one domain entity: its table, its type contract, its data access, its
business rules, and its HTTP surface — and nothing else.

---

## When To Use

Trigger this skill whenever the work involves:

- Creating a **new entity** (new table, new domain concept) on the server.
- Adding a **controller, service, repository, DTO, or entity file** to an existing module.
- Reviewing or refactoring a module that does not match the layout below.
- Deciding **where a piece of code belongs** — which layer, which folder, which file.

---

## The Canonical Folder Tree

Every module lives under `src/modules/<entity>/`, where `<entity>` is **singular** and
**kebab-case**. The four root files are mandatory; the folders appear as the module earns them.

```
src/modules/<entity>/
├── <entity>.module.ts          # wiring — mandatory
├── <entity>.controller.ts      # HTTP surface — mandatory
├── <entity>.service.ts         # business logic — mandatory
├── <entity>.repository.ts      # data access — mandatory
├── entities/
│   └── <entity>.entity.ts      # the model — mandatory
├── interfaces/
│   └── <entity>.interface.ts   # the type contract — mandatory
├── dto/                        # add when the module accepts input
│   ├── create-<entity>.dto.ts
│   ├── update-<entity>.dto.ts
│   └── get-by-<filter>.dto.ts
├── constants/                  # add when the module has enums or config
│   └── <domain>.constant.ts
├── utilities/                  # add when pure helpers appear
│   └── <domain>.utility.ts
└── views/                      # add only when the module reads a SQL view
    └── <view-name>.sql
```

**Rules for the tree:**

- Folder name is **singular** (`agreement`, not `agreements`). A join module is named for the pair:
  `agreement-sectors`.
- The server does not use `index.ts` barrels. Every file is imported by its explicit path, so the
  import states exactly which entity, interface, or contract is in play.
- Do not create `dto/`, `constants/`, `utilities/`, or `views/` speculatively. Create the folder the
  moment it has a first real member.
- A module never contains a folder for another entity. If you need a second table, it gets its own
  module — unless it exists solely as a projection of this one (a view entity), which may sit in
  this module's `entities/`.

---

## The Four Layers

Each layer has exactly one job. Code that crosses these lines is a bug in the design, not a
shortcut.

| Layer          | Owns                                                    | Never contains                                   |
| -------------- | ------------------------------------------------------- | ------------------------------------------------ |
| **Controller** | Routing, auth decorators, param extraction, pipes        | Business rules, ORM calls, `try`/`catch`         |
| **Service**    | Business rules, validation, orchestration, transactions  | Raw ORM queries, `Op.*`, `Sequelize.literal`     |
| **Repository** | ORM queries, `where` building, pagination, includes      | Business decisions, exceptions, permission logic |
| **Entity**     | Columns, types, indexes, relations                       | Query methods, formatting, business helpers      |

The single sharpest test: **`Op` and `Sequelize` are imported only by the repository.** If a service
imports them, the query belongs one layer down.

---

## File-by-File Rules

### Module — `<entity>.module.ts`

Wiring only. It imports the database provider and the modules whose services it consumes, registers
its own controller, service, and repository, and exports **the service and nothing else** — the
repository is private to the module, so other modules reach this entity through its service.

When two modules genuinely need each other, break the cycle with `forwardRef(() => OtherModule)` on
both sides and `@Inject(forwardRef(() => OtherService))` at the injection point. Treat every
`forwardRef` as a design smell you are consciously accepting.

### Entity — `entities/<entity>.entity.ts`

Declarative only: columns, types, nullability, indexes, relations. It extends the ORM model typed by
its own interface and implements that interface, so the contract and the table cannot drift apart.

- `@Table({ paranoid: true })` for every soft-deleted entity, paired with a
  `@DeletedAt deletedAt: Date | null` column.
- Class properties are `camelCase`; database columns are `snake_case`, produced automatically by the
  connection's `define: { underscored: true }`. Never restate a column name by hand.
- Every column that participates in a real query's `where` clause gets a **named index** declared in
  `@Table`, named `idx_<table>_<column>`.
- Nullable columns are typed `| null` — never `| undefined`, never bare.
- Enum columns take their values from the module's constants file, never from an inline array.
- Integer primary keys use `@PrimaryKey @AutoIncrement`; UUID primary keys use
  `@PrimaryKey @Default(UUIDV4)` with `DataType.UUID`.
- Register the new entity class in the database provider's `addModels([...])` list, otherwise every
  query against it fails at runtime.

### Interface — `interfaces/<entity>.interface.ts`

The type contract: one property per column, plus optional relation properties. Nothing derived,
nothing computed.

- Members are ordered by **ascending line length** (pyramid), not grouped by kind.
- Columns are required properties; **relations are optional** (`?`), because they are only present
  when the query included them.
- Relations are typed by the other module's interface, never by its entity class — modules couple
  through contracts, not through models.
- "No value" is always `| null`. The literal `undefined` never appears.

### Constants — `constants/<domain>.constant.ts`

Every closed set of values the entity can hold lives here as an enum plus its derived values array
(`Object.values(...)`). That array is what the ORM's `ENUM` column and the DTO's `@IsIn` consume, so
the set has exactly one source. Configuration maps and role-scoped lookups live here too, as
`SCREAMING_SNAKE_CASE` `as const` objects.

Constants that more than one module needs are **not** module constants — promote them to
`src/constants/`. Anything that is only about this entity stays here.

### DTO — `dto/<action>-<entity>.dto.ts`

One file per input contract, one class per file. DTOs are the only place external input is
validated, and they validate it completely — the service is allowed to trust a DTO.

- Every property carries `@IsNotEmpty()` or `@IsOptional()` **plus** a type validator. A property
  with no decorator is silently unvalidated — treat it as a defect.
- String length limits come from the shared length constants, never from an inline number.
- Enum properties validate against the module's enum (`@IsEnum`) or its values array (`@IsIn`).
- Query params and nested objects need `@Type(...)` from `class-transformer`; arrays of objects add
  `@ValidateNested({ each: true })`.
- An update DTO is written explicitly with optional members — do not reach for `PartialType` when
  the update surface differs from the create surface.

### Repository — `<entity>.repository.ts`

The only file in the module that knows the ORM exists. Each method is a single query or a single
transactional write, takes primitives or a DTO, and returns a promise. It never throws HTTP
exceptions and never decides anything about permissions.

- Public query methods first, `private build*` helpers after — the file reads top-down from intent
  to detail.
- Every write method accepts an optional `transaction?: Transaction` and passes it through, so any
  caller can enlist it in a larger unit of work.
- Long `where` construction is extracted into a `private` builder that returns a `WhereOptions[]`,
  combined under a single `Op.and` — never inlined into the query object.
- **Cursor pagination, never offset.** The caller sends `batchCursor` + `batchSize`; the method
  returns the page plus `nextCursor`, which is `null` on the last page.
- Raw SQL is permitted only through `Sequelize.literal()` for scalar subqueries the ORM cannot
  express, and only here. Interpolating user input into a `literal()` string is forbidden — only
  values you produced yourself, such as an ID from a constants map, may be interpolated.

### Service — `<entity>.service.ts`

Business rules and orchestration: it validates cross-entity invariants, resolves authorization
scope, owns transactions, publishes events, and translates failures into HTTP exceptions. It reads
as a narrative of the business operation, delegating every query downward.

- One `private readonly logger = new Logger(<Service>.name)` per service; every caught error is
  logged with context before it is rethrown or translated.
- **Never swallow an error.** A `catch` either rethrows or throws a meaningful HTTP exception — it
  never returns a fallback silently.
- Any operation writing to more than one table opens a transaction, passes it to every participating
  repository and service, commits once, and rolls back in `catch`.
- Cross-entity existence checks run in parallel with `Promise.all` before the transaction opens, so
  the transaction stays as short as possible.
- Guard clauses over nesting: validate, throw, and continue at the top level of the method.
- Authorization scope is resolved through a **role → `where`-builder `Record`** in constants, never
  through an `if`/`else if` chain or a `switch`. The resulting `WhereOptions` is passed into the
  repository, which never inspects the user itself.
- Repositories return `null`; the service turns `null` into the right exception.
- Services return entity/interface types. They do not build HTTP envelopes.
- Events are published **after** the transaction commits — a rollback cannot unpublish.

### Controller — `<entity>.controller.ts`

The thinnest file in the module. Every handler is a single delegating expression: extract, delegate,
return. No `try`/`catch`, no `await` chains, no business rules.

- `@ApiTags('<entity>')` and `@Controller('<entity>')` use the same kebab-case entity name, matching
  the folder.
- Route paths are kebab-case. Static segments are declared **before** parameterized ones so
  `/details/:id` is not swallowed by `/:id`.
- Params are always parsed: `ParseIntPipe` for integers, `ParseUUIDPipe` for UUIDs. An unparsed
  `@Param` is a defect.
- Reads carrying a large filter payload use `@Post` with a DTO body rather than an unvalidated query
  string; simple lookups use `@Get` with `@Query`.
- Authorization is declarative: `@UserRoles([...])` on the handler, plus the permission param
  decorators where scope must be injected.
- The authenticated user reaches the service through `@User() user: ITokenPayload` — never through a
  manually parsed header.

---

## Naming Reference

| Element              | Pattern                       | Example                                     |
| -------------------- | ----------------------------- | ------------------------------------------- |
| Module folder        | singular, kebab-case          | `agreement`, `equipment`, `agreement-sectors` |
| Module class         | `<Entity>Module`              | `AgreementModule`                           |
| Controller class     | `<Entity>Controller`          | `AgreementController`                       |
| Service class        | `<Entity>Service`             | `AgreementService`                          |
| Repository class     | `<Entity>Repository`          | `AgreementRepository`                       |
| Entity class         | `<Entity>` singular           | `Agreement`                                 |
| Interface            | `I<Entity>`                   | `IAgreement`                                |
| Enum / union type    | `T<Name>`                     | `TAgreementType`                            |
| Enum values array    | `<NAME>_VALUES`               | `AGREEMENT_TYPES_VALUES`                    |
| Create DTO           | `Create<Entity>Dto`           | `CreateAgreementDto`                        |
| Update DTO           | `Update<Entity>Dto`           | `UpdateAgreementDto`                        |
| Query DTO            | `GetBy<Filter>Dto`            | `GetAgreementsByRoleDto`                    |
| Entity file          | `<entity>.entity.ts`          | `agreement.entity.ts`                       |
| Interface file       | `<entity>.interface.ts`       | `agreement.interface.ts`                    |
| Constant file        | `<domain>.constant.ts`        | `agreement-types.constant.ts`               |
| Utility file         | `<domain>.utility.ts`         | `authorization.utility.ts`                  |
| DTO file             | `<action>-<entity>.dto.ts`    | `create-agreement.dto.ts`                   |
| Index name           | `idx_<table>_<column>`        | `idx_agreements_company_name`               |

---

## Registering the Module

Two registrations are required for a new entity, and forgetting either produces a runtime failure
rather than a compile error:

1. **The module** joins `AppModule`'s `imports`, kept alphabetical among the feature modules.
2. **The entity class** joins the database provider's `sequelize.addModels([...])` list.

Cross-module and shared imports go through the tsconfig path aliases (`@Modules/*`, `@Constants/*`,
`@Decorators/*`, `@Providers/*`); imports inside the module use relative paths. Never reach into
another module with a relative `../../` path, and never import another module's **repository** — go
through its service.
