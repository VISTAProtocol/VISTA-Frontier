import Image from "next/image"
import { cn } from "@/lib/utils"

export function BrandMark({
  className,
  compact = false,
}: {
  className?: string
  compact?: boolean
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="relative flex size-10 items-center justify-center overflow-hidden rounded-xl border border-white/10 shadow-sm transition-transform hover:scale-105 active:scale-95">
        <Image
          src="/logo/vista.png"
          alt="VISTA Logo"
          fill
          className="object-contain p-1"
          priority
        />
      </div>
      {!compact ? (
        <div className="space-y-0.5">
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">VISTA Protocol</p>
          <p className="text-base font-semibold tracking-tight text-foreground">Attention that settles in USDC</p>
        </div>
      ) : null}
    </div>
  )
}
