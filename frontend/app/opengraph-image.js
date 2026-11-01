import { ImageResponse } from "next/og";
import { SITE_DESCRIPTION, SITE_TITLE } from "@/lib/site";

export const alt = SITE_TITLE;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const CHIPS = [
  "SIGNED RECORDS",
  "PER-PROJECT JUDGEMENT",
  "HONEST LIMITS",
];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          position: "relative",
          padding: "60px 64px",
          background: "#141619",
          color: "#ece9e1",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            backgroundImage:
              "linear-gradient(122deg, rgba(56,212,187,0.20) 0%, rgba(20,22,25,0) 56%)",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "relative",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "64px",
                height: "64px",
                borderRadius: "14px",
                border: "1px solid rgba(56,212,187,0.45)",
                background: "rgba(56,212,187,0.10)",
                color: "#38d4bb",
                fontSize: "22px",
                fontWeight: 700,
                letterSpacing: "-0.5px",
              }}
            >
              TW
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ fontSize: "26px", fontWeight: 700 }}>TrustWeave</div>
              <div
                style={{
                  fontSize: "13px",
                  letterSpacing: "2.5px",
                  color: "#9ba1a0",
                }}
              >
                TRUST, WITHOUT ONE SCORE
              </div>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "9px",
              border: "1px solid rgba(233,180,91,0.4)",
              borderRadius: "8px",
              padding: "8px 14px",
              color: "#e9b45b",
              fontSize: "13px",
              letterSpacing: "2px",
            }}
          >
            <div
              style={{
                display: "flex",
                width: "8px",
                height: "8px",
                borderRadius: "99px",
                background: "#e9b45b",
              }}
            />
            SIMULATED
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "24px",
            position: "relative",
            maxWidth: "1010px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: "72px",
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: "-2.5px",
            }}
          >
            <span>Trust the work,</span>
            <span style={{ color: "#38d4bb" }}>not one global score.</span>
          </div>
          <div
            style={{
              fontSize: "24px",
              lineHeight: 1.45,
              color: "#9ba1a0",
              maxWidth: "900px",
            }}
          >
            {SITE_DESCRIPTION}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "relative",
            borderTop: "1px solid #2c3236",
            paddingTop: "24px",
          }}
        >
          <div style={{ display: "flex", gap: "10px" }}>
            {CHIPS.map((chip) => (
              <div
                key={chip}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "9px",
                  border: "1px solid #2c3236",
                  borderRadius: "8px",
                  background: "#1a1d20",
                  padding: "10px 14px",
                  fontSize: "13px",
                  letterSpacing: "1.8px",
                  color: "#9ba1a0",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    width: "7px",
                    height: "7px",
                    borderRadius: "99px",
                    background: "#38d4bb",
                  }}
                />
                {chip}
              </div>
            ))}
          </div>
          <div style={{ fontSize: "17px", color: "#9ba1a0" }}>
            trustweave-taupe.vercel.app
          </div>
        </div>
      </div>
    ),
    size,
  );
}
