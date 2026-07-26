/**
 * Meeting request times have no explicit timezone picker — proposedTimes
 * are entered/displayed in whatever timezone the viewer's own device is
 * set to (see createMeetingRequestSchema's doc comment). This surfaces
 * that implicit zone as a short label (e.g. "EDT") so sender/recipient in
 * different zones aren't left guessing which one a bare time means.
 */
export function getLocalTimeZoneAbbreviation(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).formatToParts(date);
  return parts.find((part) => part.type === "timeZoneName")?.value ?? "";
}
