"use client"

import { usePathname, useRouter } from "next/navigation"
import type { RoleName } from "@/lib/types"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const roles: { value: RoleName; label: string }[] = [
  { value: "advertiser", label: "Advertiser" },
  { value: "publisher", label: "Publisher" },
  { value: "user", label: "User" },
]

export function RoleSwitcher({ currentRole }: { currentRole?: RoleName }) {
  const pathname = usePathname()
  const router = useRouter()

  // Only appear on role routes or landing page
  const isRoleRoute = /^\/(advertiser|publisher|user)(\/|$)/.test(pathname)
  const isLandingPage = pathname === "/"

  if (!isRoleRoute && !isLandingPage) return null

  const activeRole =
    currentRole ||
    (isRoleRoute ? (pathname.split("/")[1] as RoleName) : undefined)

  const activeLabel = activeRole
    ? roles.find((r) => r.value === activeRole)?.label
    : "Roles"

  return (
    <Select value={activeRole}>
      <SelectTrigger className="h-8 cursor-pointer rounded-lg border border-border/70 bg-transparent px-3 text-sm font-medium transition-colors hover:border-primary/40 hover:text-foreground">
        <SelectValue placeholder="Roles">{activeLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent className="z-[100]">
        {roles.map((role) => (
          <SelectItem
            key={role.value}
            value={role.value}
            className="cursor-pointer"
            onSelect={() => {
              router.push(`/${role.value}`)
            }}
          >
            {role.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
