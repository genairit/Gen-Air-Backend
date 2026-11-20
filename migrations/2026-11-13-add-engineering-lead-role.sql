-- Apply and commit this enum migration before granting the new role permissions.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'engineering_lead';
