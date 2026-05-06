"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useAccount } from "wagmi"

import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { fetchJson } from "@/lib/http"

export default function AdvertiserOnboardingPage() {
  const { address } = useAccount()
  const [companyName, setCompanyName] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!address) return

    try {
      setIsSubmitting(true)
      await fetchJson("/api/advertisers", {
        method: "POST",
        body: JSON.stringify({
          walletAddress: address,
          companyName,
        }),
      })
      toast.success("Advertiser profile created.")
      window.location.href = "/advertiser/dashboard"
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create advertiser profile.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Advertiser onboarding"
        title="Register your campaign wallet"
        description="Connect a company identity to this wallet so you can deposit campaign budgets and track verified attention."
      />
      <Card className="max-w-2xl">
        <CardContent className="p-6">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="companyName">Company name</Label>
              <Input
                id="companyName"
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="Vista Labs"
                required
                value={companyName}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="walletAddress">Wallet address</Label>
              <Input id="walletAddress" readOnly value={address ?? ""} />
            </div>
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? "Creating profile..." : "Create advertiser profile"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
