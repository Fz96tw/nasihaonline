import type { ReflectionQuoteModel } from "@/lib/generated/prisma/models/ReflectionQuote";
import type { ReflectionQuoteDto } from "@/lib/weekly-reflection-config";

/** DB row to the client-safe shape the admin components take (Dates become ISO strings). */
export function toReflectionQuoteDto(quote: ReflectionQuoteModel): ReflectionQuoteDto {
  return {
    id: quote.id,
    text: quote.text,
    author: quote.author,
    source: quote.source,
    prompt: quote.prompt,
    active: quote.active,
    lastPostedAt: quote.lastPostedAt?.toISOString() ?? null,
    timesPosted: quote.timesPosted,
  };
}
