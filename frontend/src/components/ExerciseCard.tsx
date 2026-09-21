import { splitOnBlank } from '../lib/practiceProgress';
import type { Exercise } from '../types/word';

/// Renders one quiz question and its options.
///
/// Presentation only — the parent owns selection state and grading, so the
/// answer key never has to be reasoned about in two places.
export function ExerciseCard({
  exercise,
  selectedIndex,
  revealed,
  onSelect,
}: {
  exercise: Exercise;
  selectedIndex: number | null;
  /** True once the answer is submitted; switches options into feedback colours. */
  revealed: boolean;
  onSelect: (index: number) => void;
}) {
  // Hebrew options need RTL; English ones must stay LTR.
  const optionsAreHebrew = exercise.type === 'MCQ_EN_TO_HE';

  return (
    <div>
      <p dir="auto" className="text-sm text-neutral-400">{promptLabel(exercise)}</p>

      {exercise.type === 'FILL_BLANK' && exercise.sentence ? (
        <FillBlankPrompt sentence={exercise.sentence} />
      ) : (
        // dir=auto, not a per-type ternary: the question text is Hebrew for
        // every type except MCQ_EN_TO_HE, whose prompt is the English word
        // itself. Resolving from the first strong character gets all four
        // right, and keeps working if a prompt's language changes.
        <p dir="auto" className="mt-2 text-3xl font-semibold text-white">
          {exercise.prompt}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-2">
        {exercise.options.map((option, index) => (
          <button
            key={`${option}:${index}`}
            type="button"
            disabled={revealed}
            onClick={() => onSelect(index)}
            dir={optionsAreHebrew ? 'rtl' : 'ltr'}
            className={optionClass(index, exercise.answerIndex, selectedIndex, revealed)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function FillBlankPrompt({ sentence }: { sentence: string }) {
  const [before, after] = splitOnBlank(sentence);
  return (
    <p className="mt-2 text-2xl font-semibold leading-relaxed text-white">
      {before}
      <span className="mx-1 inline-block min-w-16 border-b-2 border-brand align-bottom" />
      {after}
    </p>
  );
}

/** Instructions are Hebrew; only the English being practised stays English. */
function promptLabel(exercise: Exercise): string {
  switch (exercise.type) {
    case 'MCQ_EN_TO_HE':
      return 'מה הפירוש?';
    case 'MCQ_HE_TO_EN':
      return 'איזו מילה באנגלית זו?';
    case 'FILL_BLANK':
      return 'השלימו את השורה';
    case 'FORM_MATCH':
      return 'צורות של המילה';
    default:
      return '';
  }
}

/**
 * Option styling.
 *
 * Written as complete class strings per branch rather than assembled from
 * fragments — Tailwind's JIT scanner only keeps classes it can see verbatim in
 * the source, so a concatenated name would be purged from the production build.
 */
function optionClass(
  index: number,
  answerIndex: number,
  selectedIndex: number | null,
  revealed: boolean,
): string {
  const base =
    'w-full rounded-xl border px-4 py-3 text-left text-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand';

  if (!revealed) {
    return selectedIndex === index
      ? `${base} border-brand bg-brand/10 text-white`
      : `${base} border-neutral-700 bg-surface-raised text-neutral-200 hover:bg-surface-hover`;
  }
  if (index === answerIndex) {
    return `${base} border-emerald-500 bg-emerald-500/15 text-emerald-200`;
  }
  if (index === selectedIndex) {
    return `${base} border-rose-500 bg-rose-500/15 text-rose-200`;
  }
  return `${base} border-neutral-800 bg-surface-raised text-neutral-500`;
}
