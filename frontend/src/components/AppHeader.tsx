import type { ReactNode } from 'react';

interface AppHeaderProps {
  title: ReactNode;
  /** Optional leading element, e.g. a back button. */
  leading?: ReactNode;
  /** Optional trailing actions, e.g. sync / logout. */
  actions?: ReactNode;
}

/// Sticky top bar shared across screens. Mobile-first: stays within a max width
/// and hugs the safe area.
export function AppHeader({ title, leading, actions }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-neutral-800 bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
        {leading}
        <h1 className="flex-1 truncate text-lg font-semibold text-white">{title}</h1>
        {actions && <div className="flex items-center gap-1">{actions}</div>}
      </div>
    </header>
  );
}
