import React from "react";
import { ss } from "../theme";

type Props = {
  label: string;
  value: number;
  /** 0–100 */
  percent: number;
  color?: string;
  trackColor?: string;
  /** Use on dark / tinted backgrounds (e.g. results hero). */
  tone?: "default" | "onDark";
};

export const ProgressBar: React.FC<Props> = ({
  label,
  value,
  percent,
  color = ss.primary,
  trackColor = ss.border,
  tone = "default"
}) => {
  const w = Math.min(100, Math.max(0, percent));
  const labelMuted = tone === "onDark" ? "rgba(255,255,255,0.82)" : ss.muted;
  const labelStrong = tone === "onDark" ? "#fff" : ss.text;
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 6,
          fontSize: "0.875rem",
          color: labelMuted
        }}
      >
        <span style={{ color: labelStrong, fontWeight: 500 }}>{label}</span>
        <span style={{ fontWeight: 700, color: labelStrong }}>{value}%</span>
      </div>
      <div
        style={{
          height: 10,
          borderRadius: 5,
          background: trackColor,
          overflow: "hidden"
        }}
        role="progressbar"
        aria-valuenow={Math.round(w)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          style={{
            width: `${w}%`,
            height: "100%",
            background: color,
            borderRadius: 5,
            transition: "width 0.25s ease"
          }}
        />
      </div>
    </div>
  );
};
