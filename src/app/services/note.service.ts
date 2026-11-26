import { Injectable } from "@angular/core";

export type NoteSortOption =
  | "updatedDesc"
  | "updatedAsc"
  | "createdDesc"
  | "createdAsc"
  | "titleAsc"
  | "titleDesc";

export const DEFAULT_NOTE_SORT: NoteSortOption = "updatedDesc";

export type NoteGroupOrder = "foldersFirst" | "notesFirst";

export const DEFAULT_NOTE_GROUP_ORDER: NoteGroupOrder = "notesFirst";

const VALID_NOTE_SORTS: readonly NoteSortOption[] = [
  "updatedDesc",
  "updatedAsc",
  "createdDesc",
  "createdAsc",
  "titleAsc",
  "titleDesc",
];

const VALID_NOTE_GROUP_ORDERS: readonly NoteGroupOrder[] = [
  "foldersFirst",
  "notesFirst",
];

export interface NoteFolder {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  collapsed?: boolean;
}

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  folderId?: string | null;
}

export interface NotesStorageState {
  notes: NoteItem[];
  folders?: NoteFolder[];
  activeNoteId: string | null;
  sortBy?: NoteSortOption;
  groupOrder?: NoteGroupOrder;
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

    const hasFolders = Array.isArray(candidate.folders);
    const validFolders = hasFolders
      ? candidate
          .folders!.filter(
            (f): f is NoteFolder =>
              !!f && typeof f.id === "string" && typeof f.name === "string",
          )
          .map((f) => {
            if (f.collapsed === undefined || typeof f.collapsed === "boolean") {
              return f;
            }
            return { ...f, collapsed: Boolean(f.collapsed) };
          })
      : undefined;
    const validFolderIds = validFolders
      ? new Set(validFolders.map((f) => f.id))
      : null;

    const validNotes = candidate.notes
      .filter(
        (n): n is NoteItem =>
          !!n &&
          typeof n.id === "string" &&
          typeof n.title === "string" &&
          typeof n.content === "string",
      )
      .map((n) => {
        let next = n;
        if (n.pinned !== undefined && typeof n.pinned !== "boolean") {
          next = { ...next, pinned: Boolean(n.pinned) };
        }
        if (
          typeof n.folderId === "string" &&
          validFolderIds &&
          !validFolderIds.has(n.folderId)
        ) {
          next = { ...next, folderId: undefined };
        }
        return next;
      });
    const activeNoteId =
      typeof candidate.activeNoteId === "string" &&
      validNotes.some((n) => n.id === candidate.activeNoteId)
        ? candidate.activeNoteId
        : (validNotes[0]?.id ?? null);
    const sortBy =
      typeof candidate.sortBy === "string" &&
      VALID_NOTE_SORTS.includes(candidate.sortBy as NoteSortOption)
        ? (candidate.sortBy as NoteSortOption)
        : undefined;
    const groupOrder =
      typeof candidate.groupOrder === "string" &&
      VALID_NOTE_GROUP_ORDERS.includes(candidate.groupOrder as NoteGroupOrder)
        ? (candidate.groupOrder as NoteGroupOrder)
        : undefined;

    return {
      notes: validNotes,
      ...(validFolders ? { folders: validFolders } : {}),
      activeNoteId,
      ...(sortBy ? { sortBy } : {}),
      ...(groupOrder ? { groupOrder } : {}),
    };
  }

  public async loadNotesState(): Promise<NotesStorageState | null> {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        const result = await chrome.storage.local.get(NOTES_STORAGE_KEY);
        return this.normalizeNotesState(result?.[NOTES_STORAGE_KEY]);
      }
    } catch {
      // Ignore chrome storage errors
    }

    return null;
  }

  public async saveNotesState(state: NotesStorageState): Promise<void> {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        await chrome.storage.local.set({ [NOTES_STORAGE_KEY]: state });
      }
    } catch {
      // Ignore chrome storage errors
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
