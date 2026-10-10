-- Purpose: initial GenAir CRM MVP schema — users, configurable stages, projects, team assignment, stage timeline and the Google Drive folder template.
-- Date: 2026-10-07

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE user_role AS ENUM ('system_admin', 'secretary', 'project_manager', 'lead_installer');

CREATE SEQUENCE employee_number_seq START 1001;

CREATE TABLE users (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_number   VARCHAR(16)  NOT NULL UNIQUE DEFAULT ('EMP-' || nextval('employee_number_seq')),
  first_name        VARCHAR(60)  NOT NULL,
  last_name         VARCHAR(60)  NOT NULL,
  email             CITEXT       NOT NULL UNIQUE,
  phone             VARCHAR(20)  NOT NULL,
  role              user_role    NOT NULL,
  password_hash     VARCHAR(255) NOT NULL,
  created_at        TIMESTAMPTZ(3)  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ(3)  NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ(3)
);

CREATE INDEX idx_users_role ON users (role) WHERE deleted_at IS NULL;

CREATE TABLE project_stages (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(80)  NOT NULL,
  description VARCHAR(255),
  tag         VARCHAR(60),
  color       VARCHAR(7),
  position    INTEGER      NOT NULL,
  created_at  TIMESTAMPTZ(3)  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ(3)  NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ(3)
);

CREATE UNIQUE INDEX uq_project_stages_position ON project_stages (position) WHERE deleted_at IS NULL;

CREATE TABLE project_types (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(80)  NOT NULL UNIQUE,
  subtitle    VARCHAR(120),
  description VARCHAR(500),
  tag         VARCHAR(80),
  icon        VARCHAR(40),
  position    INTEGER      NOT NULL,
  created_at  TIMESTAMPTZ(3)  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ(3)  NOT NULL DEFAULT NOW()
);

CREATE TABLE projects (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  code             VARCHAR(8)   NOT NULL UNIQUE CHECK (code ~ '^[^-]{2}-[0-9]{5}$'),
  name             VARCHAR(200) NOT NULL,
  project_type_id  UUID         NOT NULL REFERENCES project_types (id),
  stage_id         UUID         NOT NULL REFERENCES project_stages (id),
  created_by_id    UUID         NOT NULL REFERENCES users (id),
  drive_folder_id  VARCHAR(128),
  erp_reference    VARCHAR(64),
  erp_synced_at    TIMESTAMPTZ(3),
  created_at       TIMESTAMPTZ(3)  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ(3)  NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ(3)
);

CREATE INDEX idx_projects_stage_id ON projects (stage_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_project_type_id ON projects (project_type_id) WHERE deleted_at IS NULL;

CREATE TABLE project_members (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID         NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id     UUID         NOT NULL REFERENCES users (id),
  role        user_role    NOT NULL,
  created_at  TIMESTAMPTZ(3)  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ(3)  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_project_members_project_role UNIQUE (project_id, role)
);

CREATE INDEX idx_project_members_user_id ON project_members (user_id);

CREATE TABLE project_stage_transitions (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID         NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  from_stage_id  UUID         REFERENCES project_stages (id),
  to_stage_id    UUID         NOT NULL REFERENCES project_stages (id),
  changed_by_id  UUID         NOT NULL REFERENCES users (id),
  changed_by_role user_role    NOT NULL,
  note           VARCHAR(255),
  created_at     TIMESTAMPTZ(3)  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ(3)  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_project_stage_transitions_project_created ON project_stage_transitions (project_id, created_at DESC);

CREATE TABLE drive_template_folders (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   UUID         REFERENCES drive_template_folders (id) ON DELETE CASCADE,
  name        VARCHAR(200) NOT NULL,
  position    INTEGER      NOT NULL,
  created_at  TIMESTAMPTZ(3)  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ(3)  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_drive_template_folders_sibling_position ON drive_template_folders (COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), position);

INSERT INTO project_stages (name, description, tag, color, position) VALUES
  ('הצעת מחיר',   'יצירת תיקיית פרויקט אוטומטית וחישובי עומס תרמי',      'שלב פתיחה',     '#8A8D93', 1),
  ('הזמנה',       'אישור מול ה-ERP, הזמנת יחידות VRF ורכש ציוד',          'רכש והזמנות',   '#1E2022', 2),
  ('בביצוע',      'עבודות צנרת באתר, בדיקות לחץ והתקנת יחידות פנים',      'עבודות שטח',    '#FF5A36', 3),
  ('מסירה/שירות', 'פרוטוקול מסירה, תעודת אחריות וחוזה שירות',             'מסירה ואחריות', '#8A8D93', 4);

INSERT INTO project_types (name, subtitle, description, tag, icon, position) VALUES
  ('בנייה רוויה',           'מגורים רב-קומתיים',  'מתחמי מגורים רבי קומות, פילרים תקניים, פיצולי קומות וקומפלקסים ענקיים.',   'מטריצת יחידות ודירות', 'building', 1),
  ('מסחרי (VRF / צ׳ילרים)', 'מרכזים ומשרדים',     'בנייני משרדים, מרכזים מסחריים, מרכזים לוגיסטיים ומערכות גג מרכזיות.',     'VRF מרכזי / צ׳ילר',    'hvac',     2),
  ('לקוחות פרטיים',         'וילות ובתים פרטיים', 'וילות, דו-משפחתיים ובתים בעיצוב אדריכלי עם דרישות מיזוג מותאמות.',        'מיזוג מותאם לבית',     'home',     3),
  ('דירות יוקרה',           'פנטהאוזים ומגדלי פאר', 'פנטהאוזים, מפזרים נסתרים ובקרת אקלים חכמה אינטגרלית ב-BACnet BMS.',     'מפזרים נסתרים וחכם',   'air',      4),
  ('אחר',                   'התאמה מיוחדת',       'חדרים נקיים, קירור תעשייתי, שדרוגים מיוחדים והסכמי שירות ייחודיים.',       'מפרט בהתאמה אישית',    'more',     5);
