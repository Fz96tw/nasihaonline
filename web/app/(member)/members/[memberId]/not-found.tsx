import { UserX } from "lucide-react";
import { BackLink } from "@/components/back-link";

/**
 * Segment-scoped 404 for /members/[memberId] — deliberately the same
 * message whether the id doesn't exist at all or belongs to a real member
 * who isn't Directory-listed (getDirectoryMemberById returns null for both,
 * same rationale). Keeping it generic means this page can't be used to
 * fingerprint which ids belong to real members.
 */
export default function MemberNotFound() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-8">
      <BackLink fallbackHref="/members" />

      <div className="flex flex-col items-center gap-3 rounded-[10px] border p-12 text-center">
        <UserX className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-lg font-medium">This member isn&apos;t listed in the Directory</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          They may have opted out of the Member Directory, or this profile isn&apos;t available.
        </p>
      </div>
    </main>
  );
}
