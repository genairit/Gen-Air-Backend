-- Immutable questionnaire versions and append-only, self-reported employee submissions.
-- The seeded version is inactive; activation requires an explicitly authorized rollout.
BEGIN;

CREATE TABLE public.questionnaires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(120) NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  title text NOT NULL,
  introduction text NOT NULL,
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'array'),
  accepting_responses boolean NOT NULL DEFAULT false,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT uq_questionnaires_slug_version UNIQUE (slug, version)
);
CREATE UNIQUE INDEX uq_questionnaires_accepting_slug
  ON public.questionnaires(slug) WHERE accepting_responses;

CREATE TABLE public.questionnaire_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_id uuid NOT NULL REFERENCES public.questionnaires(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL UNIQUE,
  full_name varchar(200) NOT NULL CHECK (full_name ~ '[^[:space:]]'),
  role varchar(200) NOT NULL CHECK (role ~ '[^[:space:]]'),
  department varchar(200) NOT NULL CHECK (department ~ '[^[:space:]]'),
  answers jsonb NOT NULL CHECK (jsonb_typeof(answers) = 'array'),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX idx_questionnaire_submissions_questionnaire_id
  ON public.questionnaire_submissions(questionnaire_id);

CREATE FUNCTION public.preserve_questionnaire_version() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Questionnaire versions cannot be deleted';
  END IF;
  IF (to_jsonb(NEW) - 'accepting_responses' - 'updated_at')
     IS DISTINCT FROM (to_jsonb(OLD) - 'accepting_responses' - 'updated_at') THEN
    RAISE EXCEPTION 'Questionnaire versions are immutable; insert a new version';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_questionnaire_version
  BEFORE UPDATE OR DELETE ON public.questionnaires
  FOR EACH ROW EXECUTE FUNCTION public.preserve_questionnaire_version();

CREATE FUNCTION public.preserve_questionnaire_submission() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  RAISE EXCEPTION 'Questionnaire submissions are append-only';
END;
$$;
CREATE TRIGGER preserve_questionnaire_submission
  BEFORE UPDATE OR DELETE ON public.questionnaire_submissions
  FOR EACH ROW EXECUTE FUNCTION public.preserve_questionnaire_submission();

CREATE FUNCTION public.validate_questionnaire_submission() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  questions jsonb;
  expected_count integer;
BEGIN
  SELECT definition INTO STRICT questions
    FROM public.questionnaires WHERE id = NEW.questionnaire_id;
  SELECT count(*) INTO expected_count FROM jsonb_array_elements(questions) question
    WHERE question->>'type' = 'long-text';
  IF jsonb_typeof(NEW.answers) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Answers must be an array';
  END IF;
  IF jsonb_array_length(NEW.answers) <> expected_count
     OR (SELECT count(DISTINCT answer->>'questionKey') FROM jsonb_array_elements(NEW.answers) answer) <> expected_count THEN
    RAISE EXCEPTION 'Answers must identify each question exactly once';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(NEW.answers) answer
    WHERE jsonb_typeof(answer) IS DISTINCT FROM 'object'
      OR jsonb_typeof(answer->'value') IS DISTINCT FROM 'string'
      OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(questions) question
        WHERE question->>'type' = 'long-text'
          AND question->>'key' = answer->>'questionKey'
          AND length(answer->>'value') <= (question->>'maxLength')::integer
      )
  ) THEN
    RAISE EXCEPTION 'Answer does not match its questionnaire version';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(NEW.answers) answer
    WHERE answer->>'value' ~ '[^[:space:]]'
  ) THEN
    RAISE EXCEPTION 'At least one answer is required';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_questionnaire_submission
  BEFORE INSERT ON public.questionnaire_submissions
  FOR EACH ROW EXECUTE FUNCTION public.validate_questionnaire_submission();

ALTER TABLE public.questionnaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questionnaire_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.questionnaires, public.questionnaire_submissions FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preserve_questionnaire_version() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preserve_questionnaire_submission() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_questionnaire_submission() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.questionnaires, public.questionnaire_submissions FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.questionnaires, public.questionnaire_submissions FROM authenticated;
  END IF;
END;
$$;

