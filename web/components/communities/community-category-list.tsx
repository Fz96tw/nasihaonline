"use client";

import { useRef, useState, type MouseEvent } from "react";
import Image from "next/image";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";

export interface CommunityWithCategories {
  id: string;
  name: string;
  description: string | null;
  image: string;
  categories: { id: string; name: string; slug: string }[];
}

const PILL_CONTAINER_VARIANTS: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const PILL_VARIANTS: Variants = {
  hidden: { opacity: 0, scale: 0.6, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};

// How close the cursor needs to get before a pill starts drifting away
// (px), and how far it drifts at the closest point. Radius must clear a
// pill's own half-width (~65-70px for longer category names) or hovering
// near a pill's edge barely registers any strength.
const MAGNET_RADIUS = 170;
const MAGNET_STRENGTH = 26;

function CategoryPillCluster({ categories }: { categories: { id: string; name: string; slug: string }[] }) {
  const prefersReducedMotion = useReducedMotion();
  const pillRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [offsets, setOffsets] = useState<{ x: number; y: number }[]>(() =>
    categories.map(() => ({ x: 0, y: 0 })),
  );

  function handleMouseMove(event: MouseEvent<HTMLDivElement>) {
    if (prefersReducedMotion) return;
    const mouseX = event.clientX;
    const mouseY = event.clientY;
    setOffsets(
      pillRefs.current.map((el) => {
        if (!el) return { x: 0, y: 0 };
        const rect = el.getBoundingClientRect();
        const dx = rect.left + rect.width / 2 - mouseX;
        const dy = rect.top + rect.height / 2 - mouseY;
        const dist = Math.hypot(dx, dy);
        if (dist === 0 || dist >= MAGNET_RADIUS) return { x: 0, y: 0 };
        const strength = ((MAGNET_RADIUS - dist) / MAGNET_RADIUS) * MAGNET_STRENGTH;
        return { x: (dx / dist) * strength, y: (dy / dist) * strength };
      }),
    );
  }

  function handleMouseLeave() {
    setOffsets(categories.map(() => ({ x: 0, y: 0 })));
  }

  return (
    <motion.div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="flex flex-wrap gap-2"
      initial={prefersReducedMotion ? false : "hidden"}
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
      variants={PILL_CONTAINER_VARIANTS}
    >
      {categories.map((category, index) => (
        <motion.span key={category.id} variants={PILL_VARIANTS} className="inline-block">
          <motion.span
            ref={(el) => {
              pillRefs.current[index] = el;
            }}
            animate={{ x: offsets[index]?.x ?? 0, y: offsets[index]?.y ?? 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="inline-block rounded-full border bg-muted px-3 py-1 text-sm font-medium text-foreground"
          >
            {category.name}
          </motion.span>
        </motion.span>
      ))}
    </motion.div>
  );
}

function CommunityRow({ community, isReversed }: { community: CommunityWithCategories; isReversed: boolean }) {
  const prefersReducedMotion = useReducedMotion();

  // Image and text slide in from opposite sides — whichever side each one
  // sits on for this row's (alternating) direction.
  const imageVariants: Variants = {
    hidden: { opacity: 0, x: isReversed ? 40 : -40 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.6, ease: "easeOut" } },
  };
  const textVariants: Variants = {
    hidden: { opacity: 0, x: isReversed ? -40 : 40 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.6, ease: "easeOut", delay: 0.1 } },
  };

  return (
    <motion.div
      initial={prefersReducedMotion ? false : "hidden"}
      whileInView="visible"
      viewport={{ once: true, amount: 0.25 }}
      className={cn(
        "flex flex-col gap-6 sm:items-center sm:gap-10",
        isReversed ? "sm:flex-row-reverse" : "sm:flex-row",
      )}
    >
      <motion.div
        variants={imageVariants}
        className="relative h-[90px] w-full shrink-0 overflow-hidden rounded-xl sm:h-[200px] sm:w-[280px]"
      >
        <Image src={community.image} alt="" fill sizes="(min-width: 640px) 280px, 100vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/5 to-transparent" />
      </motion.div>
      <motion.div variants={textVariants} className="flex flex-1 flex-col gap-3">
        <div>
          <h3 className="text-2xl font-bold">{community.name}</h3>
          <p className="mt-1 text-lg leading-[1.7] text-muted-foreground">
            {community.description ?? "No description yet."}
          </p>
        </div>
        {community.categories.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-bold uppercase tracking-[.1em] text-primary">Topics</p>
            <CategoryPillCluster categories={community.categories} />
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

export function CommunityCategoryList({ communities }: { communities: CommunityWithCategories[] }) {
  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-14">
      {communities.map((community, index) => (
        <CommunityRow key={community.id} community={community} isReversed={index % 2 === 1} />
      ))}
    </div>
  );
}
