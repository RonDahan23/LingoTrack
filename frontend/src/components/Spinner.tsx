export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-neutral-400">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-600 border-t-brand"
        role="status"
        aria-label={label ?? 'Loading'}
      />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}
