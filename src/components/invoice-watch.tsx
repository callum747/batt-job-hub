"use client";

import { useEffect } from "react";

/** Asks the server to look for new supplier invoices once per page load. The server decides if it's due. */
export function InvoiceWatch() {
  useEffect(() => {
    fetch("/api/scan-invoices", { method: "POST" }).catch(() => {});
  }, []);
  return null;
}
