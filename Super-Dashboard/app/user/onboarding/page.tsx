"use client";

import {
  Banknote,
  Bitcoin,
  BookOpen,
  Camera,
  Car,
  Clapperboard,
  Cpu,
  Dumbbell,
  Gamepad2,
  Globe,
  HeartPulse,
  Home,
  Music,
  Newspaper,
  Shirt,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAccount } from "wagmi";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { preferenceLabels, preferenceOptions } from "@/lib/constants";
import { fetchJson } from "@/lib/http";
import type { PreferenceOption } from "@/lib/types";
import { cn } from "@/lib/utils";

const preferenceIcons = {
  tech: Cpu,
  gaming: Gamepad2,
  fashion: Shirt,
  sport: Dumbbell,
  food: UtensilsCrossed,
  healthy: HeartPulse,
  finance: Banknote,
  crypto: Bitcoin,
  travel: Globe,
  music: Music,
  automotive: Car,
  beauty: Sparkles,
  education: BookOpen,
  entertainment: Clapperboard,
  fitness: Dumbbell,
  news: Newspaper,
  photography: Camera,
  "real-estate": Home,
} satisfies Record<PreferenceOption, typeof Shirt>;

export default function UserOnboardingPage() {
  const { address } = useAccount();
  const [age, setAge] = useState("27");
  const [location, setLocation] = useState("Jakarta");
  const [selectedPreferences, setSelectedPreferences] = useState<
    PreferenceOption[]
  >(["tech", "gaming"]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function togglePreference(preference: PreferenceOption) {
    setSelectedPreferences((current) =>
      current.includes(preference)
        ? current.filter((item) => item !== preference)
        : [...current, preference],
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address) return;

    try {
      setIsSubmitting(true);
      await fetchJson("/api/users", {
        method: "POST",
        body: JSON.stringify({
          walletAddress: address,
          age: age ? Number(age) : null,
          location,
          preferences: selectedPreferences,
        }),
      });
      toast.success("User profile created.");
      window.location.href = "/user/dashboard";
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to save your user profile.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="User onboarding"
        title="Tell VISTA what to show you"
        description="Add your age, location, and preference profile so the Oracle can route relevant campaigns."
      />

      <Card>
        <CardContent className="p-6">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="walletAddress">Wallet address</Label>
                <Input id="walletAddress" readOnly value={address ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="age">Age</Label>
                <Input
                  id="age"
                  min="13"
                  onChange={(event) => setAge(event.target.value)}
                  type="number"
                  value={age}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="Jakarta"
                  value={location}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label>Preferences</Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pick all categories you want VISTA to target.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {preferenceOptions.map((preference) => {
                  const Icon = preferenceIcons[preference];
                  const active = selectedPreferences.includes(preference);

                  return (
                    <button
                      className={cn(
                        "rounded-[24px] border p-4 text-left transition-colors",
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/70 bg-background/70 text-foreground",
                      )}
                      key={preference}
                      onClick={(event) => {
                        event.preventDefault();
                        togglePreference(preference);
                      }}
                      type="button"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="space-y-2">
                          <div className="inline-flex rounded-2xl border border-border/70 bg-background/80 p-2">
                            <Icon className="size-4" />
                          </div>
                          <p className="font-medium">
                            {preferenceLabels[preference]}
                          </p>
                        </div>
                        <div
                          className={cn(
                            "size-3 rounded-full",
                            active ? "bg-primary" : "bg-border",
                          )}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? "Saving profile..." : "Create user profile"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
