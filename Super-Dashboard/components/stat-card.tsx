import type { LucideIcon } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn, formatCompactNumber, formatUsdc } from "@/lib/utils"

export function StatCard({
  title,
  value,
  hint,
  icon: Icon,
  format = "number",
  className,
}: {
  title: string
  value: number | string
  hint?: string
  icon: LucideIcon
  format?: "number" | "usdc" | "compact"
  className?: string
}) {
  const displayValue =
    typeof value === "string"
      ? value
      : format === "usdc"
        ? `${formatUsdc(value)} USDC`
        : format === "compact"
          ? formatCompactNumber(value)
          : value.toLocaleString("en-US")

  return (
    <Card className={cn("bg-card/90", className)}>
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between gap-4">
          <CardTitle>{title}</CardTitle>
          <div className="rounded-xl border border-border/70 bg-muted/60 p-2 text-primary">
            <Icon className="size-4" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-2xl font-semibold tracking-tight sm:text-3xl">{displayValue}</p>
        {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  )
}
