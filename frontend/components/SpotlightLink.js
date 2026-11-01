"use client";

import Link from "next/link";

export function SpotlightLink({ href, className = "", children, ...rest }) {
  function handlePointerMove(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty(
      "--mx",
      `${event.clientX - rect.left}px`,
    );
    event.currentTarget.style.setProperty(
      "--my",
      `${event.clientY - rect.top}px`,
    );
  }

  return (
    <Link
      href={href}
      onPointerMove={handlePointerMove}
      className={`spotlight ${className}`}
      {...rest}
    >
      {children}
    </Link>
  );
}
