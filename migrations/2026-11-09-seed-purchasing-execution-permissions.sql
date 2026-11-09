-- Apply after 2026-11-09-add-purchasing-execution-manager-role.sql commits.
-- No account is assigned the new role by this migration.
BEGIN;

INSERT INTO public.permissions (key) VALUES
  ('boq_templates.manage'),
  ('supplier_agreements.manage'),
  ('purchase_requests.review'),
  ('purchase_orders.approve'),
  ('purchase_orders.send'),
  ('execution_handoffs.manage'),
  ('subcontractor_settlements.approve'),
  ('payments.record')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('purchasing_execution_manager', 'projects.read'),
  ('purchasing_execution_manager', 'customers.read'),
  ('purchasing_execution_manager', 'tasks.read'),
  ('purchasing_execution_manager', 'employees.read'),
  ('purchasing_execution_manager', 'drive.read'),
  ('purchasing_execution_manager', 'quotations.read'),
  ('purchasing_execution_manager', 'boq_templates.manage'),
  ('purchasing_execution_manager', 'supplier_agreements.manage'),
  ('purchasing_execution_manager', 'purchase_requests.review'),
  ('purchasing_execution_manager', 'purchase_orders.approve'),
  ('purchasing_execution_manager', 'purchase_orders.send'),
  ('purchasing_execution_manager', 'execution_handoffs.manage'),
  ('system_admin', 'boq_templates.manage'),
  ('system_admin', 'supplier_agreements.manage'),
  ('system_admin', 'purchase_requests.review'),
  ('system_admin', 'purchase_orders.approve'),
  ('system_admin', 'purchase_orders.send'),
  ('system_admin', 'execution_handoffs.manage'),
  ('system_admin', 'subcontractor_settlements.approve'),
  ('system_admin', 'payments.record'),
  ('finance', 'subcontractor_settlements.approve'),
  ('finance', 'payments.record')
ON CONFLICT (role, permission_key) DO NOTHING;

COMMIT;
