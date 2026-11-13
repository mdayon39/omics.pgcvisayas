import { Check, Clock3 } from "lucide-react";

interface ClientWorkflowTimelineProps {
  steps: Array<{
    label: string;
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
      className="mx-auto w-full max-w-6xl px-4 pb-0.5 pt-2"
    >
      {loading && (
        <span className="sr-only" role="status">
          Updating service workflow progress
        </span>
      )}
      <div className="overflow-x-auto pb-1">
        <ol
          aria-label="Service request progress"
          className="grid min-w-[620px] grid-cols-7 items-start"
        >
          {steps.map((step, index) => {
            const isCurrent = !step.complete && index === currentStepIndex;
            const isUpcoming = !step.complete && !isCurrent;

            return (
              <li
                key={step.label}
                aria-current={isCurrent ? "step" : undefined}
                className="relative flex min-w-0 flex-col items-center px-1 text-center"
              >
                {index < steps.length - 1 && (
                  <span
                    aria-hidden="true"
                    className={`absolute left-1/2 top-[10px] h-0.5 w-full ${
                      step.complete ? "bg-emerald-600" : "bg-slate-200"
                    }`}
                  />
                )}
                <span
                  className={`relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[9px] font-medium ${
                    step.complete
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : isCurrent
                        ? "border-violet-500 bg-gradient-to-br from-orange-400 to-violet-600 text-white shadow-[0_0_0_5px_rgba(168,85,247,0.12)]"
                        : "border-slate-300 bg-white text-slate-600"
                  }`}
                >
                  {step.complete ? (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : isCurrent ? (
                    <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span
                  className={`mt-1.5 flex min-h-8 max-w-[96px] items-start justify-center text-center text-[11px] font-medium leading-[13px] ${
                    step.complete || isCurrent
                      ? "text-slate-800"
                      : "text-slate-600"
                  }`}
                >
                  {step.label}
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
