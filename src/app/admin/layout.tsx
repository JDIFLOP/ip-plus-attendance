"use client";

import { useState, useEffect } from 'react';

import { Users, PieChart, CalendarClock, Settings, LogOut, ShieldAlert, ClipboardEdit, LayoutDashboard, QrCode, ShieldCheck, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useI18n } from '@/context/I18nContext';
import { logout, getAuthRole } from '@/app/actions/auth';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t, language, setLanguage } = useI18n();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    getAuthRole().then(r => setRole(r));
  }, []);

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  const navLinks = [
    { href: '/admin', label: t.navSummary, icon: PieChart },
    { href: '/admin/overview', label: t.navOverview, icon: LayoutDashboard },
    { href: '/admin/attendance', label: t.navAttendance, icon: ClipboardEdit },
    { href: '/admin/staff', label: t.navStaff, icon: Users },
    { href: '/admin/approvals', label: t.navApprovals, icon: ShieldCheck },
    { href: '/admin/schedules', label: t.navSchedules, icon: CalendarClock },
    { href: '/admin/audit', label: t.navAudit, icon: ShieldAlert },
    { href: '/admin/settings', label: t.navSettings, icon: Settings },
    { href: '/admin/qr', label: t.qrTitle, icon: QrCode },
    { href: '/admin/users', label: t.navUsers, icon: ShieldCheck, hideFor: ['Manager', 'HR'] },
  ];

  const filteredLinks = navLinks.filter(link => {
    if (link.hideFor && role && link.hideFor.includes(role)) return false;
    return true;
  });

  return (
    <div className="min-h-screen relative bg-[#f4f6f4] text-primary flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden bg-primary text-white p-4 flex items-center justify-between z-40 relative">
        <h1 className="text-xl font-bold uppercase tracking-tight flex items-center gap-2">
          Pool Villa <span className="w-1.5 h-1.5 rounded-full bg-gold inline-block"></span>
        </h1>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Overlay for mobile */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 bottom-0 w-64 bg-primary text-white p-6 flex flex-col items-start z-50 shadow-2xl transition-transform duration-300 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="mb-12">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-white flex items-center gap-2">
            Pool Villa <span className="w-2 h-2 rounded-full bg-gold inline-block"></span>
          </h1>
          <p className="text-xs font-semibold opacity-70 uppercase tracking-widest text-white mt-1">{t.adminPortal}</p>
        </div>
        
        <nav className="flex-1 space-y-3 w-full overflow-y-auto pr-2 pb-4">
          {filteredLinks.map((link) => {
            const isActive = pathname === link.href;
            const Icon = link.icon;
            
            return (
              <Link 
                key={link.href}
                href={link.href}
                className={`flex items-center gap-3 w-full p-3 rounded-xl font-medium border relative overflow-hidden group transition-all ${
                  isActive 
                    ? 'bg-white/10 text-white border-white/10' 
                    : 'border-transparent text-white/70 hover:bg-white/5 hover:text-white'
                }`}
              >
                {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gold rounded-r-md transition-all" />}
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'text-gold' : 'opacity-70 group-hover:scale-110'}`} /> 
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="w-full mt-auto mb-4 border-t border-white/10 pt-4 flex flex-col gap-2">
          <div className="flex items-center justify-between bg-white/5 rounded-xl p-1 border border-white/5">
            {(['en', 'th', 'mm'] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => setLanguage(lang)}
                className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-lg transition-all ${
                  language === lang ? 'bg-white text-primary shadow-sm' : 'text-white/50 hover:text-white hover:bg-white/10'
                }`}
              >
                {lang}
              </button>
            ))}
          </div>
          <button onClick={handleLogout} className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/10 text-white/80 font-bold transition-colors border border-white/5 group">
            <LogOut className="w-5 h-5 text-white group-hover:text-red-400 transition-colors" /> {t.logout}
          </button>
        </div>
      </aside>

      {/* Main Content Wrapper */}
      <div className="flex-1 md:ml-64 relative z-10 w-full h-[100dvh] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
