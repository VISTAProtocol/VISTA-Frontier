import { cn } from "@/lib/utils"

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string
  title: string
  description: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-[28px] border border-border/80 bg-card/90 p-6 shadow-sm shadow-black/5 sm:p-8 lg:flex-row lg:items-end lg:justify-between",
        className
      )}
    >
      <div className="max-w-2xl space-y-3">
        {eyebrow ? (
          <p className="text-xs font-medium uppercase tracking-[0.32em] text-primary">{eyebrow}</p>
        ) : null}
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h1>
          <p className="text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-3">{actions}</div> : null}
    </div>
  )
}
