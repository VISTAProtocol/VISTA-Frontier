"use client";
import { useState, useEffect } from "react";

export function useVistaUser(userWallet) {
  const [isRegistered, setIsRegistered] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userWallet) {
      setIsRegistered(false);
      setLoading(false);
      return;
    }

    const checkUser = async () => {
      try {
        const res = await fetch(
          `/api/users?userWallet=${encodeURIComponent(userWallet)}`,
          { cache: "no-store" }
        );
        if (res.ok) {
          const data = await res.json();
          setUserData(data);
          setIsRegistered(true);
        } else {
          setIsRegistered(false);
        }
      } catch (err) {
        console.error("[VISTA] Failed to check user:", err);
        setIsRegistered(false);
      } finally {
        setLoading(false);
      }
    };

    checkUser();
  }, [userWallet]);

  return { isRegistered, userData, loading };
}
