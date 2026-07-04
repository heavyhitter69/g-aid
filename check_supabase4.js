const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://tgtdlchjkrikyhzhtuxs.supabase.co', 'sb_publishable_EEwGfC2IewpL3-544enU2g_-FrhqW-K');

async function check() {
  const { data, error } = await supabase.from('project_files').select('*').limit(1);
  console.log('project_files columns:', data ? Object.keys(data[0] || {}) : 'no data', 'Error:', error);
  const { data: b1, error: e1 } = await supabase.storage.getBucket('geophysics-files');
  console.log('geophysics-files bucket:', b1 ? 'exists' : 'missing', e1);
  const { data: b2, error: e2 } = await supabase.storage.getBucket('gaid_workspace');
  console.log('gaid_workspace bucket:', b2 ? 'exists' : 'missing', e2);
}
check();
