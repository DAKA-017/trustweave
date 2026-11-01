"use client";

import { useEffect, useRef } from "react";

const NODE_COUNT = 30;
const LINK_REACH = 0.24;
const POINTER_REACH = 190;

function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function HeroCanvas() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const random = makeRandom(42);
    const pointer = { x: -999, y: -999, tx: -999, ty: -999, active: false };
    let width = 0;
    let height = 0;
    let nodes = [];
    let links = [];
    let frame = 0;
    let inView = true;

    function measure() {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function seed() {
      nodes = Array.from({ length: NODE_COUNT }, () => ({
        x: random() * width,
        y: random() * height,
        vx: (random() - 0.5) * 0.18,
        vy: (random() - 0.5) * 0.18,
        r: 1 + random() * 1.7,
      }));
      const reach = Math.min(width, height) * LINK_REACH;
      links = [];
      for (let a = 0; a < nodes.length; a += 1) {
        for (let b = a + 1; b < nodes.length; b += 1) {
          const dx = nodes[a].x - nodes[b].x;
          const dy = nodes[a].y - nodes[b].y;
          if (Math.hypot(dx, dy) < reach) links.push([a, b]);
        }
      }
    }

    function draw() {
      context.clearRect(0, 0, width, height);
      if (pointer.active) {
        pointer.x += (pointer.tx - pointer.x) * 0.14;
        pointer.y += (pointer.ty - pointer.y) * 0.14;
      }

      const reach = Math.min(width, height) * LINK_REACH;
      for (const [a, b] of links) {
        const one = nodes[a];
        const two = nodes[b];
        const distance = Math.hypot(one.x - two.x, one.y - two.y);
        const alpha = Math.max(0, 1 - distance / reach) * 0.16;
        if (alpha <= 0) continue;
        context.strokeStyle = `rgba(56, 212, 187, ${alpha.toFixed(3)})`;
        context.lineWidth = 0.6;
        context.beginPath();
        context.moveTo(one.x, one.y);
        context.lineTo(two.x, two.y);
        context.stroke();
      }

      for (const node of nodes) {
        let lit = false;
        if (pointer.active) {
          const distance = Math.hypot(node.x - pointer.x, node.y - pointer.y);
          if (distance < POINTER_REACH) {
            lit = true;
            const alpha = (1 - distance / POINTER_REACH) * 0.4;
            context.strokeStyle = `rgba(56, 212, 187, ${alpha.toFixed(3)})`;
            context.lineWidth = 0.7;
            context.beginPath();
            context.moveTo(node.x, node.y);
            context.lineTo(pointer.x, pointer.y);
            context.stroke();
          }
        }

        context.beginPath();
        context.arc(node.x, node.y, node.r, 0, Math.PI * 2);
        context.fillStyle = lit
          ? "rgba(56, 212, 187, 0.78)"
          : "rgba(236, 233, 225, 0.22)";
        context.fill();

        if (lit) {
          context.beginPath();
          context.arc(node.x, node.y, node.r + 5, 0, Math.PI * 2);
          context.strokeStyle = "rgba(56, 212, 187, 0.22)";
          context.lineWidth = 0.7;
          context.stroke();
        }
      }

      if (pointer.active) {
        context.beginPath();
        context.arc(pointer.x, pointer.y, 2.2, 0, Math.PI * 2);
        context.fillStyle = "rgba(56, 212, 187, 0.9)";
        context.fill();
      }
    }

    function loop() {
      if (!inView || document.hidden) {
        frame = 0;
        return;
      }
      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;
        if (node.x < -24) node.x = width + 24;
        if (node.x > width + 24) node.x = -24;
        if (node.y < -24) node.y = height + 24;
        if (node.y > height + 24) node.y = -24;
      }
      draw();
      frame = requestAnimationFrame(loop);
    }

    function start() {
      if (reduceMotion.matches) {
        draw();
        return;
      }
      if (!frame) frame = requestAnimationFrame(loop);
    }

    function stop() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    }

    function onResize() {
      measure();
      seed();
      draw();
    }

    function onPointerMove(event) {
      const rect = canvas.getBoundingClientRect();
      pointer.tx = event.clientX - rect.left;
      pointer.ty = event.clientY - rect.top;
      pointer.active =
        pointer.tx >= 0 &&
        pointer.tx <= rect.width &&
        pointer.ty >= 0 &&
        pointer.ty <= rect.height;
      if (pointer.active && pointer.x < -100) {
        pointer.x = pointer.tx;
        pointer.y = pointer.ty;
      }
    }

    function onMotionChange() {
      if (reduceMotion.matches) {
        stop();
        draw();
      } else if (inView) {
        start();
      }
    }

    function onVisibility() {
      if (document.hidden) stop();
      else if (inView) start();
    }

    measure();
    seed();
    draw();
    start();

    const observer = new IntersectionObserver(
      (entries) => {
        inView = entries[0]?.isIntersecting ?? true;
        if (inView) start();
        else stop();
      },
      { threshold: 0 },
    );
    observer.observe(canvas);

    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    reduceMotion.addEventListener?.("change", onMotionChange);

    return () => {
      observer.disconnect();
      stop();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibility);
      reduceMotion.removeEventListener?.("change", onMotionChange);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full opacity-60"
      style={{
        maskImage:
          "radial-gradient(ellipse at center, black 32%, transparent 84%)",
        WebkitMaskImage:
          "radial-gradient(ellipse at center, black 32%, transparent 84%)",
      }}
    />
  );
}
