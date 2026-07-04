const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://tgtdlchjkrikyhzhtuxs.supabase.co', 'sb_publishable_EEwGfC2IewpL3-544enU2g_-FrhqW-K');

async function check() {
  console.log('--- Guest Files (demo_project_files) ---');
  const { data: guests } = await supabase.from('demo_project_files').select('guest_id, project_name, name, storage_path');
  console.log(guests);
  
  console.log('\n--- Auth Files (project_files) ---');
  const { data: auths } = await supabase.from('project_files').select('project_id, name, storage_path');
  console.log(auths);
}
check();
