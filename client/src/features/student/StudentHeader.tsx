import { DoorOpen, MoreHorizontal } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Wordmark } from '@/components/brand/brand';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** Sticky phone header (shot 20): app icon + lecture topic + theme toggle + menu. */
export function StudentHeader({ topic, children }: { topic: string; children?: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
        <Wordmark className="h-7 w-auto shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 leading-snug font-semibold" dir="auto">
            {topic}
          </p>
          {children}
        </div>
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Menu">
              <MoreHorizontal className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => navigate('/')}>
              <DoorOpen /> Leave this lecture
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