INSERT INTO public.questionnaires (id, slug, version, title, introduction, definition)
VALUES (
  'ef1cfdf2-b4cc-5be3-8e4a-6a4634e2ba9c',
  'genair-workflow',
  1,
  'שאלון היכרות עם תהליכי העבודה',
  'כדי לפתח אפליקציה שמתאימה לצרכים של GenAir, חשוב לי להבין איך עובדת כל מחלקה ומה צריך כל אחד בתפקיד שלו. השאלון הזה יעזור לי להכיר את העבודה שלכם, לשמר את מה שטוב ולזהות איפה אפשר להקל.',
  '[
  {
    "key": "fullName",
    "label": "שם מלא",
    "helpText": "",
    "required": true,
    "type": "identity",
    "maxLength": 200
  },
  {
    "key": "role",
    "label": "תפקיד",
    "helpText": "",
    "required": true,
    "type": "identity",
    "maxLength": 200
  },
  {
    "key": "department",
    "label": "מחלקה",
    "helpText": "",
    "required": true,
    "type": "identity",
    "maxLength": 200
  },
  {
    "key": "answer1",
    "label": "תארו בקצרה את שלבי העבודה מתחילתו ועד סופו, כולל ממי מקבלים מידע ולמי מעבירים תוצאה.",
    "helpText": "מה מתחיל את התהליך, מה עושים בכל שלב ואיך יודעים שהוא הסתיים?",
    "required": false,
    "type": "long-text",
    "maxLength": 4000
  },
  {
    "key": "answer2",
    "label": "כמה זמן בדרך כלל עובר מתחילת התהליך ועד סיומו, וכמה מזה עבודה בפועל לעומת המתנה? אפשר טווחים, ואם אפשר, כמה פעמים בחודש זה קורה.",
    "helpText": "אפשר לציין הערכות. אין צורך למדוד במדויק.",
    "required": false,
    "type": "long-text",
    "maxLength": 4000
  },
  {
    "key": "answer3",
    "label": "באילו כלים או מערכות אתם משתמשים היום ולמה משמש כל אחד?",
    "helpText": "למשל תוכנות, קבצים, גיליונות, דוא״ל או כלי תקשורת.",
    "required": false,
    "type": "long-text",
    "maxLength": 4000
  },
  {
    "key": "answer4",
    "label": "תארו מקרה אמיתי שטיפלתם בו לאחרונה: מה קיבלתם, מה עשיתם, עם מי עבדתם ומה הייתה התוצאה.",
    "helpText": "דוגמה אחת תעזור להבין איך התהליך נראה בפועל. אין צורך בפרטים אישיים של לקוחות.",
    "required": false,
    "type": "long-text",
    "maxLength": 4000
  },
  {
    "key": "answer5",
    "label": "מה עובד טוב וחשוב לשמר?",
    "helpText": "מה מקל על העבודה שלכם כיום והייתם רוצים שיישאר גם במערכת החדשה?",
    "required": false,
    "type": "long-text",
    "maxLength": 4000
  },
  {
    "key": "answer6",
    "label": "מה לא עובד טוב או דורש שיפור? תארו עיכובים, טעויות, עבודה כפולה או קושי בביצוע, ומה לדעתכם גורם להם.",
    "helpText": "אם אפשר, ציינו באיזה שלב מתעורר הקושי ומה ההשפעה שלו.",
    "required": false,
    "type": "long-text",
    "maxLength": 4000
  },
  {
    "key": "answer7",
    "label": "באילו מושגים, ראשי תיבות או שמות פנימיים אתם משתמשים? לכל מושג, הסבר קצר ודוגמה לשימוש בעבודה.",
    "helpText": "אני מגיע מעולם פיתוח התוכנה ולא בהכרח מכיר את המושגים המקצועיים שלכם. כדי לפתח מערכת שמתאימה לעבודה שלכם, חשוב לי להבין את התחום לעומק. לכן, הסבירו גם מושגים שנראים לכם בסיסיים או מובנים מאליהם.\nאפשר לרשום כל מושג בשורה נפרדת.",
    "required": false,
    "type": "long-text",
    "maxLength": 4000
  }
]'::jsonb
);

COMMIT;
