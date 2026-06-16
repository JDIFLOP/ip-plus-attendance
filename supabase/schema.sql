-- Supabase Schema for Pool Villa Pattaya Digital Attendance System

-- Enums
CREATE TYPE user_role AS ENUM ('Admin', 'Manager', 'HR', 'Staff');
CREATE TYPE nationality_enum AS ENUM ('Thai', 'Myanmar', 'Other');
CREATE TYPE ot_status_enum AS ENUM ('None', 'Pending OT', 'Approved', 'Denied');
CREATE TYPE wage_type_enum AS ENUM ('Monthly', 'Hourly', 'Daily');

-- settings
CREATE TABLE settings (
  key VARCHAR PRIMARY KEY,
  value JSONB NOT NULL
);

-- Insert dummy data for Pattaya coordinates as requested
INSERT INTO settings (key, value) VALUES 
('villa_location', '{"lat": 12.9235, "lng": 100.8824, "radius_m": 1}'::jsonb),
('ot_config', '{"threshold_mins": 15}'::jsonb),
('payroll_config', '{"start_day": 25, "break_duration_mins": 60}'::jsonb),
('wifi_config', '{"allowed_ip": "", "ssid_hint": "Villa WiFi"}'::jsonb);


-- profiles
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR NOT NULL,
  department VARCHAR DEFAULT 'General',
  wage_type wage_type_enum DEFAULT 'Monthly',
  rate NUMERIC DEFAULT 0,
  nationality nationality_enum DEFAULT 'Thai',
  role user_role DEFAULT 'Staff',
  username VARCHAR UNIQUE,
  password VARCHAR,
  device_id VARCHAR UNIQUE,
  birthday DATE,
  substitute_leave_quota INT DEFAULT 0,
  social_security_enabled BOOLEAN DEFAULT false,
  sso_type VARCHAR DEFAULT 'Percentage',
  sso_value NUMERIC DEFAULT 5,
  guarantee_target INT DEFAULT 0,
  guarantee_monthly INT DEFAULT 0,
  guarantee_accumulated INT DEFAULT 0,
  guarantee_status VARCHAR DEFAULT 'Deduct Monthly',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- schedules
CREATE TABLE schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  shift_start TIME NOT NULL,
  shift_end TIME NOT NULL,
  is_off_day BOOLEAN DEFAULT false,
  no_break BOOLEAN DEFAULT false,
  UNIQUE(staff_id, date)
);

-- attendance
CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  lat NUMERIC,
  lng NUMERIC,
  ot_status ot_status_enum DEFAULT 'None',
  approved_ot_mins INT DEFAULT 0,
  is_leave BOOLEAN DEFAULT false,
  leave_reason VARCHAR,
  holiday_status VARCHAR DEFAULT 'None', -- 'None', 'Pending', 'Paid', 'Substitute'
  holiday_multiplier NUMERIC DEFAULT 1.0,
  holiday_amount NUMERIC DEFAULT 0,
  UNIQUE(staff_id, date)
);

-- audit_logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  performed_by VARCHAR,
  action VARCHAR NOT NULL,
  record_id UUID,
  table_name VARCHAR,
  old_value JSONB,
  new_value JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- public_holidays
CREATE TABLE public_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE UNIQUE NOT NULL,
  name VARCHAR NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- warning_letters
CREATE TABLE warning_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE DEFAULT CURRENT_DATE,
  reason TEXT NOT NULL,
  severity_level VARCHAR DEFAULT 'Low', -- 'Low', 'Medium', 'High'
  issued_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Haversine formula function for distance measurement in meters
CREATE OR REPLACE FUNCTION haversine_distance(lat1 FLOAT, lon1 FLOAT, lat2 FLOAT, lon2 FLOAT)
RETURNS FLOAT AS $$
DECLARE
    R FLOAT := 6371000; -- Earth radius in meters
    rad_lat1 FLOAT;
    rad_lat2 FLOAT;
    d_lat FLOAT;
    d_lon FLOAT;
    a FLOAT;
    c FLOAT;
BEGIN
    rad_lat1 := radians(lat1);
    rad_lat2 := radians(lat2);
    d_lat := radians(lat2 - lat1);
    d_lon := radians(lon2 - lon1);

    a := sin(d_lat/2) * sin(d_lat/2) +
         cos(rad_lat1) * cos(rad_lat2) *
         sin(d_lon/2) * sin(d_lon/2);
    c := 2 * atan2(sqrt(a), sqrt(1 - a));

    RETURN R * c;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to prune audit_logs older than 90 days.
-- If running on Supabase free tier, usually setting up pg_cron is enabled via dashboard.
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
    'delete_old_audit_logs',
    '0 0 * * *', -- Run every day at midnight
    $$ DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days'; $$
);

-- payroll_adjustments
-- Supported 'type' values: 'Cash Advance', 'Damage/Fine', 'Bonus', 'Add-on', 'Deduction'
CREATE TABLE payroll_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  cycle_start_date DATE NOT NULL,
  type VARCHAR NOT NULL,
  amount NUMERIC NOT NULL,
  reason VARCHAR,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- payroll_rules settings row (run once after deploy)
-- INSERT INTO settings (key, value) VALUES
-- ('payroll_rules', '{"late_grace_mins": 5, "late_deduct_per_min": 2, "ot_rate_per_hour": 50}')
-- ON CONFLICT (key) DO NOTHING;

-- finalize_guarantee_deduction RPC
-- Atomically records a guarantee deduction in a SINGLE transaction:
--   1. increments profiles.guarantee_accumulated by p_amount (atomic UPDATE,
--      so concurrent calls can't lose an increment — no read-modify-write race)
--   2. inserts the matching 'Guarantee Deposit' row in payroll_adjustments
-- Called from the app via: supabase.rpc('finalize_guarantee_deduction', { p_staff_id, p_amount, p_cycle_start_date })
-- Returns the new accumulated balance.
CREATE OR REPLACE FUNCTION finalize_guarantee_deduction(
  p_staff_id UUID,
  p_amount NUMERIC,
  p_cycle_start_date DATE
)
RETURNS INT AS $$
DECLARE
  v_new_accumulated INT;
BEGIN
  UPDATE profiles
     SET guarantee_accumulated = COALESCE(guarantee_accumulated, 0) + p_amount
   WHERE id = p_staff_id
  RETURNING guarantee_accumulated INTO v_new_accumulated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Staff % not found', p_staff_id;
  END IF;

  INSERT INTO payroll_adjustments (staff_id, cycle_start_date, type, amount, reason)
  VALUES (
    p_staff_id,
    p_cycle_start_date,
    'Guarantee Deposit',
    p_amount,
    'Automated Guarantee Deduction for cycle ' || p_cycle_start_date
  );

  RETURN v_new_accumulated;
END;
$$ LANGUAGE plpgsql;
