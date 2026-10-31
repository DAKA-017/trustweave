"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Loads a resource and aborts the in-flight request whenever the key changes or
 * the component unmounts. A pending key is reported as loading even before the
 * request starts, so stale data never masquerades as the current view.
 */
export function useApiResource(loader, key = "") {
  const loaderRef = useRef(loader);
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState({
    key: null,
    nonce: null,
    data: null,
    error: null,
  });

  useEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    loaderRef
      .current(controller.signal)
      .then((data) => {
        if (active) setResult({ key, nonce, data, error: null });
      })
      .catch((error) => {
        if (!active || error.name === "AbortError") return;
        setResult({ key, nonce, data: null, error });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [key, nonce]);

  const refetch = useCallback(() => setNonce((value) => value + 1), []);

  const current = result.key === key ? result : null;
  const pending = !current || current.nonce !== nonce;

  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: pending,
    refetch,
  };
}
