import { useState, type FormEvent } from 'react';
import { LIMITS, type HostTopic } from '@getit/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { qaApi } from '../qa-api';

export function RenameTopicDialog({
  topic,
  open,
  onOpenChange,
}: {
  topic: HostTopic;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename topic</DialogTitle>
        </DialogHeader>
        <RenameForm topic={topic} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function RenameForm({ topic, onClose }: { topic: HostTopic; onClose: () => void }) {
  const [title, setTitle] = useState(topic.title);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    if (await qaApi.updateTopic(topic.id, { title: title.trim() })) onClose();
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Input
        aria-label="Topic title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={LIMITS.topicTitleMax}
        autoFocus
        dir="auto"
      />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!title.trim()}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
