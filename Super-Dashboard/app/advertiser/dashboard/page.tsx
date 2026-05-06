"use client"

import Link from "next/link"
import { BarChart3, Coins, Eye, MousePointerClick } from "lucide-react"
import { useEffect, useState } from "react"
import { useAccount } from "wagmi"

import { EmptyState } from "@/components/empty-state"
import { LoadingScreen } from "@/components/loading-screen"
import { MetricChartCard } from "@/components/metric-chart-card"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { fetchJson } from "@/lib/http"
import type { AdvertiserDashboardData } from "@/lib/types"
import { cn, formatDateTime, formatUsdc } from "@/lib/utils"

export default function AdvertiserDashboardPage() {
  const { address } = useAccount()
  const [data, setData] = useState<AdvertiserDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!address) return

    let cancelled = false
    setError(null)

    async function load() {
      try {
        const result = await fetchJson<AdvertiserDashboardData>(`/api/dashboard/advertiser?wallet=${address}`)
        if (!cancelled) {
          setData(result)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load dashboard.")
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [address])

  if (error) {
    return <LoadingScreen description={`Error: ${error}`} />
  }

  if (loading || !data) {
    return <LoadingScreen description="Preparing advertiser spend, budget, and verification metrics." />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Link className={buttonVariants({ size: "lg" })} href="/advertiser/campaigns/new">
            Launch campaign
          </Link>
        }
        eyebrow="Advertiser workspace"
        title="Campaign command center"
        description="Monitor budget usage, live viewer-seconds, and verified campaign performance from a single wallet."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total campaigns active"
          value={data.stats.activeCampaigns}
          icon={BarChart3}
        />
        <StatCard
          title="Total USDC spent"
          value={data.stats.totalUsdcSpent}
          format="usdc"
          icon={Coins}
        />
        <StatCard
          title="Verified viewer-seconds"
          value={data.stats.totalVerifiedViewerSeconds}
          icon={Eye}
        />
        <StatCard
          title="Average conversion rate"
          value={data.stats.averageConversionRate}
          icon={MousePointerClick}
        />
      </div>

      <MetricChartCard
        data={data.viewersPerDay}
        description="Daily verified viewers and spend trend across all advertiser campaigns."
        primaryLabel="Viewers"
        secondaryLabel="USDC spent"
        title="Viewer momentum"
        valueFormatter={(value) => value.toFixed(2)}
      />

      {data.campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns launched yet"
          description="Deposit your first campaign budget to see performance metrics appear here."
          action={
            <Link className={cn(buttonVariants())} href="/advertiser/campaigns/new">
              Launch a campaign
            </Link>
          }
        />
      ) : (
        <div className="rounded-[28px] border border-border/70 bg-card/90 p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Active portfolio</h2>
              <p className="text-sm text-muted-foreground">Quick view across campaign health and budget burn.</p>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Budget</TableHead>
                <TableHead>Total viewers</TableHead>
                <TableHead>Total seconds</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.campaigns.map((campaign) => (
                <TableRow key={campaign.id}>
                  <TableCell className="font-medium">{campaign.title}</TableCell>
                  <TableCell>
                    <Badge variant={campaign.status === "active" ? "default" : "outline"}>
                      {campaign.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {formatUsdc(campaign.remainingBudget)} / {formatUsdc(campaign.totalBudget)}
                  </TableCell>
                  <TableCell>{campaign.totalViewers}</TableCell>
                  <TableCell>{campaign.totalSecondsVerified}</TableCell>
                  <TableCell>{formatDateTime(campaign.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Link
                      className={buttonVariants({ size: "sm", variant: "outline" })}
                      href={`/advertiser/campaigns/${campaign.id}`}
                    >
                      View detail
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
