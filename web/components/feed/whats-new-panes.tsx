"use client";

import { useState, type ReactNode } from "react";
import { FollowingFeed } from "@/components/feed/following-feed";
import { PaneSlider } from "@/components/shared/pane-slider";

/**
 * What's New as two sliding panes — the full feed ("All") and "Following"
 * (only members the viewer follows). The slide/tabs/swipe behavior lives in
 * the shared PaneSlider. Only rendered for members who follow at least one
 * person, outside search.
 */
export function WhatsNewPanes({
  header,
  allPaneControls,
  allPane,
  currentUserId,
}: {
  /** The title — the tabs sit to its right. */
  header: ReactNode;
  /** Controls under the title that only apply to the All pane (the "Show only my communities" checkbox) — hidden on Following. */
  allPaneControls?: ReactNode;
  /** The ordinary feed: type pills + list. Server-rendered by the page. */
  allPane: ReactNode;
  currentUserId: string;
}) {
  const [active, setActive] = useState("all");

  return (
    <PaneSlider
      idPrefix="whats-new"
      tabsLabel="What's New view"
      value={active}
      onValueChange={setActive}
      panes={[
        { id: "all", label: "All", content: allPane },
        {
          id: "following",
          label: "Following",
          content: <FollowingFeed active={active === "following"} currentUserId={currentUserId} />,
        },
      ]}
      renderTabs={({ tabs, active: current }) => (
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            {header}
            {current === "all" && allPaneControls}
          </div>
          {tabs}
        </div>
      )}
    />
  );
}
