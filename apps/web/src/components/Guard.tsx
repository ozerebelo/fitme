"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/state";
import { Spinner } from "./ui";

/**
 * Blocks a screen until local data has hydrated, and sends first-time users to
 * onboarding. Rendering a dashboard full of zeroes while IndexedDB opens looks
 * like data loss, so we wait.
 */
export const RequireProfile = ({ children }: { children: React.ReactNode }) => {
  const { ready, data } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (ready && !data.profile) router.replace("/onboarding");
  }, [ready, data.profile, router]);

  if (!ready) return <Spinner label="Loading your data" />;
  if (!data.profile) return <Spinner label="Setting up" />;
  return <>{children}</>;
};
