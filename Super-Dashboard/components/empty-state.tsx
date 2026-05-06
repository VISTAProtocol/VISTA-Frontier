import { Sparkles } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <Card className="border-dashed bg-muted/30">
      <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center">
        <div className="rounded-2xl border border-border/70 bg-background p-3 text-primary">
          <Sparkles className="size-5" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-medium">{title}</h3>
          <p className="max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {action}
      </CardContent>
    </Card>
  )
}
