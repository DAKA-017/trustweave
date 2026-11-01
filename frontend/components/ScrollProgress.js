"use client";

import { useEffect, useRef } from "react";

export function ScrollProgress() {
  const bar = useRef(null);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      const node = bar.current;
      if (!node) return;
      const scrollable =
        document.documentElement.scrollHeight - window.innerHeight;
      const progress =
        scrollable > 0
          ? Math.min(1, Math.max(0, window.scrollY / scrollable))
          : 0;
      node.style.transform = `scaleX(${progress})`;
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="absolute inset-x-0 bottom-0 h-px bg-line/50"
    >
      <div
        ref={bar}
        className="h-px origin-left scale-x-0 bg-teal/80"
        style={{ transform: "scaleX(0)" }}
      />
    </div>
  );
}
