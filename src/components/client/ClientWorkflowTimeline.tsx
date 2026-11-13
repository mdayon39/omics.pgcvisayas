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
      aria-labelledby="client-workflow-title"
      aria-busy={loading}
      className="mx-auto w-full max-w-5xl px-3 pt-3"
    >
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2
              id="client-workflow-title"
              className="text-sm font-semibold leading-5 text-slate-800"
            >
              Service workflow
            </h2>
            <p className="text-xs leading-5 text-slate-500">
              Track the main stages of your service request.
            </p>
          </div>
          {loading && (
            <span className="shrink-0 text-xs text-slate-500" role="status">
              Updating progress...
            </span>
          )}
        </div>

        <div className="overflow-x-auto pb-1">
          <ol
            aria-label="Service request progress"
            className="grid min-w-[660px] grid-cols-7 items-start"
          >
            {steps.map((step, index) => {
              const isCurrent =
                !step.complete && index === currentStepIndex;
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
                      className={`absolute left-1/2 top-[11px] h-0.5 w-full ${
                        step.complete ? "bg-emerald-600" : "bg-slate-200"
                      }`}
                    />
                  )}
                  <span
                    className={`relative z-10 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border text-[10px] font-medium ${
                      step.complete
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : isCurrent
                          ? "border-violet-500 bg-gradient-to-br from-orange-400 to-violet-600 text-white shadow-[0_0_0_5px_rgba(168,85,247,0.12)]"
                          : "border-slate-200 bg-white text-slate-500"
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
                    className={`mt-2 flex min-h-8 max-w-[88px] items-start justify-center text-center text-[11px] font-medium leading-[13px] ${
                      step.complete || isCurrent
                        ? "text-slate-800"
                        : "text-slate-500"
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
      </div>
    </section>
  );
}
