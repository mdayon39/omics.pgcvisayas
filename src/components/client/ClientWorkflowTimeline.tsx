import { Check, Clock3 } from "lucide-react";

interface ClientWorkflowTimelineProps {
  steps: Array<{
    completedLabel: string;
    pendingLabel: string;
    complete: boolean;
  }>;
  loading?: boolean;
}

export default function ClientWorkflowTimeline({
  steps,
  loading = false,
}: ClientWorkflowTimelineProps) {
  const currentStepIndex = steps.findIndex((step) => !step.complete);

  return (
    <section
      aria-label="Service workflow"
      aria-busy={loading}
      className="mx-auto w-full max-w-6xl px-4 pb-0.5 pt-5"
    >
      {loading && (
        <span className="sr-only" role="status">
          Updating service workflow progress
        </span>
      )}
      <div className="overflow-x-auto pb-1">
        <ol
          aria-label="Service request progress"
          className="grid min-w-[560px] grid-cols-7 items-start"
        >
          {steps.map((step, index) => {
            const isCurrent = !step.complete && index === currentStepIndex;
            const isUpcoming = !step.complete && !isCurrent;

            return (
              <li
                key={step.completedLabel}
                aria-current={isCurrent ? "step" : undefined}
                className="relative flex min-w-0 flex-col items-center px-1 text-center"
              >
                {index < steps.length - 1 && (
                  <span
                    aria-hidden="true"
                    className={`absolute left-1/2 top-[8px] h-0.5 w-full ${
                      step.complete ? "bg-emerald-600" : "bg-slate-200"
                    }`}
                  />
                )}
                <span
                  className={`relative z-10 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[8px] font-medium ${
                    step.complete
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : isCurrent
                        ? "border-violet-500 bg-gradient-to-br from-orange-400 to-violet-600 text-white shadow-[0_0_0_5px_rgba(168,85,247,0.12)]"
                        : "border-slate-300 bg-white text-slate-600"
                  }`}
                >
                  {step.complete ? (
                    <Check className="h-3 w-3" aria-hidden="true" />
                  ) : isCurrent ? (
                    <Clock3 className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span
                  className={`mt-1 flex min-h-7 max-w-[84px] items-start justify-center text-center text-[10px] font-medium leading-3 ${
                    step.complete || isCurrent
                      ? "text-slate-800"
                      : "text-slate-600"
                  }`}
                >
                  {step.complete ? step.completedLabel : step.pendingLabel}
                </span>
                <span className="sr-only">
                  {step.complete
                    ? "Completed"
                    : isCurrent
                      ? "In progress"
                      : isUpcoming
                        ? "Upcoming"
                        : ""}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
