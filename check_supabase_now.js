const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://tgtdlchjkrikyhzhtuxs.supabase.co', 'sb_publishable_EEwGfC2IewpL3-544enU2g_-FrhqW-K');

async function check() {
  const { data: files, error } = await supabase.from('demo_project_files').select('*');
  console.log('demo_project_files:', files);
  if (error) console.log('Error:', error);
  
  const { data: buckets, error: berr } = await supabase.storage.listBuckets();
  console.log('Buckets:', buckets?.map(b => b.name));
  
  const { data: bfiles, error: fberr } = await supabase.storage.from('demo_workspace').list();
  console.log('Files in demo_workspace root:', bfiles);
}
check();
