"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { RoleGuard } from "@/components/role-guard";
import { RoleSwitcher } from "@/components/role-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { buttonVariants } from "@/components/ui/button";
import { roleMeta, roleNavigation } from "@/lib/constants";
import type { RoleName } from "@/lib/types";
import { cn } from "@/lib/utils";

export function DashboardLayout({
  role,
  children,
}: {
  role: RoleName;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const meta = roleMeta[role];
  const isOnboarding = pathname === meta.onboardingPath;
  const isEntryRoute = pathname === `/${role}`;

  return (
    <RoleGuard
      redirectIfRegisteredTo={isOnboarding ? meta.dashboardPath : undefined}
      requireRegistration={!isOnboarding && !isEntryRoute}
      role={role}
    >
      <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(57,185,118,0.16),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(90,102,241,0.12),_transparent_28%)]">
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,_transparent,_rgba(255,255,255,0.7))] dark:bg-[linear-gradient(to_bottom,_transparent,_rgba(10,12,16,0.65))]" />
        <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-4 pb-8 pt-4 sm:px-6 lg:px-8">
          <header className="mb-6 flex flex-col gap-4 rounded-[28px] border border-border/70 bg-background/80 p-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Link href="/" className="shrink-0">
                <BrandMark compact />
              </Link>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <RoleSwitcher currentRole={role} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {meta.description}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ThemeToggle />
              <WalletConnectButton />
            </div>
          </header>

          <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
            <aside className="h-fit rounded-[28px] border border-border/70 bg-card/85 p-3 shadow-sm shadow-black/5">
              <nav className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
                {roleNavigation[role].map((item) => {
                  const isActive =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);

                  return (
                    <Link
                      key={item.href}
                      className={cn(
                        buttonVariants({
                          variant: isActive ? "default" : "ghost",
                          size: "lg",
                        }),
                        "justify-start rounded-2xl px-4",
                      )}
                      href={item.href}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </aside>

            <main className="space-y-6">{children}</main>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
