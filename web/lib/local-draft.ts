// Tiny localStorage helper for composer autosave (Discussion Forum's "new
// thread" title+body and "post a reply" body) — recovers what a member was
// typing if they navigate away or close the tab before submitting. Purely a
// client-side recovery net, distinct from the server-side Save as Draft
// initiative (Library/Events): nothing here is persisted server-side or
// visible to anyone else. Never throws — a private window, cleared/blocked
// site data, or corrupted JSON should degrade to "no draft found," not break
// the composer.

export function readLocalDraft<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeLocalDraft<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Best-effort — a full/blocked store just means no autosave this time.
  }
}

export function clearLocalDraft(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Best-effort, same as writeLocalDraft.
  }
}
