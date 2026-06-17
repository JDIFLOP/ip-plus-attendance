"use client";

import { useEffect, useState, useCallback } from 'react';
import { CompanyLogo } from '@/components/ui/CompanyLogo';
import { LanguageToggle } from '@/components/ui/LanguageToggle';
import { useI18n } from '@/context/I18nContext';
import { processAttendance, checkDeviceStatus } from '@/app/actions/attendance';
import { getNetworkConfig } from '@/app/actions/admin';
import { getAuthRole } from '@/app/actions/auth';
import { IP_LOOKUP_URL } from '@/config/app';
import { MapPin, CheckCircle2, Clock, XCircle, Wifi, WifiOff, Loader2 } from 'lucide-react';

type CheckinStatus = 'loading' | 'unregistered' | 'pending_in' | 'pending_out' | 'completed';
type NetworkStatus = 'unknown' | 'checking' | 'allowed' | 'blocked';

export default function CheckInPage() {
  const { t } = useI18n();
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [status, setStatus] = useState<CheckinStatus>('loading');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success' | 'info'; text: string } | null>(null);

  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>('unknown');
  const [allowedIp, setAllowedIp] = useState<string>('');
  const [currentIp, setCurrentIp] = useState<string>('');
  const [ssidHint, setSsidHint] = useState<string>('IP PLUS WiFi');
  const [isManagement, setIsManagement] = useState(false);

  const verifyNetwork = useCallback(async (requiredIp: string) => {
    if (!requiredIp) { setNetworkStatus('allowed'); return; }
    setNetworkStatus('checking');
    try {
      const res = await fetch(IP_LOOKUP_URL, { cache: 'no-store' });
      const { ip } = await res.json();
      setCurrentIp(ip);
      if (ip === requiredIp) {
        setNetworkStatus('allowed');
        setMessage(null);
      } else {
        setNetworkStatus('blocked');
      }
    } catch {
      // If ipify is unreachable (e.g. on a private network), consider allowed
      setNetworkStatus('allowed');
    }
  }, []);

  // Load config and device on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'access_denied') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessage({ type: 'error', text: t.accessDenied || 'Access Denied: You do not have permission to view this page.' });
    }

    let storedId = localStorage.getItem('device_id');
    if (!storedId) {
      storedId = crypto.randomUUID();
      localStorage.setItem('device_id', storedId);
    }
    setDeviceId(storedId);

    checkDeviceStatus(storedId).then((res) => {
      setStatus(res.status as CheckinStatus);
    });

    // Determine the actor. Management (Admin/Manager/HR) bypasses the GPS and
    // network gates server-side, so we skip those client checks entirely.
    getAuthRole().then((role) => {
      const mgmt = !!role && ['Admin', 'Manager', 'HR'].includes(role);
      setIsManagement(mgmt);
      if (mgmt) {
        setNetworkStatus('allowed');
        return;
      }

      // Staff only: load allowed IP from settings and verify the network.
      getNetworkConfig().then((cfg) => {
        const configuredIp = cfg.allowed_ip?.trim();
        setAllowedIp(configuredIp || '');
        setSsidHint(cfg.ssid_hint || 'IP PLUS WiFi');

        // If no IP configured, network check is bypassed (Always allowed)
        if (!configuredIp) {
          setNetworkStatus('allowed');
        } else {
          verifyNetwork(configuredIp);
        }
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitAttendance = async (lat: number, lng: number) => {
    const res = await processAttendance(deviceId!, lat, lng);

    if (res.error) {
      let errorText = res.error;
      if (res.error.startsWith('distanceError:')) errorText = t.distanceError;
      if (res.error.startsWith('cooldownError:')) errorText = t.cooldownError;
      setMessage({ type: 'error', text: errorText });
    } else {
      const actionLabel = res.type === 'check_out' ? t.checkOut : t.checkIn;
      setMessage({ type: 'success', text: `${t.success}: ${actionLabel} — ${res.name}` });
      const nextStatus = await checkDeviceStatus(deviceId!);
      setStatus(nextStatus.status as CheckinStatus);
    }
    setLoading(false);
  };

  const handleAttendance = () => {
    // Management bypasses GPS + device + network server-side, so skip the
    // browser geolocation prompt entirely and submit with placeholder coords.
    if (isManagement) {
      setLoading(true);
      setMessage({ type: 'info', text: t.checkingLocation });
      submitAttendance(0, 0);
      return;
    }

    if (networkStatus === 'blocked') {
      setMessage({ type: 'error', text: t.wifiError });
      return;
    }
    if (networkStatus === 'checking') return;

    setLoading(true);
    setMessage({ type: 'info', text: t.checkingLocation });

    if (!navigator.geolocation) {
      setMessage({ type: 'error', text: t.locationError });
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        await submitAttendance(latitude, longitude);
      },
      () => {
        setMessage({ type: 'error', text: t.locationError + '\n' + t.allowLocationGuide });
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const isNetworkBlocked = !isManagement && networkStatus === 'blocked';
  const isButtonDisabled = loading || isNetworkBlocked || (!isManagement && networkStatus === 'checking');

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <header className="p-4 flex justify-between items-center border-b border-black/5 bg-white shadow-sm">
        <CompanyLogo />
        <LanguageToggle />
      </header>
      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto w-full">
        <div className="w-24 h-24 bg-primary/5 rounded-full flex items-center justify-center mb-6">
          <Clock className="w-12 h-12 text-primary" />
        </div>
        <h1 className="text-3xl font-bold text-primary mb-2 tracking-tight">{t.staffAttendance}</h1>
        <p className="text-black/50 mb-6 text-sm">Device ID: <span className="font-mono text-xs">{deviceId?.split('-')[0]}***</span></p>

        {/* Network Status Banner */}
        {allowedIp && (
          <div className={`w-full mb-6 rounded-xl px-4 py-3 flex items-center gap-3 text-sm font-medium transition-all ${networkStatus === 'allowed' ? 'bg-success/10 text-success border border-success/20' :
            networkStatus === 'blocked' ? 'bg-error/10 text-error border border-error/20 animate-pulse' :
              'bg-black/5 text-black/50 border border-black/10'
            }`}>
            {networkStatus === 'allowed' && <Wifi className="w-5 h-5 shrink-0" />}
            {networkStatus === 'blocked' && <WifiOff className="w-5 h-5 shrink-0" />}
            {networkStatus === 'checking' && <Loader2 className="w-5 h-5 shrink-0 animate-spin" />}
            <div className="text-left flex-1">
              {networkStatus === 'allowed' && <span>{t.connectedTo} {ssidHint} {t.connectedSuffix}</span>}
              {networkStatus === 'blocked' && (
                <div className="flex flex-col gap-1">
                  <span className="font-bold">{t.networkErrorTitle}</span>
                  <span className="font-mono text-sm font-semibold tracking-tight">
                    {t.yourCurrentIp}: <span className="underline underline-offset-2">{currentIp || 'detecting…'}</span>
                  </span>
                  <span className="text-xs opacity-75 mt-0.5">
                    {t.networkInstruction}
                  </span>
                </div>
              )}
              {networkStatus === 'checking' && <span>{t.networkCheck}</span>}
            </div>
          </div>
        )}

        {status === 'loading' ? (
          <div className="w-full h-20 animate-pulse bg-black/5 rounded-[30px]" />
        ) : status === 'unregistered' ? (
          <div className="w-full bg-warning/10 text-warning border border-warning/20 p-4 rounded-xl flex flex-col items-start text-left gap-3 relative overflow-hidden group">
            <div className="absolute inset-0 bg-warning/5 translate-x-full group-hover:translate-x-0 transition-transform duration-500 ease-in-out" />
            <div className="flex items-start gap-3 relative z-10 w-full">
              <XCircle className="w-6 h-6 shrink-0 mt-0.5" />
              <p className="flex-1 text-sm font-medium leading-relaxed">{t.unregisteredDevice}</p>
            </div>
            <div 
              onClick={() => {
                navigator.clipboard.writeText(deviceId || '');
                alert('Device ID copied to clipboard!');
              }}
              className="relative z-10 w-full mt-1 bg-white/60 hover:bg-white transition-colors p-3 rounded-lg border border-warning/30 flex items-center justify-between cursor-pointer group/copy"
            >
              <code className="font-mono text-[10px] break-all text-warning-dark font-black tracking-tight">{deviceId}</code>
              <span className="text-[9px] font-black uppercase tracking-widest bg-warning text-white px-2 py-1 rounded ml-2 shrink-0 group-hover/copy:scale-110 transition-transform">Copy</span>
            </div>
          </div>
        ) : status === 'completed' ? (
          <div className="w-full bg-success/10 text-success border border-success/20 p-6 rounded-2xl flex flex-col items-center gap-3">
            <CheckCircle2 className="w-10 h-10" />
            <span className="font-medium text-lg">{t.attendanceCompleted}</span>
          </div>
        ) : (
          <button
            onClick={handleAttendance}
            disabled={isButtonDisabled}
            title={isNetworkBlocked ? t.wifiError : ''}
            className={`w-full group relative overflow-hidden rounded-[2.5rem] p-[3px] transition-all duration-300 
              ${!isButtonDisabled ? 'hover:scale-[1.02] active:scale-[0.98]' : 'opacity-60 cursor-not-allowed'}
              ${status === 'pending_in'
                ? 'bg-primary shadow-[0_8px_30px_rgb(18,53,18,0.25)]'
                : 'bg-warning shadow-[0_8px_30px_rgb(245,158,11,0.25)]'
              }`}
          >
            <div className={`flex h-[4.5rem] w-full items-center justify-center gap-3 rounded-[40px] text-xl font-bold tracking-wide transition-colors
              ${status === 'pending_in'
                ? 'bg-white text-primary group-hover:bg-primary/95 group-hover:text-gold'
                : 'bg-white text-warning group-hover:bg-warning/95 group-hover:text-white'
              }`}>
              {loading
                ? <Loader2 className="w-6 h-6 animate-spin" />
                : isNetworkBlocked
                  ? <WifiOff className="w-6 h-6" />
                  : <MapPin className={`w-6 h-6 ${loading ? 'animate-bounce' : ''}`} />
              }
              {status === 'pending_in' ? t.checkIn : t.checkOut}
            </div>
          </button>
        )}

        {message && (
          <div className={`mt-8 p-4 rounded-xl text-sm whitespace-pre-line font-medium w-full flex gap-3 text-left
            ${message.type === 'error' ? 'bg-error/10 text-error' :
              message.type === 'success' ? 'bg-success/10 text-success justify-center text-center' :
                'bg-black/5 text-black/60'
            }`}>
            {message.type === 'error' && <XCircle className="w-5 h-5 shrink-0 mt-0.5" />}
            {message.type === 'success' && <CheckCircle2 className="w-5 h-5 shrink-0 hidden" />}
            {message.text}
          </div>
        )}
      </main>
    </div>
  );
}
