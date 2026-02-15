import { Badge } from "@/components/ui/badge";
import type { ApplicationStatus } from "@/lib/types/app";

const statusClassMap: Record<ApplicationStatus, string> = {
  draft: "border-zinc-300/80 bg-zinc-50 text-zinc-700",
  submitted: "border-sky-300/80 bg-sky-50 text-sky-700",
  reviewed: "border-indigo-300/80 bg-indigo-50 text-indigo-700",
  approved: "border-emerald-300/80 bg-emerald-50 text-emerald-700",
  rejected: "border-rose-300/80 bg-rose-50 text-rose-700"
};

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <Badge variant="outline" className={`${statusClassMap[status]} font-semibold`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}
