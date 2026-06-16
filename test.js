require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  const staff = { full_name: 'Test Staff', nationality: 'Thai', role: 'Staff', department: 'General', wage_type: 'Monthly', rate: 100 };
  
  const payload = { 
    full_name: staff.full_name, 
    nationality: staff.nationality || 'Thai', 
    role: staff.role || 'Staff',
    department: staff.department || 'General',
    wage_type: staff.wage_type || 'Monthly',
    rate: staff.rate || 0,
    username: staff.username || null,
    password: staff.password || null,
    device_id: staff.device_id || null
  };

  if (!payload.device_id) delete payload.device_id;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .upsert(payload)
      .select()
      .single();

    console.log("Error:", error);
    console.log("Data:", data);
  } catch (err) {
    console.error("Caught error:", err);
  }
}

test();
