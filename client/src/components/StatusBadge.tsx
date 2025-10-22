import { Badge } from "@/components/ui/badge";

type Status = "ACTIVE" | "PAUSED" | "DRAFT" | "OPEN" | "CLOSED" | "CHARGED" | "FAILED";

interface StatusBadgeProps {
  status: Status;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const variants: Record<Status, { variant: "default" | "secondary" | "destructive"; label: string }> = {
    ACTIVE: { variant: "default", label: "Active" },
    OPEN: { variant: "default", label: "Open" },
    CHARGED: { variant: "default", label: "Charged" },
    PAUSED: { variant: "secondary", label: "Paused" },
    DRAFT: { variant: "secondary", label: "Draft" },
    CLOSED: { variant: "secondary", label: "Closed" },
    FAILED: { variant: "destructive", label: "Failed" },
  };

  const { variant, label } = variants[status];

  return (
    <Badge variant={variant} className="rounded-full" data-testid={`badge-status-${status.toLowerCase()}`}>
      {label}
    </Badge>
  );
}
