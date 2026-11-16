import { QrCode } from '@/components/QrCode';
import { joinUrl } from '@/lib/links';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function QrDialog({
  code,
  open,
  onOpenChange,
}: {
  code: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const url = joinUrl(code);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Scan to join</DialogTitle>
          <DialogDescription>Or open {window.location.host} and enter the code.</DialogDescription>
        </DialogHeader>
        <QrCode value={url} label={`QR code to join session ${code}`} className="mx-auto w-full max-w-80" />
        <p className="text-center text-4xl font-bold tracking-[0.3em] text-primary">{code}</p>
        <p className="text-center text-xs break-all text-muted-foreground">{url}</p>
      </DialogContent>
    </Dialog>
  );
}
