const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://tgtdlchjkrikyhzhtuxs.supabase.co', 'sb_publishable_EEwGfC2IewpL3-544enU2g_-FrhqW-K');

async function testBucket() {
  const { data, error } = await supabase.storage.getBucket('geophysics-files');
  console.log('Bucket:', data ? data.name : null, 'Error:', error ? error.message : null);
}
testBucket();
