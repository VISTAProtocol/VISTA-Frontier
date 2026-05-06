"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { parseUnits } from "viem";
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { readContract, simulateContract, waitForTransactionReceipt } from "wagmi/actions";

import { MetricChartCard } from "@/components/metric-chart-card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { fetchJson } from "@/lib/http";
import {
  contractAddresses,
  erc20Abi,
  hasContractConfig,
  vistaEscrowAbi,
} from "@/lib/contracts";
import {
  locationOptions,
  preferenceLabels,
  preferenceOptions,
} from "@/lib/constants";
import type { CampaignRecord, PreferenceOption } from "@/lib/types";
import { buildExplorerUrl, bytes32FromSeed, cn, formatUsdc } from "@/lib/utils";
import { baseSepoliaNetwork, wagmiConfig } from "@/lib/wagmi";

const VISTA_RATE = 0.000072; // USDC per viewer per second (fixed by VISTA Protocol)

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

type UploadState = "idle" | "uploading" | "extracting" | "success" | "error";

interface UploadResult {
  publicUrl: string;
  filePath: string;
  mediaType: "image" | "video";
  mimeType: string;
  duration: number | null;
  size: number;
}

function extractVideoDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = url;
    video.onloadedmetadata = () => {
      resolve(Math.round(video.duration));
      video.remove();
    };
    video.onerror = () => {
      console.warn(
        "[Upload] Could not extract video duration, defaulting to 30s",
      );
      resolve(30);
      video.remove();
    };
  });
}

