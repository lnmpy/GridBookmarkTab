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

  it("returns null when chrome.storage.local has no notes", async () => {
    const loaded = await service.loadNotesState();

    expect(loaded).toBeNull();
  });

  it("loads notes from chrome.storage.local", async () => {
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

    store[NOTES_STORAGE_KEY] = chromeState;

    const loaded = await service.loadNotesState();

    expect(loaded).toEqual(chromeState);
  });

  it("saves notes to chrome.storage.local", async () => {
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
  });

  it("normalizes pinned flags and valid sortBy options", () => {
    const valid = service.normalizeNotesState({
      notes: [
        {
          id: "n-1",
          title: "Pinned",
          content: "Body",
          createdAt: 10,
          updatedAt: 20,
          pinned: true,
        },
        {
          id: "n-2",
          title: "Unpinned",
          content: "Body",
          createdAt: 15,
          updatedAt: 25,
        },
      ],
      activeNoteId: "n-1",
      sortBy: "titleAsc",
    });

    expect(valid?.sortBy).toBe("titleAsc");
    expect(valid?.notes[0].pinned).toBe(true);
    expect(valid?.notes[1].pinned).toBeUndefined();

    const invalidSort = service.normalizeNotesState({
      notes: [
        {
          id: "n-1",
          title: "Note",
          content: "",
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      activeNoteId: "n-1",
      sortBy: "invalidOption",
    });

    expect(invalidSort?.sortBy).toBeUndefined();
  });

  it("normalizes folders and clears orphaned note folderId references", () => {
    const normalized = service.normalizeNotesState({
      folders: [
        {
          id: "f-1",
          name: "Work",
          createdAt: 10,
          updatedAt: 20,
          collapsed: true,
        },
      ],
      notes: [
        {
          id: "n-1",
          title: "In Work",
          content: "",
          createdAt: 10,
          updatedAt: 20,
          folderId: "f-1",
        },
        {
          id: "n-2",
          title: "Orphaned",
          content: "",
          createdAt: 10,
          updatedAt: 20,
          folderId: "f-missing",
        },
      ],
      activeNoteId: "n-1",
      groupOrder: "notesFirst",
    });

    expect(normalized?.folders?.length).toBe(1);
    expect(normalized?.folders?.[0].collapsed).toBe(true);
    expect(normalized?.notes[0].folderId).toBe("f-1");
    expect(normalized?.notes[1].folderId).toBeUndefined();
    expect(normalized?.groupOrder).toBe("notesFirst");

    const invalidGroupOrder = service.normalizeNotesState({
      notes: [
        {
          id: "n-1",
          title: "Note",
          content: "",
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      activeNoteId: "n-1",
      groupOrder: "invalid",
    });
    expect(invalidGroupOrder?.groupOrder).toBeUndefined();
  });
});
