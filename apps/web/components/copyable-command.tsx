"use client";

import { emitCopyToast } from "./copy-toast";

export function CopyableCommand({ value, compact = false }: { value: string; compact?: boolean }) {
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      emitCopyToast("Copied!");
    } catch {
      // no-op on clipboard failure
    }
  }

  return (
    <button
      type="button"
      className={`copy-inline${compact ? " compact" : ""}`}
      onClick={onCopy}
      title="Click to copy command"
    >
      {value}
    </button>
  );
}
