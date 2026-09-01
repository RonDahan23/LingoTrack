interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/// Sticky search field under the app header. Sits above the difficulty tabs and
/// searches every bucket at once, so it is deliberately not tab-scoped.
export function SearchBar({
  value,
  onChange,
  placeholder = 'Search all songs…',
}: SearchBarProps) {
  return (
    <div className="sticky top-14 z-10 border-b border-neutral-800 bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-3xl items-center px-4">
        <div className="relative flex-1">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>

          <input
            type="text"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            // Escape clears without having to reach for the button.
            onKeyDown={(event) => {
              if (event.key === 'Escape' && value !== '') {
                event.preventDefault();
                onChange('');
              }
            }}
            placeholder={placeholder}
            aria-label="Search songs across all difficulty levels"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-lg bg-surface-raised py-2 pl-9 pr-9 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />

          {value !== '' && (
            <button
              type="button"
              onClick={() => onChange('')}
              aria-label="Clear search"
              title="Clear search"
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-neutral-400 transition hover:bg-neutral-700 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
                className="h-4 w-4"
              >
                <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
