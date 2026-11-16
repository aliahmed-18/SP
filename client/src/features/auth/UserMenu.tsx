import { useQueryClient } from '@tanstack/react-query';
import { LayoutDashboard, LogOut, MoreHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api } from '@/lib/api';
import { useMe } from './use-me';

/** "…" menu in the instructor header. `children` = page-specific items (e.g. End session). */
export function UserMenu({ children }: { children?: ReactNode }) {
  const me = useMe();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    queryClient.clear();
    navigate('/', { replace: true });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Menu">
          <MoreHorizontal className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {me.data && (
          <DropdownMenuLabel className="font-normal">
            <span className="block font-medium">{me.data.name}</span>
            <span className="block text-xs text-muted-foreground">{me.data.email}</span>
          </DropdownMenuLabel>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/dashboard')}>
          <LayoutDashboard /> Dashboard
        </DropdownMenuItem>
        {children}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logout()}>
          <LogOut /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
