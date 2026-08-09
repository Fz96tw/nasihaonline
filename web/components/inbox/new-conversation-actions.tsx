"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, MessageSquare } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SendMessageDialog } from "@/components/inbox/send-message-dialog";
import { RequestMeetingDialog } from "@/components/members/request-meeting-dialog";
import { type DirectoryMember } from "@/lib/members";

async function fetchMembers(): Promise<DirectoryMember[]> {
  const response = await fetch("/api/members");
  if (!response.ok) throw new Error("Failed to load members");
  const data = (await response.json()) as { members: DirectoryMember[] };
  return data.members;
}

type Recipient = { id: string; name: string };

function MemberPickerButton({
  label,
  icon: Icon,
  variant,
  members,
  onSelect,
  hideLabelOnMobile,
}: {
  label: string;
  icon: typeof MessageSquare;
  variant: ButtonProps["variant"];
  members: DirectoryMember[];
  onSelect: (recipient: Recipient) => void;
  hideLabelOnMobile?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant={variant} size="sm" className="gap-1.5">
          <Icon className="h-4 w-4" />
          {hideLabelOnMobile ? <span className="hidden sm:inline">{label}</span> : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <Command>
          <CommandInput placeholder="Search members…" />
          <CommandList>
            <CommandEmpty>No member found.</CommandEmpty>
            <CommandGroup>
              {members.map((member) => (
                <CommandItem
                  key={member.id}
                  value={member.name ?? member.id}
                  onSelect={() => {
                    onSelect({ id: member.id, name: member.name ?? "Unnamed member" });
                    setOpen(false);
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
  );
}

/**
 * Inbox-page shortcut into the same two compose flows as a Directory card's
 * "Send Message"/"Request Meeting" actions (§4.7/§4.5) — search-by-name
 * pickers (reusing the `/api/members` listing, which already excludes
 * Friend tier and directory-opted-out members) rather than a full Directory
 * page visit.
 */
export function NewConversationActions({ currentUserId }: { currentUserId: string }) {
  const { data: members = [] } = useQuery({
    queryKey: ["members-for-new-conversation"],
    queryFn: fetchMembers,
  });
  const options = members.filter((member) => member.id !== currentUserId);

  const [messageRecipient, setMessageRecipient] = useState<Recipient | null>(null);
  const [meetingRecipient, setMeetingRecipient] = useState<Recipient | null>(null);

  return (
    <div className="flex gap-2">
      <MemberPickerButton
        label="Message"
        icon={MessageSquare}
        variant="default"
        members={options}
        onSelect={setMessageRecipient}
        hideLabelOnMobile
      />
      <MemberPickerButton
        label="1-on-1 Meeting"
        icon={CalendarPlus}
        variant="secondary"
        members={options}
        onSelect={setMeetingRecipient}
        hideLabelOnMobile
      />

      {messageRecipient && (
        <SendMessageDialog
          recipientId={messageRecipient.id}
          recipientName={messageRecipient.name}
          open={Boolean(messageRecipient)}
          onOpenChange={(next) => {
            if (!next) setMessageRecipient(null);
          }}
        />
      )}
      {meetingRecipient && (
        <RequestMeetingDialog
          recipientId={meetingRecipient.id}
          recipientName={meetingRecipient.name}
          open={Boolean(meetingRecipient)}
          onOpenChange={(next) => {
            if (!next) setMeetingRecipient(null);
          }}
        />
      )}
    </div>
  );
}
