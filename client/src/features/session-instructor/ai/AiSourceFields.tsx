import { useRef, useState } from 'react';
import { FileText, Upload, X } from 'lucide-react';
import { AI_LIMITS } from '@getit/shared';
import { Spinner } from '@/components/brand/brand';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { ACCEPT, ACCEPT_LABEL, ExtractError, extractText } from './extract-text';
import type { SourceFile } from './source-text';

let nextId = 1;

/** Upload slides or notes (read in the browser), paste text, and an optional note for the AI. */
export function AiSourceFields({
  files,
  setFiles,
  pasted,
  setPasted,
  note,
  setNote,
}: {
  files: SourceFile[];
  setFiles: React.Dispatch<React.SetStateAction<SourceFile[]>>;
  pasted: string;
  setPasted: (t: string) => void;
  note: string;
  setNote: (t: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [limitMsg, setLimitMsg] = useState<string | null>(null);

  function add(list: FileList | null) {
    if (!list?.length) return;
    const room = AI_LIMITS.filesMax - files.length;
    const chosen = Array.from(list).slice(0, Math.max(0, room));
    setLimitMsg(
      list.length > room
        ? `You can upload up to ${AI_LIMITS.filesMax} files. Remove one to add another.`
        : null,
    );
    for (const file of chosen) {
      const id = nextId++;
      setFiles((prev) => [...prev, { id, name: file.name, text: null, error: null }]);
      extractText(file).then(
        (text) => setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, text } : f))),
        (err: unknown) =>
          setFiles((prev) =>
            prev.map((f) =>
              f.id === id
                ? { ...f, error: err instanceof ExtractError ? err.message : "Couldn't read this file." }
                : f,
            ),
          ),
      );
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Upload slides or notes</span>
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            add(e.dataTransfer.files);
          }}
          disabled={files.length >= AI_LIMITS.filesMax}
          className={cn(
            'flex min-h-24 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-4 text-center text-sm transition-colors hover:bg-accent/40 disabled:opacity-50',
            dragging && 'border-primary bg-accent/60',
          )}
        >
          <Upload className="size-5 text-primary" aria-hidden />
          <span className="font-medium">Choose files or drop them here</span>
          <span className="text-xs text-muted-foreground">{ACCEPT_LABEL}</span>
        </button>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple
          className="sr-only"
          aria-label="Upload slides or notes"
          data-testid="ai-file-input"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = ''; // the same file can be chosen again after removing it
          }}
        />
        {limitMsg && <p className="text-sm text-destructive">{limitMsg}</p>}
        {files.length > 0 && (
          <ul className="flex flex-col gap-1.5" aria-label="Uploaded files" data-testid="ai-files">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm">
                {f.text === null && !f.error ? (
                  <Spinner decorative className="!size-4" />
                ) : (
                  <FileText
                    className={cn('size-4', f.error ? 'text-destructive' : 'text-primary')}
                    aria-hidden
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{f.name}</span>
                  <span
                    className={cn('block text-xs', f.error ? 'text-destructive' : 'text-muted-foreground')}
                  >
                    {f.error ??
                      (f.text === null
                        ? 'Reading…'
                        : `Text ready · ${f.text.length.toLocaleString('en')} characters`)}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setFiles((prev) => prev.filter((x) => x.id !== f.id))}
                  aria-label={`Remove ${f.name}`}
                >
                  <X className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="ai-text">
          {files.length ? 'Add more text (optional)' : 'Or paste slide text or notes'}
        </Label>
        <Textarea
          id="ai-text"
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          maxLength={AI_LIMITS.slideTextMax}
          rows={files.length ? 3 : 6}
          dir="auto"
          placeholder="Paste the text from your slides or notes here."
          className="max-h-60"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="ai-note">Note for the AI (optional)</Label>
        <Input
          id="ai-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={AI_LIMITS.noteMax}
          dir="auto"
          placeholder="e.g. Focus on the main formulas"
        />
      </div>
    </div>
  );
}
