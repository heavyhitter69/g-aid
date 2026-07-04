const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://tgtdlchjkrikyhzhtuxs.supabase.co', 'sb_publishable_EEwGfC2IewpL3-544enU2g_-FrhqW-K');

async function check() {
  const { data, error } = await supabase.from('demo_project_files').select('*');
  console.log('Guest files:', data, 'Error:', error);
}
check();
