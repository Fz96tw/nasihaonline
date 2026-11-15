"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, type ControllerRenderProps } from "react-hook-form";
import { UserPlus, Users, X } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { sendMessageSchema, type SendMessageValues } from "@/lib/validation/inbox";
import { getCsrfToken } from "@/lib/csrf-client";
import { usePasteImageUpload } from "@/lib/use-paste-image-upload";
import type { DirectoryMember, SharedContext } from "@/lib/members";
import { MAX_GROUP_MESSAGE_PARTICIPANTS } from "@/lib/inbox";
import { buildMessageTemplates, type MessageTemplate } from "@/lib/message-templates";

type Recipient = { id: string; name: string };

async function fetchMembers(): Promise<DirectoryMember[]> {
  const response = await fetch("/api/members");
  if (!response.ok) throw new Error("Failed to load members");
  const data = (await response.json()) as { members: DirectoryMember[] };
  return data.members;
}

/**
 * The "To" row when a message can become a group message (§4.7): the
 * chosen recipients as removable chips plus an "Add people" picker over the
 * same /api/members listing as the Inbox's own picker.
 */
function RecipientsField({
  recipients,
  currentUserId,
  onChange,
}: {
  recipients: Recipient[];
  currentUserId: string;
  onChange: (next: Recipient[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: members = [] } = useQuery({
    queryKey: ["members-for-new-conversation"],
    queryFn: fetchMembers,
  });
  const chosen = new Set(recipients.map((recipient) => recipient.id));
  const options = members.filter((member) => member.id !== currentUserId && !chosen.has(member.id));
  const atCap = recipients.length + 1 >= MAX_GROUP_MESSAGE_PARTICIPANTS;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">To</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {recipients.map((recipient) => (
          <span
            key={recipient.id}
            className="flex items-center gap-1 rounded-full bg-muted py-1 pl-2.5 pr-1 text-xs font-medium"
          >
            {recipient.name}
            {recipients.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(recipients.filter((r) => r.id !== recipient.id))}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                aria-label={`Remove ${recipient.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" disabled={atCap}>
              <UserPlus className="h-3.5 w-3.5" />
              {atCap ? "Group is full" : "Add people"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
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
                        onChange([...recipients, { id: member.id, name: member.name ?? "Unnamed member" }]);
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
      </div>
      {recipients.length > 1 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          Group message — everyone listed can read and reply. Up to {MAX_GROUP_MESSAGE_PARTICIPANTS} people, you
          included.
        </p>
      )}
    </div>
  );
}

const DEFAULT_VALUES: SendMessageValues = {
  recipientId: null,
  subject: null,
  body: "",
  parentId: null,
};

/**
 * The "Message" body Textarea, split out so usePasteImageUpload (a hook) is
 * called at a real component's top level rather than inside FormField's
 * render-prop callback — same shape as new-thread-form.tsx's ThreadBodyField.
 */
function MessageBodyField({
  field,
  onImageUploadStateChange,
}: {
  field: ControllerRenderProps<SendMessageValues, "body">;
  onImageUploadStateChange: (uploading: boolean) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const insertAtCaret = useCallback(
    (markdown: string) => {
      const caret = textareaRef.current?.selectionStart ?? field.value.length;
      field.onChange(`${field.value.slice(0, caret)}${markdown}${field.value.slice(caret)}`);
    },
    [field],
  );

  const pasteImage = usePasteImageUpload({
    uploadUrl: "/api/inbox/message-image",
    value: field.value,
    onInserted: insertAtCaret,
  });

  useEffect(() => {
    onImageUploadStateChange(pasteImage.uploading);
  }, [pasteImage.uploading, onImageUploadStateChange]);

  return (
    <>
        <Textarea
          rows={5}
          name={field.name}
          value={field.value}
          onChange={(event) => field.onChange(event.target.value)}
          onBlur={field.onBlur}
          onPaste={pasteImage.onPaste}
          ref={(el) => {
            textareaRef.current = el;
            field.ref(el);
          }}
        />
        {pasteImage.uploading && <p className="mt-1 text-xs text-muted-foreground">Uploading image…</p>}
        {pasteImage.error && <p className="mt-1 text-xs text-destructive">{pasteImage.error}</p>}
    </>
  );
}

/**
 * "Start from a template" chips. Overlap-based templates (shared community /
 * skill / interest) only appear once the shared-context lookup returns
 * something; the generic ones are available immediately. Picking one fills
 * the subject/body, which stay fully editable — and anything the member has
 * already written is only replaced after they confirm.
 */
function TemplatePicker({
  recipientId,
  recipientName,
  hasCustomText,
  onApply,
}: {
  recipientId: string;
  recipientName: string;
  hasCustomText: () => boolean;
  onApply: (template: MessageTemplate) => void;
}) {
  const [context, setContext] = useState<SharedContext | null>(null);

  useEffect(() => {
    let cancelled = false;
    setContext(null);
    fetch(`/api/members/${encodeURIComponent(recipientId)}/shared-context`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { context: SharedContext } | null) => {
        if (!cancelled && data) setContext(data.context);
      })
      .catch(() => {
        // Best-effort: without context the generic templates still work.
      });
    return () => {
      cancelled = true;
    };
  }, [recipientId]);

  const templates = buildMessageTemplates(recipientName, context);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Start from a template</span>
      <div className="flex flex-wrap gap-2">
        {templates.map((template) => (
          <Button
            key={template.id}
            type="button"
            variant="outline"
            size="sm"
            className="h-auto whitespace-normal py-1.5 text-left text-xs"
            onClick={() => {
              if (hasCustomText() && !window.confirm("Replace what you've written with this template?")) return;
              onApply(template);
            }}
          >
            {template.label}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">You can edit the text before sending.</p>
    </div>
  );
}

/**
 * The compose form itself (§4.7), shared by SendMessageDialog (Directory
 * cards, Inbox picker) and the /inbox/new page. Always sends a new
 * top-level thread (parentId null) — reply composition lives in the Inbox
 * detail pane, not here. State resets by unmounting: the dialog only
 * renders this while open.
 */
export function SendMessageForm({
  recipientId,
  recipientName,
  onDone,
  groupComposer,
}: {
  recipientId: string;
  recipientName: string;
  /** Called from the post-send "Done" button. */
  onDone: () => void;
  /**
   * Set from the Inbox's own compose entry points (§4.7): lets the sender
   * add more recipients, turning the message into a group message. Left
   * unset on Directory cards, which stay single-recipient in v1.
   */
  groupComposer?: { currentUserId: string };
}) {
  const queryClient = useQueryClient();
  const [recipients, setRecipients] = useState<Recipient[]>([{ id: recipientId, name: recipientName }]);
  const isGroup = recipients.length > 1;
  const primary = recipients[0];
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  // The last template applied, so re-picking one only asks before replacing text the member wrote themselves.
  const appliedTemplate = useRef<MessageTemplate | null>(null);

  const form = useForm<SendMessageValues>({
    resolver: zodResolver(sendMessageSchema),
    defaultValues: { ...DEFAULT_VALUES, recipientId },
    mode: "onTouched",
  });

  async function onSubmit(values: SendMessageValues) {
    const subject = values.subject?.trim() ? values.subject.trim() : null;
    if (isGroup && !subject) {
      form.setError("subject", { message: "A group message needs a subject" });
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = isGroup
        ? await fetch("/api/inbox/groups", {
            method: "POST",
            headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
            body: JSON.stringify({
              recipientIds: recipients.map((recipient) => recipient.id),
              subject,
              body: values.body,
            }),
          })
        : await fetch("/api/inbox/messages", {
            method: "POST",
            headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
            body: JSON.stringify({
              recipientId: primary.id,
              subject,
              body: values.body,
              parentId: null,
            }),
          });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(
          typeof payload?.error === "string" ? payload.error : "Something went wrong. Please try again.",
        );
      }
      setSent(true);
      await queryClient.invalidateQueries({ queryKey: ["inbox-list"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
    {sent ? (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {isGroup
            ? `Group message sent to ${recipients.map((recipient) => recipient.name).join(", ")}.`
            : `Message sent to ${primary.name}.`}
        </p>
        <DialogFooter>
          <Button onClick={() => onDone()}>Done</Button>
        </DialogFooter>
      </div>
    ) : (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          {groupComposer && (
            <RecipientsField
              recipients={recipients}
              currentUserId={groupComposer.currentUserId}
              onChange={(next) => {
                setRecipients(next);
                form.clearErrors("subject");
              }}
            />
          )}

          {!isGroup && (
          <TemplatePicker
            key={primary.id}
            recipientId={primary.id}
            recipientName={primary.name}
            hasCustomText={() => {
              const { body, subject } = form.getValues();
              const applied = appliedTemplate.current;
              const bodyIsCustom = body.trim() !== "" && body !== applied?.body;
              const subjectIsCustom = (subject ?? "").trim() !== "" && subject !== applied?.subject;
              return bodyIsCustom || subjectIsCustom;
            }}
            onApply={(template) => {
              appliedTemplate.current = template;
              form.setValue("subject", template.subject, { shouldDirty: true });
              form.setValue("body", template.body, { shouldDirty: true, shouldValidate: true });
            }}
          />
          )}

          <FormField
            control={form.control}
            name="subject"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{isGroup ? "Subject" : "Subject (optional)"}</FormLabel>
                <FormControl>
                  <Input
                    value={field.value ?? ""}
                    onChange={(event) => field.onChange(event.target.value)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="body"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Message</FormLabel>
                <FormControl>
                  <MessageBodyField field={field} onImageUploadStateChange={setImageUploading} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={submitting || imageUploading}>
              {submitting ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    )}
    </>
  );
}
