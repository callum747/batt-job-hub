"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Background checks, once per page load; the server decides if each is due: supplier invoices in info@
 * (every 30 minutes) and job folders made by hand in Drive (every 10). If a new job turned up, the page refreshes.
 */
export function InvoiceWatch() {
  const router = useRouter();
  useEffect(() => {
    fetch("/api/scan-invoices", { method: "POST" }).catch(() => {});
    fetch("/api/scan-drive", { method: "POST" })
      .then((r) => r.json())
      .then((r: { created?: string[]; linked?: string[] }) => {
        if ((r.created?.length ?? 0) + (r.linked?.length ?? 0) > 0) router.refresh();
      })
      .catch(() => {});
  }, [router]);
  return null;
}
