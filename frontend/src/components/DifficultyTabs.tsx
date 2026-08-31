import { DIFFICULTY_META, DIFFICULTY_ORDER, type DifficultyLevel } from '../types/track';

interface DifficultyTabsProps {
  active: DifficultyLevel;
  counts: Record<DifficultyLevel, number>;
  onSelect: (level: DifficultyLevel) => void;
}

/// The three difficulty tabs. Full-width and equal on mobile.
export function DifficultyTabs({ active, counts, onSelect }: DifficultyTabsProps) {
  return (
    <div className="sticky top-14 z-10 border-b border-neutral-800 bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl" role="tablist">
        {DIFFICULTY_ORDER.map((level) => {
          const meta = DIFFICULTY_META[level];
          const isActive = level === active;
          return (
            <button
              key={level}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(level)}
              className={`flex-1 border-b-2 px-2 py-3 text-center text-sm font-medium transition ${
                isActive
                  ? meta.activeTab
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <span className="block truncate">{meta.label}</span>
              <span className="text-xs text-neutral-500">{counts[level]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
