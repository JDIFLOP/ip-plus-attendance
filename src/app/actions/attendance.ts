"use server";

import { createClient } from '@/utils/supabase/server';

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; 
}

export async function processAttendance(deviceId: string, lat: number, lng: number) {
  const supabase = await createClient();

  const { data: settingsData, error: settingsError } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'villa_location')
    .single();

  if (settingsError || !settingsData) {
    return { error: 'Failed to load location settings' };
  }

  const { lat: villaLat, lng: villaLng, radius_m: radius } = settingsData.value;

  const distance = haversineDistance(lat, lng, villaLat, villaLng);
  if (distance > radius) {
    return { error: `distanceError: You are ${Math.round(distance)}m away (max ${radius}m).` };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('device_id', deviceId)
    .single();

  if (profileError || !profile) {
    return { error: 'Device not registered. Please contact HR.' };
  }

  const staffId = profile.id;

  const now = new Date();
  const thDateString = new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { data: todayRecord } = await supabase
    .from('attendance')
    .select('id, check_in, check_out')
    .eq('staff_id', staffId)
    .eq('date', thDateString)
    .single();

  if (todayRecord) {
    if (todayRecord.check_out) {
      return { error: 'You are already checked out for today.' };
    }
    
    const checkInTime = new Date(todayRecord.check_in).getTime();
    if (Date.now() - checkInTime < 10 * 60 * 1000) {
      return { error: 'cooldownError: Please wait 10 minutes before checking out.' };
    }

    const { error: updateError } = await supabase
      .from('attendance')
      .update({ check_out: ((new Date()).toISOString()) })
      .eq('id', todayRecord.id);

    if (updateError) return { error: 'Error processing check-out.' };
    return { success: true, type: 'check_out', name: profile.full_name };

  } else {
    // Check if today is a public holiday
    const { data: holiday } = await supabase
      .from('public_holidays')
      .select('name')
      .eq('date', thDateString)
      .single();

    const { error: insertError } = await supabase
      .from('attendance')
      .insert({
        staff_id: staffId,
        date: thDateString,
        check_in: ((new Date()).toISOString()),
        lat,
        lng,
        holiday_status: holiday ? 'Pending' : 'None'
      });

    if (insertError) return { error: 'Error processing check-in.' };
    return { success: true, type: 'check_in', name: profile.full_name, isHoliday: !!holiday };
  }
}

export async function checkDeviceStatus(deviceId: string) {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('device_id', deviceId)
    .single();
    
  if (!profile) return { status: 'unregistered' };
  
  const now = new Date();
  const thDateString = new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const { data: record } = await supabase
    .from('attendance')
    .select('check_in, check_out')
    .eq('staff_id', profile.id)
    .eq('date', thDateString)
    .single();
    
  if (!record) return { status: 'pending_in' };
  if (!record.check_out) return { status: 'pending_out' };
  return { status: 'completed' };
}
