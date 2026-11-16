import { Settings } from 'lucide-react';
import { TIMER_CHOICES, type PresentSettings } from '@getit/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

/** Spec D.4–5: time per question + "Show the answer as soon as a question closes". Stored on the server. */
export function SettingsDialog({
  settings,
  onChange,
}: {
  settings: PresentSettings;
  onChange: (s: PresentSettings) => void;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Projector settings" title="Settings">
          <Settings className="size-5" />
        </Button>
      </DialogTrigger>
      {/* Don't hand focus back to the gear: a focus ring would stay on the projector all lecture. */}
      <DialogContent onCloseAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Run in class</DialogTitle>
          <DialogDescription>
            One key moves the class through each question: open it, close it and show the answer, then open
            the next one.
          </DialogDescription>
        </DialogHeader>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-medium">Time per question</legend>
          <div className="grid grid-cols-4 gap-2">
            {TIMER_CHOICES.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={settings.timerSec === t}
                onClick={() => onChange({ ...settings, timerSec: t })}
                className={cn(
                  'min-h-11 rounded-xl border font-medium',
                  settings.timerSec === t &&
                    'border-primary bg-accent text-accent-foreground ring-1 ring-primary',
                )}
              >
                {t === 0 ? 'No timer' : `${t} s`}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            The question closes on its own when time runs out. Click the timer to add 15 seconds.
          </p>
        </fieldset>
        <div className="flex items-start justify-between gap-4 rounded-xl border p-4">
          <div>
            <Label htmlFor="auto-reveal" className="text-base">
              Show the answer as soon as a question closes
            </Label>
            <p className="mt-1 text-sm text-muted-foreground">
              Turn off to show how the class voted first, discuss, then reveal the answer.
            </p>
          </div>
          <Switch
            id="auto-reveal"
            checked={settings.autoReveal}
            onCheckedChange={(v) => onChange({ ...settings, autoReveal: v })}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
