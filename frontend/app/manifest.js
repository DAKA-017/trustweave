export default function manifest() {
  return {
    id: "/",
    name: "TrustWeave — decentralized contribution trust",
    short_name: "TrustWeave",
    description:
      "A simulated decentralized trust network that judges open source contributions by behavior and signed records, not by AI-text detection.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    orientation: "any",
    background_color: "#141619",
    theme_color: "#141619",
    categories: ["developer", "productivity", "education"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Network",
        short_name: "Network",
        url: "/network",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Campaigns",
        short_name: "Campaigns",
        url: "/campaigns",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Simulator",
        short_name: "Simulator",
        url: "/simulator",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
