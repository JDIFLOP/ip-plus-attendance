import type { Metadata } from 'next';
import { Prompt } from 'next/font/google';
import './globals.css';
import { I18nProvider } from '@/context/I18nContext';
import { InAppBrowserBlocker } from '@/components/InAppBrowserBlocker';

const prompt = Prompt({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  variable: '--font-prompt',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Pool Villa Pattaya | ระบบลงเวลาดิจิทัล',
  description: 'Digital Attendance System for Pool Villa Pattaya Staff',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th" className={prompt.variable}>
      <body className={`${prompt.className} antialiased bg-background text-foreground selection:bg-gold/30`}>
        <I18nProvider>
          <InAppBrowserBlocker />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
