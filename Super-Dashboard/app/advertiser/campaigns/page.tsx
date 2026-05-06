"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useAccount } from "wagmi"

import { EmptyState } from "@/components/empty-state"
import { LoadingScreen } from "@/components/loading-screen"
import { PageHeader } from "@/components/page-header"
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
import type { CampaignListItem } from "@/lib/types"
import { cn, formatDateTime, formatUsdc } from "@/lib/utils"

export default function AdvertiserCampaignsPage() {
  const { address } = useAccount()
  const [campaigns, setCampaigns] = useState<CampaignListItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!address) return

    let cancelled = false

    async function load() {
      const result = await fetchJson<CampaignListItem[]>(`/api/campaigns?advertiserWallet=${address}`)
      if (!cancelled) {
        setCampaigns(result)
        setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [address])

  if (loading) {
    return <LoadingScreen description="Loading every advertiser campaign tied to this wallet." />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Link className={buttonVariants({ size: "lg" })} href="/advertiser/campaigns/new">
            Deposit & launch
          </Link>
        }
        eyebrow="Campaign registry"
        title="All campaigns"
        description="Review running and completed campaign budgets, viewer counts, and detailed analytics."
      />

      {campaigns.length === 0 ? (
        <EmptyState
          title="Your campaign list is empty"
          description="Once a campaign is launched, it will appear here with live status and budget usage."
          action={
            <Link className={cn(buttonVariants())} href="/advertiser/campaigns/new">
              Launch a campaign
            </Link>
          }
        />
      ) : (
        <div className="rounded-[28px] border border-border/70 bg-card/90 p-4 sm:p-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Budget remaining</TableHead>
                <TableHead>Total viewers</TableHead>
                <TableHead>Total seconds</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((campaign) => (
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
