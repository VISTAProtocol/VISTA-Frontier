import { Loader2 } from "lucide-react"

export function LoadingScreen({
  title = "Loading dashboard",
  description = "Pulling the latest protocol state and wallet context.",
}: {
  title?: string
  description?: string
}) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div className="rounded-2xl border border-border/70 bg-card p-4 text-primary shadow-sm">
          <Loader2 className="size-6 animate-spin" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  )
}
