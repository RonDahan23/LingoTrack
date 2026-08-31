import { useState } from 'react';

import { formatDueLabel, sortForms } from '../lib/practiceProgress';
import {
  FORM_LABEL_NAMES,
  PART_OF_SPEECH_NAMES,
  WORD_STATUS_META,
  type WordBankEntry,
} from '../types/word';

/// One saved word: translation, status, and — when expanded — the whole
/// morphological family plus the lyric it was captured from.
export function WordCard({ word, onDelete }: { word: WordBankEntry; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const meta = WORD_STATUS_META[word.status];
  const pos = PART_OF_SPEECH_NAMES[word.partOfSpeech];

  return (
    <div className="rounded-xl bg-surface-raised">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-xl p-3 text-left transition hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-base font-semibold text-white">{word.lemma}</p>
            {pos && <span className="shrink-0 text-xs text-neutral-500">{pos}</span>}
            {word.cefrLevel && (
              <span className="shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-medium text-neutral-400">
                {word.cefrLevel}
              </span>
            )}
          </div>
          <p dir="rtl" className="truncate text-sm text-emerald-200">
            {word.translation}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.badge}`}>
            {meta.label}
          </span>
          <span className="text-[11px] text-neutral-500">{formatDueLabel(word.dueAt)}</span>
        </div>
      </button>

      {/* Mastery bar — mirrors the track tile's progress treatment. */}
      <div className="mx-3 h-1.5 overflow-hidden rounded-full bg-neutral-700">
        <div
          className={`h-full transition-all ${meta.bar}`}
          style={{ width: `${Math.round(word.mastery * 100)}%` }}
        />
      </div>

      {open && (
        <div className="px-3 pb-3 pt-2">
          {word.word !== word.lemma && (
            <p className="text-xs text-neutral-500">
              saved as “{word.word}” — part of the “{word.root}” family
            </p>
          )}

          {word.forms.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sortForms(word.forms).map((form) => (
                <span
                  key={`${form.label}:${form.form}`}
                  className="rounded-md bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
                >
                  {form.form}
                  <span className="ml-1 text-neutral-500">{FORM_LABEL_NAMES[form.label]}</span>
                </span>
              ))}
            </div>
          )}

          {word.contextLine && (
            <p className="mt-3 border-l-2 border-neutral-700 pl-3 text-sm italic text-neutral-400">
              “{word.contextLine}”
            </p>
          )}

          <div className="mt-3 flex items-center justify-between text-xs text-neutral-500">
            <span className="tabular-nums">
              {word.attemptCount > 0
                ? `${word.correctCount}/${word.attemptCount} correct`
                : 'not practised yet'}
              {word.lapses > 0 && ` · ${word.lapses} ${word.lapses === 1 ? 'lapse' : 'lapses'}`}
            </span>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-full px-2 py-1 text-rose-400 transition hover:bg-rose-500/10"
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
