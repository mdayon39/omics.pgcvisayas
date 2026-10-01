"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getChargeSlipsByClientId } from "@/services/chargeSlipService";
import { convertToDate } from "@/lib/convert";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";

interface ChargeSlipButtonProps {
  clientId: string;
  projectIds: string[];
}

export function ChargeSlipButton({ clientId, projectIds }: ChargeSlipButtonProps) {
  const router = useRouter();

  // Fetch charge slips related to this client
  const { data: chargeSlips = [], isLoading } = useQuery({
    queryKey: ["chargeSlips", clientId],
    queryFn: () => getChargeSlipsByClientId(clientId),
    staleTime: 1000 * 60 * 5, // 5 minutes cache
  });

  const count = chargeSlips.length;
  const primaryPid = projectIds[0];

  const handleCreateNew = () => {
    if (!clientId || !primaryPid) return;
    router.push(`/admin/charge-slips/new?clientId=${encodeURIComponent(clientId)}&projectId=${encodeURIComponent(primaryPid)}`);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={(event) => {
              event.stopPropagation();
              handleCreateNew();
            }}
            variant="outline"
            size="sm"
            className="whitespace-nowrap h-7 w-[100px] px-2 text-[9px] bg-white hover:bg-slate-50 border-blue-200 text-blue-700 font-semibold flex items-center justify-between"
            data-stop-row-click="true"
          >
            <span>Charge Slip</span>
            <div className="flex items-center justify-center w-6">
              {isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : count > 0 ? (
                <span className="flex items-center justify-center bg-blue-500 text-white rounded-full h-5 min-w-[20px] px-1 text-[10px] font-bold shadow-sm">
                  {count}
                </span>
              ) : null}
            </div>
          </Button>
        </TooltipTrigger>
        
        {count > 0 && (
          <TooltipContent className="p-0 border-none shadow-lg bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
            <div className="rounded-md border bg-popover text-popover-foreground shadow-md min-w-[220px]">
              <div className="px-3 py-2 border-b bg-muted/50 rounded-t-md">
                <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">
                  Existing Charge Slips ({count})
                </h4>
              </div>
              <div className="py-1 max-h-[200px] overflow-y-auto">
                {chargeSlips.map((cs) => {
                  const dateObj = convertToDate(cs.dateIssued);
                  return (
                    <div
                      key={cs.id || cs.chargeSlipNumber}
                      className="px-3 py-2 hover:bg-muted/50 transition-colors border-b last:border-0 border-slate-100 cursor-pointer group"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/admin/charge-slips/${cs.chargeSlipNumber}`);
                      }}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-mono text-xs font-semibold text-primary group-hover:underline">
                          {cs.chargeSlipNumber}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {dateObj ? dateObj.toLocaleDateString("en-CA") : "N/A"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-500 truncate max-w-[120px]">
                          {cs.project?.pid || cs.projectId || "No Project"}
                        </span>
                        <span className="text-xs font-medium text-slate-700">
                          ₱{(cs.total || 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}
