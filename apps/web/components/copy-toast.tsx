"use client";

import { useEffect, useState } from "react";

export function emitCopyToast(message = "Copied!") {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent("clime-copy-toast", {
      detail: { message }
    })
  );
}

export function CopyToast() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    function onToast(event: Event) {
      const customEvent = event as CustomEvent<{ message?: string }>;
      setMessage(customEvent.detail?.message ?? "Copied!");
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        setMessage(null);
      }, 1100);
    }

    window.addEventListener("clime-copy-toast", onToast);
    return () => {
      window.removeEventListener("clime-copy-toast", onToast);
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, []);

  if (!message) {
    return null;
  }

  return (
    <div className="copy-toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}
