import React from "react";

/**
 * Modern "squircle" app icon for Sohbeto.
 * - Rounded-square (iOS-like) shape with soft outer glow + drop shadow
 * - Glossy gradient body (teal → indigo → violet)
 * - Inline chat-bubble glyph with a tiny "spark" dot for an AI-flavored hint
 *
 * The size scales with the parent font-size container, mirroring the emoji icons.
 */
const SohbetoIcon: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <span
      className={`inline-block ${className ?? ""}`}
      style={{
        width: "1.1em",
        height: "1.1em",
        filter:
          "drop-shadow(0 6px 10px rgba(99, 102, 241, 0.45)) drop-shadow(0 2px 3px rgba(0,0,0,0.35))",
      }}
      aria-label="Sohbeto"
    >
      <svg viewBox="0 0 64 64" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="sohbetoBody" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="55%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
          <linearGradient id="sohbetoGloss" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
            <stop offset="55%" stopColor="rgba(255,255,255,0.05)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
          <radialGradient id="sohbetoSpark" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff7ae" />
            <stop offset="100%" stopColor="#f59e0b" />
          </radialGradient>
        </defs>

        {/* Squircle body */}
        <rect x="2" y="2" width="60" height="60" rx="16" ry="16" fill="url(#sohbetoBody)" />
        {/* Top gloss highlight */}
        <rect x="2" y="2" width="60" height="34" rx="16" ry="16" fill="url(#sohbetoGloss)" />
        {/* Inner border */}
        <rect
          x="2.5"
          y="2.5"
          width="59"
          height="59"
          rx="15.5"
          ry="15.5"
          fill="none"
          stroke="rgba(255,255,255,0.35)"
          strokeWidth="1"
        />

        {/* Chat bubble */}
        <path
          d="M16 22c0-3.3 2.7-6 6-6h20c3.3 0 6 2.7 6 6v14c0 3.3-2.7 6-6 6H30l-7 6v-6h-1c-3.3 0-6-2.7-6-6V22z"
          fill="rgba(255,255,255,0.96)"
        />
        {/* "So" yazısı */}
        <text
          x="32"
          y="36"
          textAnchor="middle"
          fontFamily="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
          fontSize="14"
          fontWeight="800"
          fill="#6366f1"
          letterSpacing="-0.5"
        >
          So
        </text>

        {/* AI spark */}
        <circle cx="48" cy="16" r="4" fill="url(#sohbetoSpark)" />
        <circle cx="48" cy="16" r="4" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="0.8" />
      </svg>
    </span>
  );
};

export default SohbetoIcon;
