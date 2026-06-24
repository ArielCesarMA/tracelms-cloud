import { memo } from 'react';

const STEPS = ['Enhancement', 'Scenarios', 'Test Cases', 'Automation'] as const;

type StepState = 'pending' | 'active' | 'completed';

type Props = {
  /**
   * 1–4 while Generate All is running (active step index, 1-based).
   * 5 = all completed (shown briefly before parent clears it).
   * 0 = idle, renders nothing.
   */
  activeStep: number;
  /**
   * Optional second step to mark active simultaneously (for parallel phases).
   * When set, both activeStep and secondActiveStep render as "active".
   */
  secondActiveStep?: number;
};

export const StepStepper = memo(function StepStepper({ activeStep, secondActiveStep }: Props): JSX.Element | null {
  if (activeStep === 0) return null;

  const allDone = activeStep > STEPS.length;
  const firstCompleted = secondActiveStep != null ? Math.min(activeStep, secondActiveStep) : activeStep;

  const ariaLabel = allDone
    ? 'All steps completed'
    : secondActiveStep != null
    ? `Generating steps ${activeStep} and ${secondActiveStep} in parallel`
    : `Generating step ${activeStep} of 4`;

  return (
    <div
      className={`step-stepper${allDone ? ' step-stepper--done' : ''}`}
      role="status"
      aria-label={ariaLabel}
    >
      {STEPS.map((label, i) => {
        const n = i + 1;
        const isActive = !allDone && (n === activeStep || n === secondActiveStep);
        const isCompleted = allDone || n < firstCompleted;
        const state: StepState = isCompleted ? 'completed' : isActive ? 'active' : 'pending';
        const connectorState: StepState = allDone || n < firstCompleted ? 'completed' : 'pending';
        return (
          <div key={label} className="step-item">
            <div className={`step-dot step-dot--${state}`} aria-hidden="true">
              {state === 'completed' ? '✓' : n}
            </div>
            <span className={`step-label step-label--${state}`}>{label}</span>
            {i < STEPS.length - 1 && (
              <div className={`step-connector step-connector--${connectorState}`} aria-hidden="true" />
            )}
          </div>
        );
      })}
    </div>
  );
});
