"use client";

import Image from "next/image";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { cn } from "@/lib/utils";

const PARALLAX_RANGE = 50;

export function ParallaxHeroImage({
  src,
  alt = "",
  priority = false,
  objectPosition = "object-top",
}: {
  src: string;
  alt?: string;
  priority?: boolean;
  objectPosition?: string;
}) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  const y = useTransform(
    scrollYProgress,
    [0, 1],
    prefersReducedMotion ? [0, 0] : [-PARALLAX_RANGE, PARALLAX_RANGE],
  );

  return (
    <div ref={sectionRef} className="absolute inset-0 -z-20 overflow-hidden">
      <motion.div
        style={{ y, top: -PARALLAX_RANGE * 2, bottom: -PARALLAX_RANGE * 2 }}
        className="absolute inset-x-0"
      >
        <Image
          src={src}
          alt={alt}
          fill
          priority={priority}
          sizes="100vw"
          className={cn("object-cover", objectPosition)}
        />
      </motion.div>
    </div>
  );
}
