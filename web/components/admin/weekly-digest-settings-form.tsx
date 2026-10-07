"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCsrfToken } from "@/lib/csrf-client";
import { Textarea } from "@/components/ui/textarea";
import {
  WEEKLY_DIGEST_EMAIL_INTRO_MAX,
  WEEKLY_DIGEST_EMAIL_SUBJECT_MAX,
  WEEKDAY_LABELS,
  WEEKLY_DIGEST_SECTIONS,
  WEEKLY_DIGEST_TIMEZONES,
  type WeeklyDigestSettings,
} from "@/lib/weekly-digest-config";

function formatHour(hour: number) {
  const suffix = hour < 12 ? "AM" : "PM";
  return `${hour % 12 === 0 ? 12 : hour % 12}:00 ${suffix}`;
}

function SwitchRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex flex-row items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function NumberRow({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  min: number;
  max: number;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-row items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      <Input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 flex-shrink-0"
      />
    </div>
  );
}

/**
 * Admin controls for the weekly activity digest (SiteSettings.weeklyDigest*
 * — see that schema comment). Saved as one PATCH of only the changed fields
 * to /api/admin/settings, like the other admin settings forms.
 */
export function WeeklyDigestSettingsForm({ initial }: { initial: WeeklyDigestSettings }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [privateCountMin, setPrivateCountMin] = useState(String(initial.weeklyDigestPrivateCountMin));
  const [lapsedDays, setLapsedDays] = useState(String(initial.weeklyDigestLapsedDays));
  const [maxEmails, setMaxEmails] = useState(String(initial.weeklyDigestMaxEmailsPerMember));
  const [emailSubject, setEmailSubject] = useState(initial.weeklyDigestEmailSubject);
  const [emailIntro, setEmailIntro] = useState(initial.weeklyDigestEmailIntro);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof WeeklyDigestSettings>(key: K, value: WeeklyDigestSettings[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const numbers = {
    weeklyDigestPrivateCountMin: Number(privateCountMin),
    weeklyDigestLapsedDays: Number(lapsedDays),
    weeklyDigestMaxEmailsPerMember: Number(maxEmails),
  };
  const numbersValid =
    Number.isInteger(numbers.weeklyDigestPrivateCountMin) &&
    numbers.weeklyDigestPrivateCountMin >= 1 &&
    numbers.weeklyDigestPrivateCountMin <= 20 &&
    Number.isInteger(numbers.weeklyDigestLapsedDays) &&
    numbers.weeklyDigestLapsedDays >= 1 &&
    numbers.weeklyDigestLapsedDays <= 365 &&
    Number.isInteger(numbers.weeklyDigestMaxEmailsPerMember) &&
    numbers.weeklyDigestMaxEmailsPerMember >= 1 &&
    numbers.weeklyDigestMaxEmailsPerMember <= 20;

  const textValid = emailSubject.trim().length > 0 && emailIntro.trim().length > 0;
  const next: WeeklyDigestSettings = {
    ...values,
    ...numbers,
    weeklyDigestEmailSubject: emailSubject.trim(),
    weeklyDigestEmailIntro: emailIntro.trim(),
  };
  const changed = (Object.keys(initial) as (keyof WeeklyDigestSettings)[]).filter((key) => next[key] !== initial[key]);

  async function save() {
    if (!numbersValid || !textValid || changed.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(Object.fromEntries(changed.map((key) => [key, next[key]]))),
      });
      if (!res.ok) throw new Error("Failed to update weekly digest settings");
      router.refresh();
    } catch {
      setError("Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
          <CardDescription>
            When the digest is generated. It covers the seven days before it runs. If nothing happened, no post or emails are sent. Leave it off on the
            test instance so only the live site posts one.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SwitchRow
            label="Weekly digest"
            hint="Generate a digest announcement every week."
            checked={values.weeklyDigestEnabled}
            onChange={(v) => set("weeklyDigestEnabled", v)}
          />
          <div className="flex flex-wrap gap-3">
            <Select
              value={String(values.weeklyDigestDayOfWeek)}
              onValueChange={(v) => set("weeklyDigestDayOfWeek", Number(v))}
            >
              <SelectTrigger className="w-40" aria-label="Day of week">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAY_LABELS.map((label, index) => (
                  <SelectItem key={label} value={String(index)}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(values.weeklyDigestHour)} onValueChange={(v) => set("weeklyDigestHour", Number(v))}>
              <SelectTrigger className="w-32" aria-label="Hour">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 24 }, (_, hour) => (
                  <SelectItem key={hour} value={String(hour)}>
                    {formatHour(hour)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={values.weeklyDigestTimezone} onValueChange={(v) => set("weeklyDigestTimezone", v)}>
              <SelectTrigger className="w-56" aria-label="Time zone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKLY_DIGEST_TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <SwitchRow
            label="Publish automatically"
            hint="Off: the digest is saved as a draft for an admin to review and publish."
            checked={values.weeklyDigestAutoPublish}
            onChange={(v) => set("weeklyDigestAutoPublish", v)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What&apos;s included</CardTitle>
          <CardDescription>
            Public items link to their page. Restricted items and private activity are only ever shown
            as totals.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {WEEKLY_DIGEST_SECTIONS.map((section) => (
            <SwitchRow
              key={section.key}
              label={section.label}
              hint={section.hint}
              checked={values[section.key]}
              onChange={(v) => set(section.key, v)}
            />
          ))}
          <NumberRow
            label="Smallest private total to show"
            hint="A private count below this is folded into a general line, so one item can't be picked out."
            value={privateCountMin}
            min={1}
            max={20}
            onChange={setPrivateCountMin}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email to inactive members</CardTitle>
          <CardDescription>
            A short teaser email pointing to the digest, for members who haven&apos;t been active
            recently. Everyone else sees the digest in their feed. Uses the daily email quota.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SwitchRow
            label="Email inactive members"
            hint="Members who have never signed in are skipped."
            checked={values.weeklyDigestEmailLapsed}
            onChange={(v) => set("weeklyDigestEmailLapsed", v)}
          />
          <NumberRow
            label="Inactive after (days)"
            hint="Days since a member was last active."
            value={lapsedDays}
            min={1}
            max={365}
            onChange={setLapsedDays}
          />
          <NumberRow
            label="Emails before pausing"
            hint="Stop emailing a member after this many digests in a row without them returning."
            value={maxEmails}
            min={1}
            max={20}
            onChange={setMaxEmails}
          />
          <div className="flex flex-col gap-2">
            <label htmlFor="digest-email-subject" className="text-sm font-medium">
              Email subject
            </label>
            <Input
              id="digest-email-subject"
              value={emailSubject}
              maxLength={WEEKLY_DIGEST_EMAIL_SUBJECT_MAX}
              onChange={(e) => setEmailSubject(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="digest-email-intro" className="text-sm font-medium">
              Email introduction
            </label>
            <Textarea
              id="digest-email-intro"
              rows={4}
              value={emailIntro}
              maxLength={WEEKLY_DIGEST_EMAIL_INTRO_MAX}
              onChange={(e) => setEmailIntro(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Use {"{firstName}"} to greet each member by name. The highlights, a visit button, a link to the
              full digest and an unsubscribe link are added automatically.
            </p>
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={save} disabled={saving || !numbersValid || !textValid || changed.length === 0} className="self-start">
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
