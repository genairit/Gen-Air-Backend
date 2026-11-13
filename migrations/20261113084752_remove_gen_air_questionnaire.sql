-- Owner-authorized retirement of the employee Questionnaire, including saved answers.
-- Deploy the backend without Questionnaire models/routes before applying this migration.
BEGIN;

DROP TABLE IF EXISTS public.questionnaire_submissions;
DROP TABLE IF EXISTS public.questionnaires;
DROP FUNCTION IF EXISTS public.validate_questionnaire_submission();
DROP FUNCTION IF EXISTS public.preserve_questionnaire_submission();
DROP FUNCTION IF EXISTS public.preserve_questionnaire_version();

COMMIT;
