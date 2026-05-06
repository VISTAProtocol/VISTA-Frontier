"use client";
import { useEffect, useRef, useState } from "react";
import { Vista } from "@/lib/vista-sdk";

const API_KEY = process.env.NEXT_PUBLIC_VISTA_API_KEY;
const ORACLE_URL = process.env.NEXT_PUBLIC_VISTA_ORACLE_URL;
const CAMPAIGN_ID = process.env.NEXT_PUBLIC_VISTA_CAMPAIGN_ID;
const PUBLISHER_WALLET = process.env.NEXT_PUBLIC_VISTA_PUBLISHER_WALLET;

export function useVista({ userWallet, zoneId, campaignId }) {
  const [state, setState] = useState({
    earnings: 0,
    validSeconds: 0,
    score: 0,
    isActive: false,
    flagged: false,
    tickAmount: 0,
  });

  const initializedWalletRef = useRef(null);
  const activeCampaignRef = useRef(null);
  const zoneAttachedRef = useRef(false);

  useEffect(() => {
    if (!userWallet) {
      if (zoneAttachedRef.current) {
        Vista.detachZone();
        zoneAttachedRef.current = false;
        initializedWalletRef.current = null;
        activeCampaignRef.current = null;
        setState((s) => ({ ...s, isActive: false }));
      }
      return;
    }

    const resolvedCampaignId = campaignId ?? CAMPAIGN_ID;

    if (
      zoneAttachedRef.current &&
      (initializedWalletRef.current !== userWallet ||
        activeCampaignRef.current !== resolvedCampaignId)
    ) {
      Vista.detachZone();
      zoneAttachedRef.current = false;
    }

    if (
      initializedWalletRef.current !== userWallet ||
      activeCampaignRef.current !== resolvedCampaignId
    ) {
      try {
        Vista.init({
          apiKey: API_KEY,
          userWallet,
          oracleUrl: ORACLE_URL,
          campaignId: resolvedCampaignId,
          publisherWallet: PUBLISHER_WALLET,
        });
        initializedWalletRef.current = userWallet;
        activeCampaignRef.current = resolvedCampaignId;
      } catch (err) {
        console.error("[useVista] init failed:", err);
        return;
      }
    }

    Vista.onEarn((data) => {
      setState({
        earnings: data.sessionAmount,
        validSeconds: data.validSeconds,
        score: data.score,
        isActive: true,
        flagged: data.flagged,
        tickAmount: data.tickAmount,
      });
    });

    const el = document.getElementById(zoneId);
    if (el && !zoneAttachedRef.current) {
      try {
        Vista.attachZone(zoneId);
        zoneAttachedRef.current = true;
        setState((s) => ({ ...s, isActive: true }));
      } catch (err) {
        console.warn("[useVista] attachZone failed:", err);
      }
    }

    return () => {
      if (zoneAttachedRef.current) {
        Vista.detachZone();
        zoneAttachedRef.current = false;
      }
    };
  }, [userWallet, zoneId, campaignId]);

  return state;
}
