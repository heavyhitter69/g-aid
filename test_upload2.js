const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://tgtdlchjkrikyhzhtuxs.supabase.co', 'sb_publishable_EEwGfC2IewpL3-544enU2g_-FrhqW-K');

async function testUpload() {
  const fileContent = new Blob(['dummy data'], { type: 'text/plain' });
  const { data, error } = await supabase.storage.from('demo_workspace').upload('test/dummy2.txt', fileContent, { upsert: true, contentType: 'text/plain' });
  console.log('Upload test:', data, 'Error:', error);
}
testUpload();
