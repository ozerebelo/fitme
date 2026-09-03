"use client";

import { useEffect, useRef } from "react";
import { useMoney } from "@/lib/money";

/**
 * The money section.
 *
 * Its one job beyond rendering the pages: post the standing payments that were
 * marked "post without asking" and have come due. Everything else waits for
 * confirmation, because a bill the app inserted and the bank has not yet taken
 * is a balance that quietly disagrees with reality.
 */
export default function MoneyLayout({ children }: { children: React.ReactNode }) {
  const { ready, due, postDue } = useMoney();
  // One pass per set of dates, so re-renders during the write cannot re-post.
  const posted = useRef<string>("");

  useEffect(() => {
    if (!ready) return;
    const automatic = due.filter((occurrence) => occurrence.rule.autoPost);
    if (automatic.length === 0) return;
    const signature = automatic
      .map((occurrence) => `${occurrence.rule.id}:${occurrence.date}`)
      .join("|");
    if (signature === posted.current) return;
    posted.current = signature;
    postDue(automatic);
  }, [ready, due, postDue]);

  return <>{children}</>;
}
