"use client";

import { useState } from "react";
import { emitCopyToast } from "./copy-toast";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      emitCopyToast("Copied!");
      setTimeout(() => setCopied(false), 900);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button type="button" onClick={onCopy} className="copy-button" aria-label={`Copy ${value}`}>
      {copied ? "Copied!" : label}
    </button>
  );
}
