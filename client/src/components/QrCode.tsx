import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Spinner } from '@/components/brand/brand';
import { cn } from '@/lib/utils';

/** Black-on-white QR (always, even in dark mode: phone cameras read it best). */
export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 720,
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [value]);
  return (
    <div className={cn('grid aspect-square place-items-center rounded-xl bg-white p-2', className)}>
      {src ? (
        <img src={src} alt={label} className="size-full [image-rendering:pixelated]" />
      ) : (
        <Spinner label="Loading QR code" />
      )}
    </div>
  );
}
