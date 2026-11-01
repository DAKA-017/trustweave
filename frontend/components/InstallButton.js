"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, Download, Share } from "lucide-react";

let installedThisSession = false;

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    installedThisSession ||
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    window.navigator.standalone === true
  );
}

function detectIosSafari() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua);
  const safari = /safari/i.test(ua) && !/chrome|chromium|crios|fxios|edg/i.test(ua);
  return ios && safari && !isStandalone();
}

function subscribeInstalled(onChange) {
  window.addEventListener("appinstalled", onChange);
  const media = window.matchMedia?.("(display-mode: standalone)");
  media?.addEventListener?.("change", onChange);
  return () => {
    window.removeEventListener("appinstalled", onChange);
    media?.removeEventListener?.("change", onChange);
  };
}

const subscribeStatic = () => () => {};
const serverSnapshot = () => false;

export function InstallButton() {
  const [promptEvent, setPromptEvent] = useState(null);

  useEffect(() => {
    const onPrompt = (event) => {
      event.preventDefault();
      setPromptEvent(event);
    };
    const onInstalled = () => {
      installedThisSession = true;
      setPromptEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const installed = useSyncExternalStore(
    subscribeInstalled,
    isStandalone,
    serverSnapshot,
  );
  const iosHint = useSyncExternalStore(
    subscribeStatic,
    detectIosSafari,
    serverSnapshot,
  );

  if (installed) {
    return (
      <p className="flex items-center gap-1.5 rounded-md border border-teal/30 bg-teal/5 px-2.5 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-teal">
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        installed as an app
      </p>
    );
  }

  if (promptEvent) {
    return (
      <button
        type="button"
        onClick={async () => {
          promptEvent.prompt();
          await promptEvent.userChoice.catch(() => null);
          setPromptEvent(null);
        }}
        className="flex min-h-9 w-full items-center gap-2 rounded-md border border-teal/40 bg-teal/10 px-2.5 py-1.5 text-xs font-medium text-teal transition-colors hover:bg-teal/20"
      >
        <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
        Install app
      </button>
    );
  }

  if (iosHint) {
    return (
      <p className="flex items-start gap-1.5 rounded-md border border-line bg-panel px-2.5 py-2 text-[10px] leading-relaxed text-muted">
        <Share className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        On iPhone or iPad, open Share and choose “Add to Home Screen”.
      </p>
    );
  }

  return null;
}
