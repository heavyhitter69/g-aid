const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://tgtdlchjkrikyhzhtuxs.supabase.co', 'sb_publishable_EEwGfC2IewpL3-544enU2g_-FrhqW-K');

async function check() {
  const { data, error } = await supabase.storage.getBucket('demo_workspace');
  console.log('Bucket:', data, 'Error:', error);
}
check();
