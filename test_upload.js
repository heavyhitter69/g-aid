const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://tgtdlchjkrikyhzhtuxs.supabase.co', 'sb_publishable_EEwGfC2IewpL3-544enU2g_-FrhqW-K');

async function testUpload() {
  const fileContent = 'dummy data';
  const { data, error } = await supabase.storage.from('demo_workspace').upload('test/dummy.txt', fileContent, { upsert: true });
  console.log('Upload test:', data, 'Error:', error);
}
testUpload();
