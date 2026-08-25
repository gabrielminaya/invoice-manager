"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";

/** Copia un texto al portapapeles y confirma visualmente durante 2 segundos. */
export function CopyButton({ value, label = "Copiar" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-xs font-medium text-muted transition-colors hover:text-ink"
    >
      <Icon name={copied ? "check" : "copy"} size={14} />
      {copied ? "Copiado" : label}
    </button>
  );
}
