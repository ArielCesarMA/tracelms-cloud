import { memo, useState, useEffect } from 'react';

type Props = {
  /** Plain-language summary shown to all users at all times. */
  message: string;
  /** Technical detail (error codes, stack snippets). Hidden until user expands. */
  detail?: string;
  /** When true the Details toggle is suppressed — operation is still in progress. */
  isBusy?: boolean;
  /** Extra CSS class applied to the outer wrapper (e.g. `req-sticky-feedback`). */
  className?: string;
};

/**
 * Two-section feedback display.
 *
 * - Main section: layman-friendly message, always visible.
 * - Details section: raw technical error, initially hidden.
 *   A "Details ▸" button reveals it; a "Hide ▴" button collapses it.
 *
 * The detail panel auto-collapses whenever `message` changes (new operation,
 * new context — stale details never bleed through).
 */
export const FeedbackMessage = memo(function FeedbackMessage({
  message,
  detail,
  isBusy = false,
  className,
}: Props): JSX.Element | null {
  const [expanded, setExpanded] = useState(false);

  // Collapse whenever the top-level message changes so stale details never
  // appear under a fresh success or progress message.
  useEffect(() => {
    setExpanded(false);
  }, [message]);

  if (!message) return null;

  const canExpand = !isBusy && !!detail;

  const wrapperClass = ['feedback-msg', className].filter(Boolean).join(' ');

  return (
    <div className={wrapperClass} aria-live="polite">
      <p className="feedback-msg__text">{message}</p>

      {canExpand && (
        <div className="feedback-msg__detail-zone">
          {!expanded ? (
            <button
              type="button"
              className="feedback-msg__toggle"
              onClick={() => setExpanded(true)}
              aria-expanded={false}
            >
              Details ▸
            </button>
          ) : (
            <>
              <pre className="feedback-msg__detail" role="region" aria-label="Error details">
                {detail}
              </pre>
              <button
                type="button"
                className="feedback-msg__toggle"
                onClick={() => setExpanded(false)}
                aria-expanded={true}
              >
                Hide ▴
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
});
