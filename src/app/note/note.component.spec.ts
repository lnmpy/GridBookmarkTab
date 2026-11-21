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

  beforeEach(async () => {
    localStorage.clear();
    document.title = "New Tab";

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

  it("should initialize with one empty note and persist it to localStorage", () => {
    expect(component.notes().length).toBe(1);
    expect(component.activeNote()).toBeTruthy();

    const stored = JSON.parse(
      localStorage.getItem(NOTES_STORAGE_KEY) ?? "{}",
    ) as NotesStorageState;
    expect(stored.notes.length).toBe(1);
    expect(stored.activeNoteId).toBe(component.activeNoteId());
  });

  it("should persist title and plain-text content changes to localStorage", () => {
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

    const stored = JSON.parse(
      localStorage.getItem(NOTES_STORAGE_KEY) ?? "{}",
    ) as NotesStorageState;
    expect(stored.notes[0].title).toBe("Shopping List");
    expect(stored.notes[0].content).toBe("Milk\nBread\nEggs");
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

  it("should sync notes when storage event fires from another tab", () => {
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
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(externalState));

    window.dispatchEvent(
      new StorageEvent("storage", { key: NOTES_STORAGE_KEY }),
    );
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
