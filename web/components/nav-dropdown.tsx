"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";

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

  return (
    <DropdownMenu>
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
        >
          <span className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-bold uppercase tracking-wide transition-colors group-hover:bg-muted group-hover:text-foreground group-data-[state=open]:bg-muted group-data-[state=open]:text-foreground group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2">
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
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
