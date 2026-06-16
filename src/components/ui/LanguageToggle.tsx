"use client";

import { useI18n } from '@/context/I18nContext';
import { Globe } from 'lucide-react';

export function LanguageToggle() {
  const { language, setLanguage } = useI18n();

  const handleToggle = () => {
    if (language === 'en') setLanguage('th');
    else if (language === 'th') setLanguage('mm');
    else setLanguage('en');
  };

  const labels = {
    en: 'English',
    th: 'ไทย',
    mm: 'မြန်မာ'
  };

  return (
    <button 
      onClick={handleToggle}
      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-sm font-medium text-primary hover:bg-black/5 transition-colors border border-black/10"
    >
      <Globe className="w-4 h-4" />
      <span>{labels[language]}</span>
    </button>
  );
}
