// Client-safe starter templates for the inbox compose dialog. Pure functions
// so the wording and the "only offer an overlap template when there is an
// overlap" rule are testable without rendering anything.
import type { SharedContext } from "@/lib/members";

export type MessageTemplate = {
  id: string;
  label: string;
  subject: string | null;
  body: string;
};

function listToPhrase(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || "there";
}

/**
 * Templates for a first message to `recipientName`. Overlap-based templates
 * (shared community / skill / interest) appear first and only when the
 * context actually has that overlap; the generic ones are always offered.
 */
export function buildMessageTemplates(recipientName: string, context: SharedContext | null): MessageTemplate[] {
  const hi = `Hi ${firstName(recipientName)},`;
  const templates: MessageTemplate[] = [];

  if (context && context.communities.length > 0) {
    const phrase = listToPhrase(context.communities);
    templates.push({
      id: "shared-community",
      label: `We're both in ${phrase}`,
      subject: `Fellow member in ${phrase}`,
      body: `${hi}\n\nI noticed we're both part of ${phrase} here at NASIHA, and I'd love to connect. What brought you to the community?\n\nThanks!`,
    });
  }

  if (context && context.skills.length > 0) {
    const phrase = listToPhrase(context.skills);
    templates.push({
      id: "shared-skill",
      label: `We share expertise in ${phrase}`,
      subject: `Shared expertise: ${phrase}`,
      body: `${hi}\n\nI saw that we both have experience in ${phrase}. I'd enjoy comparing notes — how are you using it these days?\n\nThanks!`,
    });
  }

  if (context && context.interests.length > 0) {
    const phrase = listToPhrase(context.interests);
    templates.push({
      id: "shared-interest",
      label: `We're both interested in ${phrase}`,
      subject: `Shared interest: ${phrase}`,
      body: `${hi}\n\nI'm also interested in ${phrase} and noticed it's on your profile too. I'd love to hear what draws you to it.\n\nThanks!`,
    });
  }

  templates.push(
    {
      id: "say-hello",
      label: "Say hello",
      subject: null,
      body: `${hi}\n\nI came across your profile in the Member Directory and wanted to say hello. It'd be great to connect!\n\nThanks!`,
    },
    {
      id: "chat",
      label: "Ask for a 20-minute chat",
      subject: "Would you be open to a quick chat?",
      body: `${hi}\n\nWould you be open to a 20-minute chat sometime in the next couple of weeks? I'd love to hear about your experience. Happy to work around your schedule.\n\nThanks!`,
    },
  );

  return templates;
}
