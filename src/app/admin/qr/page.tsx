"use client";

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useI18n } from '@/context/I18nContext';

export default function StaticQRPage() {
  const { t } = useI18n();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    // Render the QR (uses window.location) only after client mount to avoid an
    // SSR/client hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounted(true);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8 space-y-12 select-none">

      {/* Static QR Code — hydration-safe */}
      <div className="bg-white p-6 shadow-2xl rounded-[2.5rem] border border-gray-100 flex items-center justify-center min-h-[428px] min-w-[428px]">
        {isMounted ? (
          <QRCodeSVG
            value={window.location.origin + "/"}
            size={380}
            level="H"
            includeMargin={false}
          />
        ) : (
          <div className="w-[380px] h-[380px] bg-gray-100 animate-pulse rounded-xl flex items-center justify-center text-gray-400 font-bold tracking-widest uppercase">
            {t.loading}
          </div>
        )}
      </div>

    </div>
  );
}
