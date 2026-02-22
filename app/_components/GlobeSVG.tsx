export default function GlobeSVG() {
  const latitudes = [-120, -80, -40, 0, 40, 80, 120];
  const longitudes = [0, 30, 60, 90, 120, 150];
  const dots: [number, number][] = [
    [145, 120],
    [195, 125],
    [270, 115],
    [220, 195],
    [130, 230],
  ];

  return (
    <svg
      viewBox="0 0 400 400"
      className="w-full h-full"
      style={{
        animation: "slowRotate 32s linear infinite",
        filter: "drop-shadow(0 0 35px rgba(0,212,255,0.2))",
      }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="gBase" cx="35%" cy="35%">
          <stop offset="0%" stopColor="#1a3a5c" />
          <stop offset="65%" stopColor="#0a1628" />
          <stop offset="100%" stopColor="#050d1a" />
        </radialGradient>
        <radialGradient id="gHalo" cx="50%" cy="50%">
          <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#00d4ff" stopOpacity="0" />
        </radialGradient>
        <clipPath id="cClip">
          <circle cx="200" cy="200" r="165" />
        </clipPath>
        <filter id="fGlow">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <circle cx="200" cy="200" r="185" fill="url(#gHalo)" />
      <circle cx="200" cy="200" r="165" fill="url(#gBase)" />

      <g
        clipPath="url(#cClip)"
        opacity="0.2"
        stroke="#00d4ff"
        strokeWidth="0.7"
        fill="none"
      >
        {latitudes.map((y, i) => (
          <ellipse
            key={`lat-${i}`}
            cx="200"
            cy={200 + y}
            rx={Math.round(Math.sqrt(165 * 165 - y * y))}
            ry="16"
          />
        ))}
        {longitudes.map((a, i) => (
          <ellipse
            key={`lng-${i}`}
            cx="200"
            cy="200"
            rx="16"
            ry="165"
            transform={`rotate(${a} 200 200)`}
          />
        ))}
      </g>

      <g clipPath="url(#cClip)" fill="#0d4060" opacity="0.9" filter="url(#fGlow)">
        <polygon points="80,110 130,95 145,130 120,175 90,170 70,145" />
        <polygon points="115,195 140,185 150,240 130,290 105,270 100,230" />
        <polygon points="185,105 220,100 235,130 210,145 185,135" />
        <polygon points="190,150 230,145 245,200 230,260 200,270 180,230 185,185" />
        <polygon points="230,90 320,85 340,130 310,160 260,155 235,130" />
        <polygon points="290,230 330,220 340,255 315,270 285,258" />
      </g>

      <path
        d="M 90 140 Q 200 50 310 140"
        stroke="#00d4ff"
        strokeWidth="1.2"
        fill="none"
        opacity="0.3"
        clipPath="url(#cClip)"
      />

      {dots.map(([cx, cy], i) => (
        <g key={`dot-${i}`}>
          <circle
            cx={cx}
            cy={cy}
            r="3.5"
            fill="#00d4ff"
            opacity="0.9"
            filter="url(#fGlow)"
          />
          <circle
            cx={cx}
            cy={cy}
            r="7"
            fill="none"
            stroke="#00d4ff"
            strokeWidth="1"
            opacity="0.35"
            style={{ animation: `pulseRing 2s ${i * 0.4}s ease-out infinite` }}
          />
        </g>
      ))}

      <circle
        cx="200"
        cy="200"
        r="165"
        fill="none"
        stroke="#00d4ff"
        strokeWidth="1.2"
        opacity="0.5"
      />
    </svg>
  );
}
