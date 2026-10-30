# NA Avn Comd - Supabase Migrations

## Files
- `20251024_init_naavc.sql` - Initial schema (employees, visitors, visits, roles, notifications, audit logs)

## Apply later (new Supabase project)
1. Create a new Supabase project
2. Link CLI: `supabase link --project-ref <ref>`
3. Apply: `supabase db push` or run SQL in SQL editor
4. Enable RLS (already in migration)
5. Configure auth (email/password or providers)
6. Set env vars in your deployment (do not use .env.local.backup)

## Test
- Create test users in auth.users
- Insert into user_roles with appropriate role
- Test RLS policies with different roles
- Verify CRUD for employees/visitors/visits

## Notes
- Demo mode remains enabled; no DB connected yet
- Avoid USING(true) policies; service role only server-side
- Visit statuses must match app: pending, approved, rejected, checked_in, checked_out
- Do not expose service role key in browser


## Secure first-administrator provisioning
1. Create user in Supabase Auth.
2. Insert into user_roles (user_id, email, role='Admin') via service role or SQL editor by trusted admin.
3. Do not allow self-promotion via app/policies.

## RLS testing checklist
- Admin: full access to assigned areas
- Security/Reception: check-in/out, visits
- Host/Employee: own visits only
- Unauthenticated/unauthorized: denied


## Corrective migration (20251024_fix_rls_policies.sql)
Apply after initial migration. Uses SECURITY DEFINER helpers (is_admin/user_role) with safe search_path. Notifications and audit logs require service role for inserts. Admin provisioning must be manual.



## Corrective migration v2 (20251025_fix_rls_policies_v2.sql)
Apply after 20251024_init_naavc.sql. Uses zero-arg SECURITY DEFINER helpers with pg_catalog in search_path. Client inserts to notifications/audit_logs blocked; use service role server-side. Manual admin provisioning required.
