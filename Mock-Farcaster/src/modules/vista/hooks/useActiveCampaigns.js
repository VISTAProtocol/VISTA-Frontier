"use client";
import { useState, useEffect } from "react";

export function useActiveCampaigns(userWallet) {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!userWallet) {
      setLoading(false);
      return;
    }

    const fetchCampaigns = async () => {
      try {
        const res = await fetch(
          `/api/campaigns?userWallet=${encodeURIComponent(userWallet)}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to fetch campaigns");
        setCampaigns(data.campaigns || []);
      } catch (err) {
        console.error("[VISTA] Failed to fetch campaigns:", err);
        setError(err.message);
        setCampaigns([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCampaigns();
  }, [userWallet]);

  return { campaigns, loading, error };
}
