-- NA Avn Comd - Corrective migration v3 (apply AFTER 20251025_fix_rls_policies_v2.sql)
-- Do not execute. Addresses grants, FORCE RLS, and removing broad permissive policies.

-- Enable FORCE RLS
ALTER TABLE user_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE employees FORCE ROW LEVEL SECURITY;
ALTER TABLE visitors FORCE ROW LEVEL SECURITY;
ALTER TABLE visits FORCE ROW LEVEL SECURITY;
ALTER TABLE visitor_badges FORCE ROW LEVEL SECURITY;
ALTER TABLE departments FORCE ROW LEVEL SECURITY;
ALTER TABLE positions FORCE ROW LEVEL SECURITY;
ALTER TABLE office_locations FORCE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-- Drop broad permissive policies if present
DROP POLICY IF EXISTS "Authenticated read visitors" ON visitors;
DROP POLICY IF EXISTS "Authenticated read employees" ON employees;
DROP POLICY IF EXISTS "Authenticated can insert notifications" ON notifications;
DROP POLICY IF EXISTS "Authenticated can insert audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Users can read relevant visits" ON visits;
DROP POLICY IF EXISTS "Only admins can manage roles" ON user_roles;

-- Re-apply strict policies (defensive)
DROP POLICY IF EXISTS "visitors_select_authorized" ON visitors;
DROP POLICY IF EXISTS "visitors_write_admin_receptionist" ON visitors;
CREATE POLICY "visitors_select_authorized" ON visitors FOR SELECT USING (
  auth.uid() IS NOT NULL AND (
    public.is_current_user_admin() OR
    public.current_user_role() IN ('Commandant','Director','Receptionist','Security','PA_TO_DIRECTOR','PA_TO_CI') OR
    EXISTS (SELECT 1 FROM visits v JOIN employees e ON e.id = v.employee_id WHERE v.visitor_id = visitors.id AND e.user_id = auth.uid())
  )
);
CREATE POLICY "visitors_write_admin_receptionist" ON visitors FOR ALL USING (
  auth.uid() IS NOT NULL AND (public.is_current_user_admin() OR public.current_user_role() = 'Receptionist')
) WITH CHECK (
  auth.uid() IS NOT NULL AND (public.is_current_user_admin() OR public.current_user_role() = 'Receptionist')
);

DROP POLICY IF EXISTS "employees_select_limited" ON employees;
DROP POLICY IF EXISTS "employees_admin_all" ON employees;
CREATE POLICY "employees_select_limited" ON employees FOR SELECT USING (
  auth.uid() IS NOT NULL AND (
    public.is_current_user_admin() OR
    public.current_user_role() IN ('Commandant','Director','Receptionist','Security','PA_TO_DIRECTOR','PA_TO_CI') OR
    employees.user_id = auth.uid()
  )
);
CREATE POLICY "employees_admin_all" ON employees FOR ALL USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());

-- Visits/badges remain role-limited (from v2)
-- Notifications/audit: no client insert/update/delete
DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
CREATE POLICY "notifications_update_own_readonly" ON notifications FOR UPDATE USING (auth.uid() IS NOT NULL AND user_id = auth.uid()) WITH CHECK (false);

DROP POLICY IF EXISTS "audit_logs_no_modify" ON audit_logs;
DROP POLICY IF EXISTS "audit_logs_no_delete" ON audit_logs;
CREATE POLICY "audit_logs_no_modify" ON audit_logs FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY "audit_logs_no_delete" ON audit_logs FOR DELETE USING (false);

-- Grants: least privilege
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON departments, positions, office_locations TO authenticated;
GRANT SELECT ON user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON visitors TO authenticated; -- constrained by RLS
GRANT SELECT, INSERT, UPDATE ON employees TO authenticated; -- constrained by RLS
GRANT SELECT, INSERT, UPDATE ON visits TO authenticated; -- constrained by RLS
GRANT SELECT, INSERT, UPDATE ON visitor_badges TO authenticated; -- constrained by RLS
GRANT SELECT, UPDATE ON notifications TO authenticated;
-- audit_logs: no client grants; service_role only

REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
GRANT TRUNCATE ON ALL TABLES IN SCHEMA public TO service_role;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

-- Regression tests (documentation only)
-- Test matrix: anon denied; authenticated non-admin cannot read all visitors; host sees own visits; receptionist can manage visitors/visits/badges; security limited; role escalation denied; audit_logs no client modify/insert.
