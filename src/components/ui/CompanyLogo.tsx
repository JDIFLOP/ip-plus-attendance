"use client";

import Image from 'next/image';
import { useState, useEffect } from 'react';
import { ShieldCheck, User, Lock, Loader2, X } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import { login, getSession } from '@/app/actions/auth';
import { useRouter } from 'next/navigation';

export function CompanyLogo() {
  const { t } = useI18n();
  const router = useRouter();
  const [clicks, setClicks] = useState(0);
  const [showLogin, setShowLogin] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isStaff, setIsStaff] = useState(false);

  // Check if current user is staff to prevent showing login
  useEffect(() => {
    getSession().then(session => {
      if (session && session.role === 'Staff') {
        setIsStaff(true);
      }
    });
  }, []);

  useEffect(() => {
    if (clicks > 0) {
      const timer = setTimeout(() => setClicks(0), 1000);
      return () => clearTimeout(timer);
    }
  }, [clicks]);

  useEffect(() => {
    // Reveal the hidden admin login after 5 rapid logo taps. Deriving this from
    // the click counter in an effect is intentional, so the setState-in-effect
    // rule is suppressed for this block.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (clicks >= 5 && !isStaff) {
      setShowLogin(true);
      setClicks(0);
      setError('');
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [clicks, isStaff]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await login(username, password);
      if (res.error) {
        setError(res.error === 'Invalid username or password' ? t.invalidCredentials : res.error);
      } else if (res.role === 'Admin' || res.role === 'Manager' || res.role === 'HR') {
        setShowLogin(false);
        router.push('/admin');
      } else {
        // Successful login but as staff? This shouldn't normally happen via this modal
        setShowLogin(false);
        router.refresh();
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div
        className="flex items-center gap-2 select-none cursor-default transition-none"
        onClick={() => !isStaff && setClicks(c => c + 1)}
      >
        <div className="relative h-10 w-40">
          <Image
            src="/icon.webp"
            alt="Pool Villa Pattaya"
            fill
            className="object-contain"
            priority
          />
        </div>
      </div>

      {showLogin && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 border border-primary/10">
            {/* Modal Header */}
            <div className="bg-primary p-8 text-center relative">
              <button
                onClick={() => setShowLogin(false)}
                className="absolute top-6 right-6 text-white/40 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
              <div className="mx-auto w-16 h-16 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center mb-4">
                <ShieldCheck className="w-8 h-8 text-gold" />
              </div>
              <h2 className="text-2xl font-black text-white tracking-tight uppercase">
                {t.adminLoginTitle}
              </h2>
            </div>

            {/* Modal Body */}
            <div className="p-8">
              <form className="space-y-5" onSubmit={handleLogin}>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-primary/40 uppercase tracking-widest ml-1">{t.username}</label>
                  <div className="relative group">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/20 group-focus-within:text-primary transition-colors" />
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-black/5 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all bg-black/5 font-bold text-primary placeholder:text-primary/20"
                      placeholder={t.placeholderUsername}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-primary/40 uppercase tracking-widest ml-1">{t.password}</label>
                  <div className="relative group">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/20 group-focus-within:text-primary transition-colors" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-black/5 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all bg-black/5 font-bold text-primary placeholder:text-primary/20"
                      placeholder={t.placeholderPassword}
                    />
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-widest p-3 rounded-lg text-center border border-red-100">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-primary hover:bg-primary-light text-white font-black tracking-widest uppercase py-4 rounded-xl transition-all mt-4 shadow-lg shadow-primary/20 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : t.loginButton}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
