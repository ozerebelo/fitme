"use client";

import { useEffect } from "react";

/** Registers the offline service worker. Failure is non-fatal — the app works
 *  online regardless, and IndexedDB already holds the data. */
export const ServiceWorker = () => {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = (): void => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* offline support is a bonus, not a requirement */
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
};
