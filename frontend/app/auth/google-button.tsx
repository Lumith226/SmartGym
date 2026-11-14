'use client';

import { signIn } from 'next-auth/react';
import { useState, type ReactNode } from 'react';
import { Button } from '../../components/ui/button';

export function GoogleButton({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [pending, setPending] = useState(false);

  async function start() {
    setPending(true);
    try {
      await signIn('google', { redirectTo: '/app' });
      return;
    } catch {
      // Fall back to the application's localized login error below.
    }
    window.location.assign('/dang-nhap?google=failed');
  }

  return (
    <Button
      type="button"
      disabled={!enabled || pending}
      aria-busy={pending}
      onClick={start}
      variant="outline"
      className="h-11 w-full gap-2.5 rounded-xl border border-border bg-card text-xs font-semibold text-foreground transition-all hover:border-primary/40 hover:bg-accent"
    >
      {children}
    </Button>
  );
}
