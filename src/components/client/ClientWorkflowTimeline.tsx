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
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2
              id="client-workflow-title"
              className="text-sm font-semibold text-slate-800"
            >
              Service workflow
            </h2>
            <p className="text-xs text-slate-500">
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
            className="grid min-w-[980px] grid-cols-7 items-start"
          >
            {steps.map((step, index) => {
              const isCurrent =
                !step.complete && index === currentStepIndex;
              const isUpcoming = !step.complete && !isCurrent;

              return (
                <li
                  key={step.label}
                  aria-current={isCurrent ? "step" : undefined}
                  className="relative flex min-w-0 flex-col items-center px-2 text-center"
                >
                  {index < steps.length - 1 && (
                    <span
                      aria-hidden="true"
                      className={`absolute left-1/2 top-[17px] h-0.5 w-full ${
                        step.complete ? "bg-emerald-600" : "bg-slate-200"
                      }`}
                    />
                  )}
                  <span
                    className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-medium ${
                      step.complete
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : isCurrent
                          ? "border-violet-500 bg-gradient-to-br from-orange-400 to-violet-600 text-white shadow-[0_0_0_5px_rgba(168,85,247,0.12)]"
                          : "border-slate-200 bg-white text-slate-500"
                    }`}
                  >
                    {step.complete ? (
                      <Check className="h-4 w-4" aria-hidden="true" />
                    ) : isCurrent ? (
                      <Clock3 className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span
                    className={`mt-2 flex h-10 max-w-[120px] items-start justify-center text-xs font-medium leading-4 ${
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
