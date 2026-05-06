"use client";

import { CheckCircle2, Code2, Copy, ExternalLink, Key, LayoutGrid, Server, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAccount } from "wagmi";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchJson } from "@/lib/http";
import type { PublisherRecord } from "@/lib/types";

export default function PublisherOnboardingPage() {
  const { address } = useAccount();
  const [platformName, setPlatformName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<PublisherRecord | null>(null);
  const [activeTab, setActiveTab] = useState<"integration" | "campaigns">("integration");
  const [campaigns, setCampaigns] = useState<any[]>([]);

  // Check if already registered
  useEffect(() => {
    if (!address) return;
    fetchJson<any>(`/api/roles/status?wallet=${address}&role=publisher`)
      .then((res) => {
        if (res.registered && res.record) {
          setResult(res.record as PublisherRecord);
        }
      })
      .catch(() => {});
  }, [address]);

  // Fetch campaigns
  useEffect(() => {
    if (result && address) {
      fetch(`/api/campaigns/active?userWallet=${address}`)
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setCampaigns(data);
          else if (data.campaigns) setCampaigns(data.campaigns);
        })
        .catch(() => {});
    }
  }, [result, address]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address) return;

    try {
      setIsSubmitting(true);
      const record = await fetchJson<PublisherRecord>("/api/publishers", {
        method: "POST",
        body: JSON.stringify({
          walletAddress: address,
          platformName,
        }),
      });
      setResult(record);
      toast.success("Publisher profile created.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to create publisher profile.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard.");
  }

  if (result) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <PageHeader
          eyebrow="Publisher Profile Active"
          title={`Welcome to Vista, ${result.platform_name}!`}
          description="Your platform is now ready to monetize. Complete the integration below to start earning."
        />

        {/* Custom Tabs */}
        <div className="flex border-b border-border/50 overflow-x-auto">
          <button
            onClick={() => setActiveTab("integration")}
            className={`flex items-center gap-2 px-6 py-3 font-medium transition-colors whitespace-nowrap ${
              activeTab === "integration"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Code2 className="size-4" />
            Integration Guide
          </button>
          <button
            onClick={() => setActiveTab("campaigns")}
            className={`flex items-center gap-2 px-6 py-3 font-medium transition-colors whitespace-nowrap ${
              activeTab === "campaigns"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="size-4" />
            Available Campaigns
          </button>
        </div>

        {activeTab === "integration" && (
          <div className="grid gap-6 xl:grid-cols-2">
            {/* API Key Card */}
            <Card className="border-primary/20 bg-primary/5 shadow-md">
              <CardHeader>
                <div className="flex items-center gap-2 text-primary mb-1">
                  <Key className="size-5" />
                  <span className="font-semibold text-sm uppercase tracking-wider">Authentication</span>
                </div>
                <CardTitle className="text-2xl">Your Secret API Key</CardTitle>
                <CardDescription className="text-base">
                  This key authenticates your platform with the Vista Oracle. Never expose this key to the client side.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-2xl border border-primary/20 bg-background/90 p-5 shadow-inner">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <code className="text-sm sm:text-base font-mono break-all text-primary">{result.api_key}</code>
                    <Button onClick={() => copy(result.api_key)} size="sm" className="shrink-0 w-full sm:w-auto">
                      <Copy className="size-4 mr-2" />
                      Copy Key
                    </Button>
                  </div>
                </div>
                <div className="space-y-4">
                  <h4 className="font-medium flex items-center gap-2">
                    <Server className="size-4" /> Usage Instructions
                  </h4>
                  <ul className="space-y-3 text-sm text-muted-foreground">
                    <li className="flex gap-3"><CheckCircle2 className="size-4 text-green-500 shrink-0 mt-0.5" /> Set this as <code className="bg-muted px-1.5 py-0.5 rounded text-xs text-foreground">VISTA_API_KEY</code> in your backend environment variables.</li>
                    <li className="flex gap-3"><CheckCircle2 className="size-4 text-green-500 shrink-0 mt-0.5" /> Use it to sign payloads or securely request ad inventory on behalf of your users.</li>
                    <li className="flex gap-3"><CheckCircle2 className="size-4 text-green-500 shrink-0 mt-0.5" /> Do NOT bundle this key in your React/Vue/Next.js frontend code.</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Integration Card */}
            <Card className="shadow-md">
              <CardHeader>
                <div className="flex items-center gap-2 text-blue-500 mb-1">
                  <Sparkles className="size-5" />
                  <span className="font-semibold text-sm uppercase tracking-wider">Quick Start</span>
                </div>
                <CardTitle className="text-2xl">SDK Integration</CardTitle>
                <CardDescription className="text-base">
                  Add the Vista Protocol SDK to your app in just three simple steps.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">1. Install the SDK package</Label>
                  <pre className="rounded-xl border border-border/50 bg-muted/30 p-4 text-sm font-mono overflow-x-auto text-foreground">npm install @vista-protocol/sdk</pre>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">2. Initialize the SDK</Label>
                  <pre className="rounded-xl border border-border/50 bg-muted/30 p-4 text-sm font-mono overflow-x-auto whitespace-pre-wrap text-foreground">
{`import { VistaSDK } from '@vista-protocol/sdk';

// Initialize with your publisher wallet
const vista = new VistaSDK({
  publisherWallet: '${address}',
  oracleUrl: 'https://vista-oracle.example.com'
});`}
                  </pre>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">3. Attach to an Ad Zone</Label>
                  <pre className="rounded-xl border border-border/50 bg-muted/30 p-4 text-sm font-mono overflow-x-auto whitespace-pre-wrap text-foreground">
{`// When an ad enters the viewport
vista.startTracking({
  campaignId: 'campaign-123',
  userWallet: user.address,
  zoneId: 'main-feed-1'
});`}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "campaigns" && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold">Available Campaigns</h3>
                <p className="text-sm text-muted-foreground">Browse active campaigns that you can host on your platform right now.</p>
              </div>
              <Button onClick={() => window.location.href = "/publisher/dashboard"}>
                Go to Publisher Dashboard
                <ExternalLink className="size-4 ml-2" />
              </Button>
            </div>
            
            {campaigns.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-12 text-center bg-muted/10">
                <p className="text-muted-foreground">No active campaigns available at the moment.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {campaigns.map((campaign, i) => (
                  <Card key={i} className="flex flex-col overflow-hidden hover:border-primary/50 transition-colors shadow-sm group">
                    <div className="aspect-video w-full bg-muted border-b relative overflow-hidden">
                      {/* Placeholder for creative */}
                      <img src={campaign.creative_url} alt="Creative" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onError={(e) => { e.currentTarget.src = 'https://placehold.co/600x400?text=Ad+Creative' }} />
                      <div className="absolute top-2 right-2 bg-background/90 backdrop-blur-sm text-xs px-2 py-1 rounded-md font-medium border shadow-sm">
                        {campaign.chain}
                      </div>
                    </div>
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="text-base line-clamp-1">{campaign.title}</CardTitle>
                      <CardDescription className="line-clamp-1 break-all text-xs font-mono">{campaign.campaign_id_onchain}</CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 mt-auto">
                      <div className="flex justify-between items-center text-sm py-1 border-b border-border/50">
                        <span className="text-muted-foreground">Rate:</span>
                        <span className="font-semibold">{campaign.rate_per_second} USDC/s</span>
                      </div>
                      <div className="flex justify-between items-center text-sm pt-2">
                        <span className="text-muted-foreground">Budget Left:</span>
                        <span className="font-medium text-primary">{campaign.remaining_budget} USDC</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Publisher onboarding"
        title="Activate your monetization surface"
        description="Register your platform wallet, mint an API key, and wire VISTA zones into your placement inventory."
      />

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardContent className="p-6">
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="platformName">Platform name</Label>
                <Input
                  id="platformName"
                  onChange={(event) => setPlatformName(event.target.value)}
                  placeholder="BaseQuest"
                  required
                  value={platformName}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="walletAddress">Wallet address</Label>
                <Input id="walletAddress" readOnly value={address ?? ""} />
              </div>
              <Button disabled={isSubmitting} type="submit" className="w-full">
                {isSubmitting
                  ? "Generating API key..."
                  : "Create publisher profile"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What you get</CardTitle>
            <CardDescription>
              Once created, your publisher profile unlocks:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p className="flex items-start gap-2"><CheckCircle2 className="size-4 text-green-500 mt-0.5" /> A unique API key to securely authenticate your platform.</p>
            <p className="flex items-start gap-2"><CheckCircle2 className="size-4 text-green-500 mt-0.5" /> Full revenue analytics broken down by campaign and timeslot.</p>
            <p className="flex items-start gap-2"><CheckCircle2 className="size-4 text-green-500 mt-0.5" /> Realtime session visibility for active ad inventory.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
