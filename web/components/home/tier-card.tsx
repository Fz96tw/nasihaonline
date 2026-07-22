"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/home/reveal";
import type { MembershipTier } from "@/lib/membership-tiers";

export function TierCard({
  tier,
  index,
  compact = false,
}: {
  tier: MembershipTier;
  index: number;
  compact?: boolean;
}) {
  const [flipped, setFlipped] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  function toggle() {
    setFlipped((current) => !current);
  }

  const faceClasses = cn(
    "absolute inset-0 flex h-full flex-col overflow-hidden rounded-[10px] bg-gradient-to-br text-primary-foreground [backface-visibility:hidden]",
    compact ? "p-4" : "p-6",
  );

  return (
    <Reveal index={index} className="h-full">
      <div
        role="button"
        tabIndex={0}
        aria-pressed={flipped}
        aria-label={`${tier.name}: show ${flipped ? "overview" : "access details"}`}
        className={cn(
          "h-full cursor-pointer [perspective:1200px]",
          compact ? "min-h-[160px]" : "min-h-[280px]",
        )}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggle();
          }
        }}
      >
        <motion.div
          className="relative h-full [transform-style:preserve-3d]"
          animate={{ rotateY: !prefersReducedMotion && flipped ? 180 : 0 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
        >
          <div className={cn(faceClasses, tier.gradient)}>
            <div
              aria-hidden="true"
              className={cn(
                "absolute rounded-full bg-primary-foreground/10",
                compact ? "-right-4 -top-4 h-14 w-14" : "-right-6 -top-6 h-24 w-24",
              )}
            />
            <div className="relative">
              <h3
                className={cn(
                  "font-semibold text-primary-foreground",
                  compact ? "text-base" : "text-3xl",
                )}
              >
                {tier.name}
              </h3>
              {compact ? (
                <p className="mt-1 text-xs leading-relaxed text-primary-foreground/90">
                  {tier.tagline}
                </p>
              ) : (
                <p className="mt-1 text-xl text-primary-foreground/75">{tier.tagline}</p>
              )}
            </div>
            <p
              className={cn(
                "relative mt-auto font-medium text-primary-foreground/70",
                compact ? "pt-2 text-xs" : "pt-4 text-sm",
              )}
            >
              Tap for details →
            </p>
          </div>

          <div className={cn(faceClasses, tier.gradient, "[transform:rotateY(180deg)]")}>
            {!compact && (
              <p className="relative text-base leading-relaxed text-primary-foreground/90">
                {tier.description}
              </p>
            )}
            <p
              className={cn(
                "relative leading-relaxed text-primary-foreground/90",
                compact ? "mt-1 text-xs" : "mt-4 text-base",
              )}
            >
              {tier.access}
            </p>
            {!compact && (
              <p className="relative mt-4 text-base leading-relaxed text-primary-foreground/90">
                {tier.detail}
              </p>
            )}
            <p
              className={cn(
                "relative mt-auto font-medium text-primary-foreground/70",
                compact ? "pt-2 text-xs" : "pt-4 text-sm",
              )}
            >
              ← Flip back
            </p>
          </div>
        </motion.div>
      </div>
    </Reveal>
  );
}
