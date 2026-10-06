"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SendMessageForm } from "@/components/inbox/send-message-form";
import { RequestMeetingForm } from "@/components/members/request-meeting-form";
import { type DirectoryMember } from "@/lib/members";
import { cn } from "@/lib/utils";

export type ComposeMode = "message" | "meeting";
type Recipient = { id: string; name: string };

async function fetchMembers(): Promise<DirectoryMember[]> {
  const response = await fetch("/api/members");
  if (!response.ok) throw new Error("Failed to load members");
  const data = (await response.json()) as { members: DirectoryMember[] };
  return data.members;
}

/**
 * /inbox/new — recipient picker plus a Message | Request a 1:1 switch,
 * rendering the same forms the Directory/Inbox dialogs use. Exists so the
 * compose flows are linkable (`?to=<memberId>&mode=meeting`), which the
 * dialogs can't be. The picker reuses `/api/members`, which already
 * excludes Friend tier and directory-opted-out members.
 */
export function NewConversationComposer({
  currentUserId,
  initialRecipient,
  initialMode,
}: {
  currentUserId: string;
  initialRecipient: Recipient | null;
  initialMode: ComposeMode;
}) {
  const [recipient, setRecipient] = useState<Recipient | null>(initialRecipient);
  const [mode, setMode] = useState<ComposeMode>(initialMode);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Bumped after "Done" so the form remounts empty for a follow-up message.
  const [formKey, setFormKey] = useState(0);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["members-for-new-conversation"],
    queryFn: fetchMembers,
  });
  const options = members.filter((member) => member.id !== currentUserId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">To</span>
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" aria-expanded={pickerOpen} className="w-full justify-between sm:w-80">
              <span className={cn("truncate", !recipient && "text-muted-foreground")}>
                {recipient ? recipient.name : isLoading ? "Loading members…" : "Choose a member…"}
              </span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search members…" />
              <CommandList>
                <CommandEmpty>No member found.</CommandEmpty>
                <CommandGroup>
                  {options.map((member) => (
                    <CommandItem
                      key={member.id}
                      value={member.name ?? member.id}
                      onSelect={() => {
                        setRecipient({ id: member.id, name: member.name ?? "Unnamed member" });
                        setFormKey((key) => key + 1);
                        setPickerOpen(false);
                      }}
                    >
                      {member.name ?? "Unnamed member"}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {recipient ? (
        <>
          <div role="tablist" aria-label="What would you like to send?" className="flex w-fit gap-1 rounded-lg bg-muted p-1">
            {(
              [
                ["message", "Message"],
                ["meeting", "Request a 1:1"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                onClick={() => setMode(value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  mode === value ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <p className="text-sm text-muted-foreground">
            {mode === "message"
              ? "Sends an asynchronous message to their Inbox — not a live chat."
              : "Sends a structured request to their Inbox — they can accept, decline, or propose a new time."}
          </p>

          {/* key: switching recipient or mode starts a fresh form rather than carrying text across. */}
          {mode === "message" ? (
            <SendMessageForm
              key={`message-${recipient.id}-${formKey}`}
              recipientId={recipient.id}
              recipientName={recipient.name}
              onDone={() => setFormKey((key) => key + 1)}
            />
          ) : (
            <RequestMeetingForm
              key={`meeting-${recipient.id}-${formKey}`}
              recipientId={recipient.id}
              recipientName={recipient.name}
              onDone={() => setFormKey((key) => key + 1)}
            />
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Choose a member to write to.</p>
      )}
    </div>
  );
}
