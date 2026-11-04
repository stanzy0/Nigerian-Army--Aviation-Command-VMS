const {createClient} = require('@supabase/supabase-js');
async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const tables = ['visits', 'visitor_badges', 'visitor_documents'];
  for (const table of tables) {
    console.log('\n=== TABLE: public.' + table + ' ===');
    try {
      const sql = "SELECT policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename = '" + table + "'";
      const {data, error} = await s.rpc('exec_sql', {sql: sql});
      if (error) { console.log('  RPC error:', error.message); }
      else if (data && data.length === 0) { console.log('  No policies found'); }
      else if (data) {
        data.forEach(p => {
          console.log('  Policy:', p.policyname);
          console.log('    Command:', p.cmd);
          console.log('    Roles:', JSON.stringify(p.roles));
          console.log('    USING:', p.qual);
          console.log('    WITH CHECK:', p.with_check);
        });
      }
    } catch(e) { console.log('  Exception:', e.message); }
  }
}
main().catch(e => console.log('Fatal error:', e.message));
