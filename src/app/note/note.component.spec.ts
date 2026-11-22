import { ComponentFixture, TestBed } from "@angular/core/testing";
import { Title } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { BehaviorSubject } from "rxjs";
import { vi } from "vitest";
import {
  NoteComponent,
  NOTES_STORAGE_KEY,
  NotesStorageState,
} from "./note.component";
import { I18nService } from "@app/services/i18n.service";
import { SettingsService } from "@app/services/settings.service";

describe("NoteComponent", () => {
  let fixture: ComponentFixture<NoteComponent>;
  let component: NoteComponent;
  let titleService: Title;
  let i18nService: I18nService;
  let chromeStore: Record<string, unknown>;
  let storageChangeListeners: Array<
    (changes: Record<string, { newValue?: unknown }>, areaName: string) => void
  >;

  beforeEach(async () => {
    localStorage.clear();
    document.title = "New Tab";
    chromeStore = {};
    storageChangeListeners = [];

    const chromeAny = (globalThis as unknown as { chrome: any }).chrome;
    chromeAny.storage.local.get.mockImplementation((key: string) =>
      Promise.resolve(key in chromeStore ? { [key]: chromeStore[key] } : {}),
    );
    chromeAny.storage.local.set.mockImplementation(
      (items: Record<string, unknown>) => {
        Object.assign(chromeStore, items);
        return Promise.resolve();
      },
    );
    chromeAny.storage.onChanged = {
      addListener: vi.fn((cb) => {
        storageChangeListeners.push(cb);
      }),
      removeListener: vi.fn((cb) => {
        storageChangeListeners = storageChangeListeners.filter((l) => l !== cb);
      }),
    };

    await TestBed.configureTestingModule({
      imports: [NoteComponent],
      providers: [
        provideRouter([]),
        {
          provide: SettingsService,
          useValue: {
            settingsSource: new BehaviorSubject({ theme: "light" }),
          },
        },
      ],
    }).compileComponents();

    titleService = TestBed.inject(Title);
    i18nService = TestBed.inject(I18nService);

    fixture = TestBed.createComponent(NoteComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
  });

  it("should set page title to note title and restore previous title on destroy", () => {
    expect(titleService.getTitle()).toBe(i18nService.t("toolNote"));

    const editorTitleInput = fixture.nativeElement.querySelector(
      "section input",
    ) as HTMLInputElement;
    editorTitleInput.value = "Project Plan";
    editorTitleInput.dispatchEvent(new Event("input"));
    fixture.detectChanges();
    expect(titleService.getTitle()).toBe(
      `Project Plan - ${i18nService.t("toolNote")}`,
    );

    i18nService.setLanguage("zh_CN");
    fixture.detectChanges();
    expect(titleService.getTitle()).toBe(
      `Project Plan - ${i18nService.t("toolNote")}`,
    );

    fixture.destroy();
    expect(titleService.getTitle()).toBe("New Tab");
  });

  it("should initialize with one empty note and persist it to chrome.storage.local", () => {
    expect(component.notes().length).toBe(1);
    expect(component.activeNote()).toBeTruthy();

    const stored = chromeStore[NOTES_STORAGE_KEY] as NotesStorageState;
    expect(stored.notes.length).toBe(1);
    expect(stored.activeNoteId).toBe(component.activeNoteId());
  });

  it("should debounce title and plain-text content changes and flush on destroy", () => {
    vi.useFakeTimers();
    const chromeAny = (globalThis as unknown as { chrome: any }).chrome;
    chromeAny.storage.local.set.mockClear();

    const titleInput = fixture.nativeElement.querySelector(
      'input[type="text"]:not([placeholder*="Search"])',
    ) as HTMLInputElement;
    const textarea = fixture.nativeElement.querySelector(
      "textarea",
    ) as HTMLTextAreaElement;

    // Locate the note title input inside the editor section
    const editorTitleInput = fixture.nativeElement.querySelector(
      "section input",
    ) as HTMLInputElement;
    expect(editorTitleInput).toBeTruthy();
    expect(titleInput).toBeTruthy();

    editorTitleInput.value = "Shopping List";
    editorTitleInput.dispatchEvent(new Event("input"));

    textarea.value = "Milk\nBread\nEggs";
    textarea.dispatchEvent(new Event("input"));
    fixture.detectChanges();

    // Debounced: should not write synchronously on every keystroke
    expect(chromeAny.storage.local.set).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(chromeAny.storage.local.set).toHaveBeenCalledTimes(1);

    const stored = chromeStore[NOTES_STORAGE_KEY] as NotesStorageState;
    expect(stored.notes[0].title).toBe("Shopping List");
    expect(stored.notes[0].content).toBe("Milk\nBread\nEggs");

    // Verify pending edit flushes immediately on destroy
    textarea.value = "Milk\nBread\nEggs\nButter";
    textarea.dispatchEvent(new Event("input"));
    expect(chromeAny.storage.local.set).toHaveBeenCalledTimes(1);

    fixture.destroy();
    expect(chromeAny.storage.local.set).toHaveBeenCalledTimes(2);
    const flushed = chromeStore[NOTES_STORAGE_KEY] as NotesStorageState;
    expect(flushed.notes[0].content).toBe("Milk\nBread\nEggs\nButter");
    vi.useRealTimers();
  });

  it("should create, switch, filter, and delete notes with confirmation for non-empty notes", async () => {
    const initialId = component.activeNoteId();
    component.createNote();
    fixture.detectChanges();

    expect(component.notes().length).toBe(2);
    const secondId = component.activeNoteId();
    expect(secondId).not.toBe(initialId);

    const editorTitleInput = fixture.nativeElement.querySelector(
      "section input",
    ) as HTMLInputElement;
    editorTitleInput.value = "Meeting Notes";
    editorTitleInput.dispatchEvent(new Event("input"));
    fixture.detectChanges();

    component.searchQuery.set("Meeting");
    expect(component.filteredNotes().length).toBe(1);
    expect(component.filteredNotes()[0].id).toBe(secondId);

    component.clearSearch();
    component.selectNote(initialId!);
    expect(component.activeNoteId()).toBe(initialId);

    // Non-empty note requires confirmation modal
    await component.deleteNote(secondId!);
    fixture.detectChanges();
    const confirmModal = fixture.nativeElement.querySelector(
      "app-confirm-modal",
    ) as HTMLElement | null;
    expect(confirmModal).toBeTruthy();
    expect(component.notes().length).toBe(2);

    // Confirm deletion
    const confirmBtn = confirmModal!.querySelector(
      "button.btn-error",
    ) as HTMLButtonElement;
    confirmBtn.click();
    fixture.detectChanges();

    expect(component.notes().length).toBe(1);
    expect(component.activeNoteId()).toBe(initialId);

    // Empty note deletes immediately without confirmation, creating a fresh empty note
    await component.deleteNote(initialId!);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector("app-confirm-modal")).toBeNull();
    expect(component.notes().length).toBe(1);
    expect(component.activeNoteId()).not.toBe(initialId);
  });

  it("should sync notes when chrome.storage.onChanged fires from another tab", () => {
    const externalState: NotesStorageState = {
      notes: [
        {
          id: "ext-1",
          title: "Synced Note",
          content: "From another tab",
          createdAt: 1000,
          updatedAt: 2000,
        },
      ],
      activeNoteId: "ext-1",
    };
    chromeStore[NOTES_STORAGE_KEY] = externalState;

    for (const listener of storageChangeListeners) {
      listener({ [NOTES_STORAGE_KEY]: { newValue: externalState } }, "local");
    }
    fixture.detectChanges();

    expect(component.notes().length).toBe(1);
    expect(component.activeNote()?.title).toBe("Synced Note");
    expect(component.activeNote()?.content).toBe("From another tab");
  });

  it("should apply language from settingsSource", () => {
    const settingsService = TestBed.inject(SettingsService) as unknown as {
      settingsSource: BehaviorSubject<{ theme: string; language?: string }>;
    };
    settingsService.settingsSource.next({ theme: "dark", language: "zh_CN" });
    fixture.detectChanges();

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(i18nService.t("toolNote")).toBe("笔记");
  });
});
