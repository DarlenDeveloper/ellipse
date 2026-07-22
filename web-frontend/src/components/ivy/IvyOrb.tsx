"use client";

/**
 * IvyOrb — a glassy, in-motion AI sphere. Pure CSS (no deps), so it stays crisp
 * at any size and animates smoothly. A frosted glass ball with two blue plasma
 * layers swirling inside, a soft top shine, and a flowing wave streak.
 */
export function IvyOrb({ size = 56, active = false }: { size?: number; active?: boolean }) {
  const speed = active ? 0.55 : 1; // speed multiplier when Ivy is "listening"

  return (
    <div
      className="relative rounded-full"
      style={{
        width: size,
        height: size,
        // frosted glass base
        background:
          "radial-gradient(circle at 32% 28%, #ffffff 0%, #eef3fb 42%, #dbe6f6 74%, #cdd9ee 100%)",
        boxShadow:
          "inset 0 2px 6px rgba(255,255,255,0.9), inset 0 -8px 16px rgba(120,150,200,0.35), 0 8px 22px rgba(70,110,190,0.28)",
        overflow: "hidden",
        animation: `ivy-breathe ${4 * speed}s ease-in-out infinite`,
      }}
    >
      {/* swirling plasma layer 1 */}
      <div
        style={{
          position: "absolute",
          inset: "-30%",
          background:
            "radial-gradient(closest-side, rgba(56,132,255,0.95), rgba(56,132,255,0) 70%)",
          filter: `blur(${size * 0.12}px)`,
          animation: `ivy-swirl ${7 * speed}s linear infinite`,
        }}
      />
      {/* swirling plasma layer 2 */}
      <div
        style={{
          position: "absolute",
          inset: "-20%",
          background:
            "radial-gradient(closest-side, rgba(120,190,255,0.85), rgba(120,190,255,0) 65%)",
          filter: `blur(${size * 0.1}px)`,
          animation: `ivy-swirl-rev ${9 * speed}s linear infinite`,
        }}
      />
      {/* flowing wave streak (the signature swoosh) */}
      <div
        style={{
          position: "absolute",
          left: "-10%",
          right: "-10%",
          top: "52%",
          height: size * 0.34,
          borderRadius: "50%",
          background:
            "linear-gradient(90deg, rgba(90,160,255,0) 0%, rgba(70,140,255,0.95) 45%, rgba(150,205,255,0.9) 60%, rgba(90,160,255,0) 100%)",
          filter: `blur(${size * 0.04}px)`,
          transformOrigin: "center",
          animation: `ivy-wave ${6 * speed}s ease-in-out infinite`,
        }}
      />
      {/* fine wave lines for the "feathered" look */}
      <div
        style={{
          position: "absolute",
          left: "5%",
          right: "5%",
          top: "56%",
          height: size * 0.14,
          borderRadius: "50%",
          backgroundImage:
            "repeating-linear-gradient(92deg, rgba(255,255,255,0.7) 0px, rgba(255,255,255,0.7) 1px, rgba(255,255,255,0) 3px, rgba(255,255,255,0) 6px)",
          maskImage: "linear-gradient(90deg, transparent, black 40%, black 70%, transparent)",
          WebkitMaskImage: "linear-gradient(90deg, transparent, black 40%, black 70%, transparent)",
          opacity: 0.6,
          filter: `blur(0.4px)`,
          animation: `ivy-wave ${6 * speed}s ease-in-out infinite`,
        }}
      />
      {/* top glass shine */}
      <div
        style={{
          position: "absolute",
          left: "14%",
          top: "8%",
          width: "58%",
          height: "40%",
          borderRadius: "50%",
          background:
            "radial-gradient(closest-side, rgba(255,255,255,0.95), rgba(255,255,255,0) 70%)",
          filter: "blur(1px)",
          animation: `ivy-shine ${5 * speed}s ease-in-out infinite`,
        }}
      />
      {/* thin rim to sell the glass edge */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.55)",
        }}
      />
    </div>
  );
}
