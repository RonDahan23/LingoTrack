import { useEffect, useRef, useState } from 'react';

import { isSpeechSupported, speakEnglish } from '../lib/speech';

/**
 * Plays the English pronunciation of a word. Renders nothing at all when the
 * browser has no speech synthesis, rather than a button that does nothing.
 */
export function SpeakButton({ text, className = '' }: { text: string; className?: string }) {
  const [speaking, setSpeaking] = useState(false);
  // Guards against setting state after the card is collapsed/unmounted, which
  // is easy to hit here because an utterance outlives a click by seconds.
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  if (!isSpeechSupported()) return null;

  const label = `השמעת ההגייה של “${text}”`;

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        setSpeaking(true);
        void speakEnglish(text).finally(() => {
          if (mounted.current) setSpeaking(false);
        });
      }}
      className={`shrink-0 rounded-full p-1.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
        speaking ? 'text-brand' : 'text-neutral-400 hover:bg-neutral-700 hover:text-white'
      } ${className}`}
    >
      {/* Speaker glyph. Not mirrored in RTL: it depicts a physical object, and
          the sound waves read as emanating from the cone either way. */}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path d="M4 9v6h4l5 4V5L8 9H4z" strokeLinejoin="round" />
        <path d="M16.5 8.5a5 5 0 010 7" strokeLinecap="round" />
        {speaking && <path d="M19.5 6a9 9 0 010 12" strokeLinecap="round" />}
      </svg>
    </button>
  );
}
