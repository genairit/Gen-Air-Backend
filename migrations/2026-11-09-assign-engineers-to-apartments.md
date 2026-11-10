# Assign engineers to apartments

Apply `2026-11-09-assign-engineers-to-apartments.sql` before deploying the matching
backend. No environment variable changes are required.

The migration copies each residential building engineer to apartments that still
inherit the building team. It leaves independently assigned apartment engineers
unchanged, then removes the engineer slot from residential parent buildings. Other
building team roles and standalone project engineers remain unchanged. The copy
also includes soft-deleted apartments so their effective assignments are not lost.

New database triggers reject a residential building engineer assignment, including
when an existing standalone project changes to a residential type. The backend
applies the same rule before writing and lets each apartment store an engineer
while its other roles continue to inherit from the building.

Before applying, inspect the count of residential building engineers and inheriting
apartments. After applying, verify that every former inheriting apartment has an
engineer row, no residential building has one, and standalone assignments remain.
The migration is idempotent. Restore a pre-migration database backup to recover
the exact previous building assignments; the migration intentionally removes
those parent rows.
