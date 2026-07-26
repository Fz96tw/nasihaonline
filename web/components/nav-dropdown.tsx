"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";

const HOVER_CLOSE_DELAY_MS = 200;

export function NavDropdown({
  label,
  align = "start",
  children,
}: {
  label: string;
  align?: "start" | "center" | "end";
  children: React.ReactNode;
}) {
  const closedViaPointerRef = React.useRef(false);
  const closeTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = React.useState(false);

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const openOnHover = () => {
    closedViaPointerRef.current = true;
    clearCloseTimeout();
    setOpen(true);
  };

  const scheduleCloseOnHover = () => {
    closedViaPointerRef.current = true;
    clearCloseTimeout();
    closeTimeoutRef.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS);
  };

  React.useEffect(() => clearCloseTimeout, []);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="group flex h-full items-center self-stretch px-1 outline-none"
          onPointerDown={() => {
            closedViaPointerRef.current = true;
          }}
          onKeyDown={() => {
            closedViaPointerRef.current = false;
          }}
          onMouseEnter={openOnHover}
          onMouseLeave={scheduleCloseOnHover}
        >
          <span className="flex items-center gap-1 rounded-md px-3 py-1.5 text-base font-bold uppercase tracking-wide transition-colors group-hover:bg-muted group-hover:text-foreground group-data-[state=open]:bg-muted group-data-[state=open]:text-foreground group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2">
            {label}
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        sideOffset={0}
        className="rounded-t-none border-t-0"
        onCloseAutoFocus={(event) => {
          if (closedViaPointerRef.current) {
            event.preventDefault();
          }
        }}
        onMouseEnter={openOnHover}
        onMouseLeave={scheduleCloseOnHover}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
