export const REUSABLE_CONTACT_FILTER = `NOT EXISTS (
  SELECT 1 FROM "customers" AS "primaryContactOwner"
  WHERE "primaryContactOwner"."primary_contact_id" = "CustomerContact"."id"
    AND "primaryContactOwner"."deleted_at" IS NULL
)`;
