-- Generated with Supabase CLI 3.3.0 migration new quotation_publication_ledger (20261123212345); normalized to repository date naming.
CREATE TABLE IF NOT EXISTS quotation_publication_roles (
 role text PRIMARY KEY CHECK(role IN ('quotation','order','archive')),
 template_id uuid NOT NULL UNIQUE REFERENCES drive_template_folders(id)
);
DO $$
DECLARE role_name text; folder_name text; candidate uuid; matches integer;
BEGIN
 FOR role_name,folder_name IN SELECT * FROM (VALUES ('quotation','הצעות מחיר'),('order','הזמנה לביצוע'),('archive','ארכיון הצעות מחיר')) AS roles(role_name,folder_name)
 LOOP
  IF EXISTS(SELECT 1 FROM quotation_publication_roles WHERE role=role_name) THEN CONTINUE; END IF;
  SELECT count(*),min(id::text)::uuid INTO matches,candidate FROM drive_template_folders WHERE parent_id IS NULL AND name=folder_name;
  IF matches>1 THEN RAISE EXCEPTION 'Ambiguous quotation publication template role %',role_name; END IF;
  IF matches=0 AND role_name<>'archive' THEN RAISE EXCEPTION 'Missing quotation publication template role %',role_name; END IF;
  IF matches=0 THEN
   INSERT INTO drive_template_folders(id,parent_id,name,position,created_at,updated_at)
   SELECT gen_random_uuid(),NULL,folder_name,COALESCE(max(position),0)+1,now(),now() FROM drive_template_folders WHERE parent_id IS NULL RETURNING id INTO candidate;
  END IF;
  INSERT INTO quotation_publication_roles(role,template_id) VALUES(role_name,candidate);
 END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS quotation_publication_folders (
 project_id uuid NOT NULL REFERENCES projects(id),
 role text NOT NULL REFERENCES quotation_publication_roles(role),
 root_id text NOT NULL,
 folder_id text NOT NULL UNIQUE,
 label text NOT NULL,
 confirmed boolean NOT NULL DEFAULT false,
 PRIMARY KEY(project_id,root_id,role)
);
CREATE INDEX IF NOT EXISTS quotation_publication_folder_role ON quotation_publication_folders(role);
CREATE TABLE IF NOT EXISTS quotation_publication_cycles (
 id uuid PRIMARY KEY,
 quotation_id uuid NOT NULL REFERENCES quotations(id),
 project_id uuid NOT NULL REFERENCES projects(id),
 root_id text,
 root_context jsonb NOT NULL,
 file_id text UNIQUE,
 terminal boolean NOT NULL DEFAULT false,
 generation integer NOT NULL CHECK(generation>0),
 desired_kind text NOT NULL CHECK(desired_kind IN ('quotation','order')),
 source_version integer NOT NULL,
 state text NOT NULL CHECK(state IN ('queued','rendering','publishing','archiving','reconciling','published','archived','failed')),
 reason text,
 destination_label text,
 actual_folder_id text,
 actual_hash text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS quotation_publication_active ON quotation_publication_cycles(quotation_id) WHERE NOT terminal;
CREATE INDEX IF NOT EXISTS quotation_publication_quote ON quotation_publication_cycles(quotation_id,updated_at);
CREATE INDEX IF NOT EXISTS quotation_publication_project ON quotation_publication_cycles(project_id);
CREATE TABLE IF NOT EXISTS quotation_publication_operations (
 id uuid PRIMARY KEY,
 cycle_id uuid NOT NULL REFERENCES quotation_publication_cycles(id),
 lifecycle_event_id uuid UNIQUE REFERENCES quotation_lifecycle_events(id),
 generation integer NOT NULL CHECK(generation>0),
 kind text CHECK(kind IN ('quotation','order')),
 source_version integer NOT NULL,
 retry_permission text NOT NULL CHECK(retry_permission IN ('quotations.update','quotations.approve')),
 source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
 snapshot jsonb,
 state text NOT NULL CHECK(state IN ('queued','rendering','publishing','archiving','reconciling','published','archived','failed')),
 job_id uuid NOT NULL UNIQUE,
 attempt integer NOT NULL DEFAULT 0,
 pdf bytea CHECK(octet_length(pdf)<=4194304),
 md5_hash text CHECK(md5_hash IS NULL OR md5_hash ~ '^[a-f0-9]{32}$'),
 hash text CHECK(hash IS NULL OR hash ~ '^[a-f0-9]{64}$'),
 revision_id text,
 destination_label text,
 destination_folder_id text,
 effect_started boolean NOT NULL DEFAULT false,
 dispatched_at timestamptz,
 reason text,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(cycle_id,generation),
 CHECK((kind IS NULL AND snapshot IS NULL) OR (kind IS NOT NULL AND snapshot IS NOT NULL)),
 CHECK((pdf IS NULL AND hash IS NULL) OR (hash IS NOT NULL AND (pdf IS NOT NULL OR revision_id IS NOT NULL OR (state='archived' AND NOT effect_started))))
);
CREATE UNIQUE INDEX IF NOT EXISTS quotation_publication_stage ON quotation_publication_operations(cycle_id,kind) WHERE kind IS NOT NULL;
CREATE INDEX IF NOT EXISTS quotation_publication_pending ON quotation_publication_operations(state,updated_at) WHERE state NOT IN ('published','archived');
CREATE OR REPLACE FUNCTION protect_quotation_publication_evidence() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'Publication evidence cannot be removed'; END IF;
 IF ROW(OLD.id,OLD.cycle_id,OLD.lifecycle_event_id,OLD.generation,OLD.kind,OLD.source_version,OLD.retry_permission,OLD.source_hash,OLD.snapshot) IS DISTINCT FROM ROW(NEW.id,NEW.cycle_id,NEW.lifecycle_event_id,NEW.generation,NEW.kind,NEW.source_version,NEW.retry_permission,NEW.source_hash,NEW.snapshot) THEN RAISE EXCEPTION 'Publication snapshot is immutable'; END IF;
 IF OLD.hash IS NOT NULL AND ROW(OLD.hash,OLD.md5_hash) IS DISTINCT FROM ROW(NEW.hash,NEW.md5_hash) THEN RAISE EXCEPTION 'Accepted PDF hashes are immutable'; END IF;
 IF OLD.hash IS NOT NULL AND OLD.pdf IS NULL AND NEW.pdf IS NOT NULL THEN RAISE EXCEPTION 'Released PDF adoption cannot be replaced'; END IF;
 IF OLD.pdf IS NOT NULL AND NEW.pdf IS NOT NULL AND OLD.pdf<>NEW.pdf THEN RAISE EXCEPTION 'Accepted PDF bytes are immutable'; END IF;
 IF OLD.pdf IS NOT NULL AND NEW.pdf IS NULL AND NEW.revision_id IS NULL AND NOT (NEW.state='archived' AND NOT NEW.effect_started) THEN RAISE EXCEPTION 'Accepted PDF requires retained revision proof'; END IF;
 IF OLD.destination_folder_id IS NOT NULL AND ROW(OLD.destination_folder_id,OLD.destination_label) IS DISTINCT FROM ROW(NEW.destination_folder_id,NEW.destination_label) THEN RAISE EXCEPTION 'Verified publication destination is immutable'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_quotation_publication_evidence ON quotation_publication_operations;
CREATE TRIGGER protect_quotation_publication_evidence BEFORE UPDATE OR DELETE ON quotation_publication_operations FOR EACH ROW EXECUTE FUNCTION protect_quotation_publication_evidence();
DROP TRIGGER IF EXISTS protect_quotation_publication_truncate ON quotation_publication_operations;
CREATE TRIGGER protect_quotation_publication_truncate BEFORE TRUNCATE ON quotation_publication_operations FOR EACH STATEMENT EXECUTE FUNCTION protect_quotation_publication_evidence();
ALTER TABLE quotation_publication_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_publication_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_publication_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_publication_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON quotation_publication_roles,quotation_publication_folders,quotation_publication_cycles,quotation_publication_operations FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION protect_quotation_publication_evidence() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION protect_quotation_publication_root() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF ROW(OLD.project_id,OLD.quotation_id) IS DISTINCT FROM ROW(NEW.project_id,NEW.quotation_id) THEN RAISE EXCEPTION 'Publication cycle context is immutable'; END IF;
 IF OLD.root_id IS NOT NULL AND ROW(OLD.root_id,OLD.root_context) IS DISTINCT FROM ROW(NEW.root_id,NEW.root_context) THEN RAISE EXCEPTION 'Publication root authority is immutable'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION protect_quotation_publication_root() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS protect_quotation_publication_root ON quotation_publication_cycles;
CREATE TRIGGER protect_quotation_publication_root BEFORE UPDATE ON quotation_publication_cycles FOR EACH ROW EXECUTE FUNCTION protect_quotation_publication_root();
