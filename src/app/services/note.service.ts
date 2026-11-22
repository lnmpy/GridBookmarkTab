import { Injectable } from "@angular/core";

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface NotesStorageState {
  notes: NoteItem[];
  activeNoteId: string | null;
}

export const NOTES_STORAGE_KEY = "gbk_notes_v1";

@Injectable({
  providedIn: "root",
})
export class NoteService {
  public normalizeNotesState(raw: unknown): NotesStorageState | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return null;
    }
    const candidate = raw as Partial<NotesStorageState>;
    if (!Array.isArray(candidate.notes)) {
      return null;
    }

    const validNotes = candidate.notes.filter(
      (n): n is NoteItem =>
        !!n &&
        typeof n.id === "string" &&
        typeof n.title === "string" &&
        typeof n.content === "string",
    );
    const activeNoteId =
      typeof candidate.activeNoteId === "string" &&
      validNotes.some((n) => n.id === candidate.activeNoteId)
        ? candidate.activeNoteId
        : (validNotes[0]?.id ?? null);

    return {
      notes: validNotes,
      activeNoteId,
    };
  }

  private readLegacyLocalStorage(): NotesStorageState | null {
    try {
      if (typeof localStorage !== "undefined") {
        const raw = localStorage.getItem(NOTES_STORAGE_KEY);
        if (raw) {
          return this.normalizeNotesState(JSON.parse(raw));
        }
      }
    } catch {
      // Ignore malformed localStorage state
    }
    return null;
  }

  private removeLegacyLocalStorage(): void {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(NOTES_STORAGE_KEY);
      }
    } catch {
      // Ignore localStorage removal errors
    }
  }

  public async loadNotesState(): Promise<NotesStorageState | null> {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        const result = await chrome.storage.local.get(NOTES_STORAGE_KEY);
        const fromChrome = this.normalizeNotesState(
          result?.[NOTES_STORAGE_KEY],
        );

        if (fromChrome && fromChrome.notes.length > 0) {
          this.removeLegacyLocalStorage();
          return fromChrome;
        }

        // Migrate existing notes from localStorage on first read
        const legacy = this.readLegacyLocalStorage();
        if (legacy && legacy.notes.length > 0) {
          await chrome.storage.local.set({ [NOTES_STORAGE_KEY]: legacy });
          this.removeLegacyLocalStorage();
          return legacy;
        }

        return fromChrome;
      }
    } catch {
      // Ignore chrome storage errors and fall back to localStorage
    }

    return this.readLegacyLocalStorage();
  }

  public async saveNotesState(state: NotesStorageState): Promise<void> {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        await chrome.storage.local.set({ [NOTES_STORAGE_KEY]: state });
        this.removeLegacyLocalStorage();
        return;
      }
    } catch {
      // Ignore chrome storage errors and fall back to localStorage
    }

    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(state));
      }
    } catch {
      // Ignore storage quota errors
    }
  }

  public async importNotesState(rawNotes: unknown): Promise<void> {
    const normalized = this.normalizeNotesState(rawNotes);
    if (!normalized) {
      return;
    }
    await this.saveNotesState(normalized);
  }
}
