"use client"

import Link from "next/link"
import { ReceiptText } from "lucide-react"
import { useEffect, useState } from "react"
import { useAccount } from "wagmi"

import { LoadingScreen } from "@/components/loading-screen"
import { PageHeader } from "@/components/page-header"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { fetchJson } from "@/lib/http"
import type { UserHistoryData } from "@/lib/types"
import { cn, formatDateTime, formatUsdc, truncateHash } from "@/lib/utils"

export default function UserHistoryPage() {
  const { address } = useAccount()
  const [data, setData] = useState<UserHistoryData | null>(null)

  useEffect(() => {
    if (!address) return

    let cancelled = false

    async function load() {
      const result = await fetchJson<UserHistoryData>(`/api/history/user?wallet=${address}`)
      if (!cancelled) {
        setData(result)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [address])

  if (!data) {
    return <LoadingScreen description="Loading completed sessions and on-chain receipt history." />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="User history"
        title="Session history and receipts"
        description="Review every completed session, campaign title, and receipt link tied to your wallet."
      />

      <div className="rounded-[28px] border border-border/70 bg-card/90 p-4 sm:p-6">
        <div className="mb-4">
          <h2 className="text-xl font-semibold tracking-tight">Completed sessions</h2>
          <p className="text-sm text-muted-foreground">Each row represents a verified ad session.</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Earned</TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead className="text-right">Receipt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.sessions.map((session) => (
              <TableRow key={`${session.date}-${session.campaignTitle}`}>
                <TableCell>{formatDateTime(session.date)}</TableCell>
                <TableCell>{session.duration}s</TableCell>
                <TableCell>{formatUsdc(session.earned)}</TableCell>
                <TableCell>{session.campaignTitle}</TableCell>
                <TableCell className="text-right">
                  {session.receiptUrl ? (
                    <Link className={buttonVariants({ size: "sm", variant: "outline" })} href={session.receiptUrl} target="_blank">
                      View on Explorer
                    </Link>
                  ) : (
                    <span className="text-sm text-muted-foreground">Pending</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">On-chain receipts</h2>
          <p className="text-sm text-muted-foreground">NFT-style proof cards for completed sessions.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.receipts.map((receipt) => (
            <Card key={receipt.tokenId}>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>{truncateHash(receipt.sessionIdOnchain)}</CardTitle>
                    <CardDescription>{formatDateTime(receipt.mintedAt)}</CardDescription>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-muted/60 p-2 text-primary">
                    <ReceiptText className="size-4" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">USDC earned</span>
                  <span className="font-medium">{formatUsdc(receipt.usdcEarned)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Seconds verified</span>
                  <span className="font-medium">{receipt.secondsVerified}s</span>
                </div>
                <Link className={cn(buttonVariants({ size: "sm" }), "w-full")} href={receipt.explorerUrl} target="_blank">
                  View on Explorer
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
