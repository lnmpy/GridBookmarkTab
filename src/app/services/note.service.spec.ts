import { TestBed } from "@angular/core/testing";
import {
  NoteService,
  NOTES_STORAGE_KEY,
  NotesStorageState,
} from "./note.service";

describe("NoteService", () => {
  let service: NoteService;
  let store: Record<string, unknown>;

  beforeEach(() => {
    localStorage.clear();
    store = {};

    const chromeAny = (globalThis as unknown as { chrome: any }).chrome;
    chromeAny.storage.local.get.mockImplementation((key: string) =>
      Promise.resolve(key in store ? { [key]: store[key] } : {}),
    );
    chromeAny.storage.local.set.mockImplementation(
      (items: Record<string, unknown>) => {
        Object.assign(store, items);
        return Promise.resolve();
      },
    );

    TestBed.configureTestingModule({});
    service = TestBed.inject(NoteService);
  });

  it("migrates notes from localStorage to chrome.storage.local on first read", async () => {
    const legacyState: NotesStorageState = {
      notes: [
        {
          id: "legacy-1",
          title: "Legacy Note",
          content: "Stored in localStorage",
          createdAt: 100,
          updatedAt: 200,
        },
      ],
      activeNoteId: "legacy-1",
    };
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(legacyState));

    const loaded = await service.loadNotesState();

    expect(loaded).toEqual(legacyState);
    expect(store[NOTES_STORAGE_KEY]).toEqual(legacyState);
    expect(localStorage.getItem(NOTES_STORAGE_KEY)).toBeNull();
  });

  it("prefers chrome.storage.local when notes already exist there", async () => {
    const chromeState: NotesStorageState = {
      notes: [
        {
          id: "chrome-1",
          title: "Chrome Note",
          content: "Primary",
          createdAt: 300,
          updatedAt: 400,
        },
      ],
      activeNoteId: "chrome-1",
    };
    const legacyState: NotesStorageState = {
      notes: [
        {
          id: "legacy-1",
          title: "Old",
          content: "Old",
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      activeNoteId: "legacy-1",
    };

    store[NOTES_STORAGE_KEY] = chromeState;
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(legacyState));

    const loaded = await service.loadNotesState();

    expect(loaded).toEqual(chromeState);
    expect(localStorage.getItem(NOTES_STORAGE_KEY)).toBeNull();
  });

  it("saves notes to chrome.storage.local and removes legacy localStorage key", async () => {
    localStorage.setItem(NOTES_STORAGE_KEY, "stale");
    const nextState: NotesStorageState = {
      notes: [
        {
          id: "n-1",
          title: "New",
          content: "Body",
          createdAt: 10,
          updatedAt: 20,
        },
      ],
      activeNoteId: "n-1",
    };

    await service.saveNotesState(nextState);

    expect(store[NOTES_STORAGE_KEY]).toEqual(nextState);
    expect(localStorage.getItem(NOTES_STORAGE_KEY)).toBeNull();
  });
});