function MultiSelect<T extends string>({
  disabled,
  labels,
  onChange,
  options,
  placeholder,
  value,
}: {
  disabled?: boolean;
  labels: Record<T, string>;
  onChange: (value: T[]) => void;
  options: readonly T[];
  placeholder: string;
  value: T[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function toggle(option: T) {
    onChange(
      value.includes(option)
        ? value.filter((v) => v !== option)
        : [...value, option],
    );
  }

  const displayText =
    value.length === 0
      ? placeholder
      : value.length <= 3
        ? value.map((v) => labels[v]).join(", ")
        : `${value
            .slice(0, 2)
            .map((v) => labels[v])
            .join(", ")} +${value.length - 2} more`;

  return (
    <div className="relative" ref={ref}>
      <button
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <span className={value.length === 0 ? "text-muted-foreground" : ""}>
          {displayText}
        </span>
        <svg
          className={`h-4 w-4 shrink-0 opacity-50 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-background p-1 shadow-md">
          {options.map((option) => (
            <label
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
              key={option}
            >
              <Checkbox
                checked={value.includes(option)}
                onCheckedChange={() => toggle(option)}
              />
              <span>{labels[option]}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const locationLabels = Object.fromEntries(
  locationOptions.map((l) => [l, l]),
) as Record<(typeof locationOptions)[number], string>;

export default function NewCampaignPage() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [title, setTitle] = useState("");
  const [landingUrl, setLandingUrl] = useState("");
  const [displayDuration, setDisplayDuration] = useState("30");
  const [totalBudget, setTotalBudget] = useState("1000");
  const [ageRange, setAgeRange] = useState<[number, number]>([18, 35]);
  const [selectedPreferences, setSelectedPreferences] = useState<
    PreferenceOption[]
  >(["tech", "gaming"]);
  const [selectedLocations, setSelectedLocations] = useState<
    (typeof locationOptions)[number][]
  >(["Jakarta", "Bandung"]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [launchResult, setLaunchResult] = useState<{
    txHash: string;
    campaign: CampaignRecord;
  } | null>(null);

  const [isMinting, setIsMinting] = useState(false);

  async function handleMintUSDC() {
    if (!address) {
      toast.error("Please connect your wallet first.");
      return;
    }
    
    setIsMinting(true);
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, amount: 1000 }),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to mint USDC");
      
      toast.success("Successfully minted 1,000 testnet USDC!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to mint testnet USDC");
    } finally {
      setIsMinting(false);
    }
  }

  // Upload state
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derived media type
  const uploadedMediaType = uploadResult
    ? uploadResult.mimeType.startsWith("video/")
      ? "video"
      : "image"
    : null;

  // Effective duration for rate calculations
  const duration: number | null = useMemo(() => {
    if (uploadState !== "success" || !uploadResult) return null;
    if (uploadedMediaType === "image") return Number(displayDuration) || 30;
    return uploadResult.duration ?? (Number(displayDuration) || null);
  }, [uploadState, uploadResult, uploadedMediaType, displayDuration]);

  const costPer1000 = duration !== null ? VISTA_RATE * 1000 * duration : null;
  const estimatedReach =
    costPer1000 && Number(totalBudget) > 0
      ? Math.floor((Number(totalBudget) / costPer1000) * 1000)
      : null;

  const audienceChart =
    duration !== null
      ? [
          {
            date: "25%",
            label: "At 25%",
            value: VISTA_RATE * 1000 * duration * 0.25,
          },
          {
            date: "50%",
            label: "At 50%",
            value: VISTA_RATE * 1000 * duration * 0.5,
          },
          {
            date: "75%",
            label: "At 75%",
            value: VISTA_RATE * 1000 * duration * 0.75,
          },
          {
            date: "100%",
            label: "Full view",
            value: VISTA_RATE * 1000 * duration,
          },
        ]
      : [
          { date: "15s", label: "At 15s", value: VISTA_RATE * 1000 * 15 },
          { date: "30s", label: "At 30s", value: VISTA_RATE * 1000 * 30 },
          { date: "45s", label: "At 45s", value: VISTA_RATE * 1000 * 45 },
        ];

  async function handleFileSelect(file: File) {
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      toast.error(
        "File type not supported. Use: jpg, png, webp, gif, mp4, mov, webm.",
      );
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File is too large. Maximum size is 100 MB.");
      return;
    }

    setUploadState("uploading");
    setUploadResult(null);
    setUploadError(null);
    setDisplayDuration("30");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/campaigns/upload-creative", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = await res
          .json()
          .catch(() => ({ error: "Upload failed." }));
        throw new Error(body.error ?? "Upload failed.");
      }

      const result: UploadResult = await res.json();
      setUploadResult(result);
      setUploadState("success");

      // Extract duration for videos
      if (result.mediaType === "video") {
        setUploadState("extracting");
        const dur = await extractVideoDuration(result.publicUrl);
        result.duration = dur;
      } else {
        // Image: default duration
        result.duration = 30;
      }

      setUploadResult(result);
      setUploadState("success");
      toast.success("Creative uploaded successfully.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed.";
      setUploadError(message);
      setUploadState("error");
      toast.error(message);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!address) return;
    if (!uploadResult) {
      toast.error("Please upload an ad creative first.");
      return;
    }

    try {
      setIsSubmitting(true);

      // Validate required fields
      if (!title.trim()) {
        throw new Error("Campaign title is required.");
      }
      if (!landingUrl.trim()) {
        throw new Error("Landing page URL is required.");
      }
      try {
        new URL(landingUrl);
      } catch {
        throw new Error("Landing page URL must be a valid URL.");
      }

      const parsedBudget = Number(totalBudget);
      if (!Number.isFinite(parsedBudget) || parsedBudget <= 0) {
        throw new Error("Total budget must be greater than zero.");
      }
      if (duration === null || duration <= 0) {
        throw new Error("Ad duration must be greater than zero.");
      }

      if (chainId !== baseSepoliaNetwork.id) {
        await switchChainAsync({ chainId: baseSepoliaNetwork.id });
      }

      const campaignIdOnchain = bytes32FromSeed(`${title}-${Date.now()}`);
      let txHash: `0x${string}` | null = null;

      if (
        hasContractConfig &&
        contractAddresses.mockUsdc &&
        contractAddresses.vistaEscrow
      ) {
        const amount = parseUnits(totalBudget, 6);

        // Check current allowance first to avoid unnecessary transactions
        // and race conditions
        const [currentAllowance, currentBalance] = await Promise.all([
          readContract(wagmiConfig, {
            abi: erc20Abi,
            address: contractAddresses.mockUsdc,
            functionName: "allowance",
            args: [address, contractAddresses.vistaEscrow],
          }) as Promise<bigint>,
          readContract(wagmiConfig, {
            abi: erc20Abi,
            address: contractAddresses.mockUsdc,
            functionName: "balanceOf",
            args: [address],
          }) as Promise<bigint>,
        ]);

        if (currentBalance < amount) {
          throw new Error(
            `Insufficient mUSDC balance. You have ${formatUsdc(Number(currentBalance) / 1e6)} but need ${formatUsdc(Number(amount) / 1e6)} mUSDC.`
          );
        }

        if (currentAllowance < amount) {
          const approvalHash = await writeContractAsync({
            abi: erc20Abi,
            address: contractAddresses.mockUsdc,
            functionName: "approve",
            args: [contractAddresses.vistaEscrow, amount],
            chainId: baseSepoliaNetwork.id,
          });

          await waitForTransactionReceipt(wagmiConfig, { hash: approvalHash });
          // Wait 2 seconds for load-balanced RPC nodes to sync the new state
          await new Promise((r) => setTimeout(r, 2000));
        }

        const ratePerSecondOnchain = parseUnits(VISTA_RATE.toFixed(6), 6);

        // Simulate first to surface the actual revert reason before writing
        const { request: depositRequest } = await simulateContract(wagmiConfig, {
          abi: vistaEscrowAbi,
          address: contractAddresses.vistaEscrow,
          functionName: "deposit",
          args: [
            campaignIdOnchain,
            amount,
            ratePerSecondOnchain,
            BigInt(duration),
          ],
          chainId: baseSepoliaNetwork.id,
          account: address,
        });

        txHash = await writeContractAsync(depositRequest);

        await waitForTransactionReceipt(wagmiConfig, { hash: txHash });
      } else {
        toast.warning(
          "Contract addresses are not configured, so launch is running in demo mode.",
        );
      }

      const campaign = await fetchJson<CampaignRecord>("/api/campaigns", {
        method: "POST",
        body: JSON.stringify({
          campaignIdOnchain,
          advertiserWallet: address,
          title,
          creativeUrl: uploadResult.publicUrl,
          targetUrl: landingUrl,
          totalBudget: parsedBudget,
          ratePerSecond: VISTA_RATE,
          targetPreferences: selectedPreferences,
          targetMinAge: ageRange[0],
          targetMaxAge: ageRange[1],
          targetLocations: selectedLocations,
        }),
      });

      setLaunchResult({
        txHash: txHash ?? bytes32FromSeed(`vista-demo-launch-${Date.now()}`),
        campaign,
      });
      toast.success("Campaign launched successfully.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to launch campaign.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="New campaign"
        title="Deposit budget and launch"
        description="Set your creative, target audience, and on-chain deposit in one flow."
      />

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardContent className="p-6">
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="title">Campaign title</Label>
                  <Input
                    id="title"
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    value={title}
                  />
                </div>

                {/* Creative upload */}
                <div className="space-y-3 sm:col-span-2">
                  <Label>Ad creative</Label>

                  {/* Dropzone */}
                  <div
                    className={cn(
                      "relative flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors",
                      isDragOver
                        ? "border-primary bg-primary/5"
                        : uploadState === "success"
                          ? "border-green-500/50 bg-green-500/5"
                          : uploadState === "error"
                            ? "border-destructive/50 bg-destructive/5"
                            : "border-border hover:border-muted-foreground/40 hover:bg-muted/30",
                    )}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragOver(true);
                    }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragOver(false);
                      const file = e.dataTransfer.files[0];
                      if (file) handleFileSelect(file);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ")
                        fileInputRef.current?.click();
                    }}
                    aria-label="Upload ad creative"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,.gif,.mp4,.mov,.webm"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileSelect(file);
                        e.target.value = "";
                      }}
                    />

                    {/* IDLE */}
                    {uploadState === "idle" && (
                      <div className="flex flex-col items-center gap-1.5 px-4 py-6 text-center">
                        <svg
                          className="h-8 w-8 text-muted-foreground"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.5}
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
                          />
                        </svg>
                        <p className="text-sm font-medium">
                          Drop your ad creative here, or click to browse
                        </p>
                        <p className="text-xs text-muted-foreground">
                          JPG, PNG, WebP, GIF, MP4, MOV, WebM — max 100 MB
                        </p>
                      </div>
                    )}

                    {/* UPLOADING */}
                    {uploadState === "uploading" && (
                      <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
                        <svg
                          className="h-6 w-6 animate-spin text-primary"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        <p className="text-sm text-muted-foreground">
                          Uploading to VISTA Media Storage…
                        </p>
                      </div>
                    )}

                    {/* SUCCESS */}
                    {uploadState === "success" && uploadResult && (
                      <div className="flex w-full items-center gap-3 px-4 py-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-500/10">
                          {uploadedMediaType === "video" ? (
                            <svg
                              className="h-5 w-5 text-green-600"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.5}
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"
                              />
                            </svg>
                          ) : (
                            <svg
                              className="h-5 w-5 text-green-600"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.5}
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
                              />
                            </svg>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {uploadResult.filePath.split("/").pop()}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {(uploadResult.size / 1024 / 1024).toFixed(1)} MB
                            {uploadedMediaType === "video" &&
                              uploadResult.duration !== null &&
                              ` · ${uploadResult.duration}s`}
                            {uploadedMediaType === "image" && " · image"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setUploadState("idle");
                            setUploadResult(null);
                            setUploadError(null);
                          }}
                          className="shrink-0 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          Replace
                        </button>
                      </div>
                    )}

                    {/* ERROR */}
                    {uploadState === "error" && (
                      <div className="flex flex-col items-center gap-1.5 px-4 py-6 text-center">
                        <svg
                          className="h-8 w-8 text-destructive"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.5}
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
                          />
                        </svg>
                        <p className="text-sm font-medium text-destructive">
                          Upload faileds
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {uploadError ?? "Please try again."}
                        </p>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setUploadState("idle");
                            setUploadError(null);
                          }}
                          className="mt-1 text-xs text-primary underline-offset-2 hover:underline"
                        >
                          Try again
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Duration input — shown after upload */}
                  {uploadState === "success" && uploadResult && (
                    <div className="animate-in fade-in duration-300">
                      {uploadedMediaType === "image" && (
                        <div className="space-y-2">
                          <Label htmlFor="displayDuration">
                            Display duration (seconds)
                          </Label>
                          <Input
                            id="displayDuration"
                            min="1"
                            onChange={(e) => setDisplayDuration(e.target.value)}
                            step="1"
                            type="number"
                            value={displayDuration}
                          />
                          <p className="text-xs text-muted-foreground">
                            How long the image ad is shown per view. Default:
                            30s.
                          </p>
                        </div>
                      )}
                      {uploadedMediaType === "video" &&
                        uploadResult.duration === null && (
                          <div className="space-y-2">
                            <Label htmlFor="displayDuration">
                              Ad duration (seconds)
                            </Label>
                            <Input
                              id="displayDuration"
                              min="1"
                              onChange={(e) =>
                                setDisplayDuration(e.target.value)
                              }
                              step="1"
                              type="number"
                              value={displayDuration}
                            />
                            <p className="text-xs text-muted-foreground">
                              Google Drive is still processing the video. Enter
                              the duration manually or wait a moment.
                            </p>
                          </div>
                        )}
                    </div>
                  )}
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="landingUrl">Landing page URL</Label>
                  <Input
                    id="landingUrl"
                    onChange={(e) => setLandingUrl(e.target.value)}
                    placeholder="https://... (where viewers go when they click)"
                    required
                    value={landingUrl}
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <Label>Total budget (USDC)</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => { e.preventDefault(); handleMintUSDC(); }}
                      disabled={isMinting}
                      className="h-7 text-xs"
                    >
                      {isMinting ? "Minting..." : "Mint Testnet USDC"}
                    </Button>
                  </div>
                  <Input
                    disabled={uploadState !== "success"}
                    min="0"
                    onChange={(e) => setTotalBudget(e.target.value)}
                    placeholder={
                      uploadState === "success"
                        ? "Enter budget"
                        : "Upload a creative first"
                    }
                    step="0.000001"
                    type="number"
                    value={totalBudget}
                  />
                </div>

                {/* Rate section */}
                <div className="sm:col-span-2 rounded-[16px] border border-border/70 bg-muted/20 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">VISTA Protocol rate</p>
                    <Badge variant="outline" className="font-mono text-xs">
                      Fixed
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      0.000072 USDC
                    </span>{" "}
                    × 1,000 viewers × duration
                  </p>

                  {uploadState === "idle" && (
                    <p className="text-xs text-muted-foreground">
                      Upload your ad creative to see rate calculations.
                    </p>
                  )}

                  {uploadState === "uploading" && (
                    <div className="mt-2 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                      <p className="text-xs text-muted-foreground">
                        Analyzing media…
                      </p>
                    </div>
                  )}

                  {uploadState === "success" && costPer1000 !== null && (
                    <div className="animate-in fade-in duration-500 mt-2 space-y-1 text-sm">
                      <p className="text-muted-foreground">
                        Cost for 1,000 viewers watching full ad:{" "}
                        <span className="font-semibold text-foreground">
                          ${formatUsdc(costPer1000)} USDC
                        </span>
                      </p>
                      {estimatedReach !== null && (
                        <p className="text-primary font-medium">
                          With a ${formatUsdc(Number(totalBudget))} budget and{" "}
                          {duration}s duration, your ad will reach approximately{" "}
                          <span className="font-semibold">
                            {estimatedReach.toLocaleString()} viewers
                          </span>
                          .
                        </p>
                      )}
                    </div>
                  )}

                  {uploadState === "success" && costPer1000 === null && (
                    <p className="animate-in fade-in duration-300 text-xs text-muted-foreground">
                      Enter the ad duration above to see your reach estimate.
                    </p>
                  )}

                  {uploadState === "error" && (
                    <p className="text-xs text-destructive">
                      ⚠️ Could not analyze media. Please re-upload to see rate
                      calculations.
                    </p>
                  )}
                </div>
              </div>

              {/* Audience targeting */}
              <div className="space-y-4 rounded-[24px] border border-border/70 bg-muted/25 p-5">
                <div>
                  <h3 className="text-base font-semibold tracking-tight">
                    Target audience
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Filter campaigns by interests, age, and regions.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Interests</Label>
                  <MultiSelect
                    labels={preferenceLabels}
                    onChange={(v) =>
                      setSelectedPreferences(v as PreferenceOption[])
                    }
                    options={preferenceOptions}
                    placeholder="Select interests…"
                    value={selectedPreferences}
                  />
                  {selectedPreferences.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {selectedPreferences.map((p) => (
                        <Badge key={p} variant="secondary" className="text-xs">
                          {preferenceLabels[p]}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <Label>Age range</Label>
                    <Badge variant="outline">
                      {ageRange[0]} – {ageRange[1]}
                    </Badge>
                  </div>
                  <Slider
                    max={65}
                    min={13}
                    onValueChange={(next) => {
                      const values = Array.isArray(next) ? next : [13, next];
                      setAgeRange([
                        values[0] ?? 13,
                        values[1] ?? values[0] ?? 65,
                      ]);
                    }}
                    step={1}
                    value={ageRange}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Locations</Label>
                  <MultiSelect
                    labels={locationLabels}
                    onChange={(v) =>
                      setSelectedLocations(
                        v as (typeof locationOptions)[number][],
                      )
                    }
                    options={locationOptions}
                    placeholder="Select locations…"
                    value={selectedLocations}
                  />
                  {selectedLocations.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {selectedLocations.map((l) => (
                        <Badge key={l} variant="secondary" className="text-xs">
                          {l}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <Button
                disabled={isSubmitting || uploadState !== "success"}
                size="lg"
                type="submit"
              >
                {isSubmitting
                  ? "Launching campaign…"
                  : "Deposit & Launch Campaign"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {/* CPSv chart — skeleton during upload */}
          {uploadState === "uploading" ? (
            <div className="rounded-xl border border-border bg-card/90 p-6 space-y-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-[268px] w-full rounded-lg" />
            </div>
          ) : (
            <MetricChartCard
              data={audienceChart}
              description={
                duration !== null
                  ? `Projected spend for 1,000 viewers at ${duration}s ad duration.`
                  : "Projected spend preview for 1,000 viewers across session lengths."
              }
              kind="bar"
              title="CPSv preview"
              valueFormatter={(value) => `${formatUsdc(value)} USDC`}
            />
          )}

          <Card>
            <CardHeader>
              <CardTitle>Launch checklist</CardTitle>
              <CardDescription>
                What happens when you submit this form.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>1. Generate a deterministic bytes32 campaign ID.</p>
              <p>2. Approve mUSDC spend to the VistaEscrow contract.</p>
              <p>3. Deposit budget on Base Sepolia.</p>
              <p>4. Persist campaign metadata in Supabase.</p>
              <p>5. Show transaction hash with explorer link.</p>
            </CardContent>
          </Card>

          {launchResult ? (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader>
                <CardTitle>Campaign launched</CardTitle>
                <CardDescription>
                  Your campaign is now available for Oracle targeting.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="space-y-1">
                  <p className="text-muted-foreground">Transaction hash</p>
                  <Link
                    className="font-medium text-primary underline-offset-4 hover:underline break-all"
                    href={buildExplorerUrl("tx", launchResult.txHash)}
                    target="_blank"
                  >
                    {launchResult.txHash}
                  </Link>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link
                    className={buttonVariants({ size: "sm" })}
                    href={`/advertiser/campaigns/${launchResult.campaign.id}`}
                  >
                    Open campaign detail
                  </Link>
                  <Link
                    className={buttonVariants({
                      size: "sm",
                      variant: "outline",
                    })}
                    href={buildExplorerUrl("tx", launchResult.txHash)}
                    target="_blank"
                  >
                    View on Base Sepolia Explorer
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
