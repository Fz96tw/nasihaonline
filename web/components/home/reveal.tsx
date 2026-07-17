"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

const REVEAL_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

export function Reveal({
  children,
  index = 0,
  className,
  hover = false,
}: {
  children: ReactNode;
  index?: number;
  className?: string;
  hover?: boolean;
}) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={prefersReducedMotion ? false : "hidden"}
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      variants={REVEAL_VARIANTS}
      transition={{ duration: 0.5, ease: "easeOut", delay: index * 0.08 }}
      whileHover={
        hover && !prefersReducedMotion
          ? { y: -6, transition: { duration: 0.2, ease: "easeOut" } }
          : undefined
      }
      whileTap={
        hover && !prefersReducedMotion
          ? { scale: 0.98, transition: { duration: 0.1, ease: "easeOut" } }
          : undefined
      }
    >
      {children}
    </motion.div>
  );
}
