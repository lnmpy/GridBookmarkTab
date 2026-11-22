import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  OnInit,
  signal,
  ViewChild,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Title } from "@angular/platform-browser";
import { Router } from "@angular/router";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  heroArrowLeft,
  heroBars3,
  heroMagnifyingGlass,
  heroPlus,
  heroTrash,
  heroXMark,
} from "@ng-icons/heroicons/outline";
import { ModalHostComponent } from "@app/components/modal-host/modal-host.component";
import { I18nService } from "@app/services/i18n.service";
import { ModalService } from "@app/services/modal.service";
import { SettingsService } from "@app/services/settings.service";
import {
  NoteItem,
  NoteService,
  NOTES_STORAGE_KEY,
  NotesStorageState,
} from "@app/services/note.service";

export type { NoteItem, NotesStorageState };
export { NOTES_STORAGE_KEY };

function generateNoteId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `note_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function createEmptyNote(now = Date.now()): NoteItem {
  return {
    id: generateNoteId(),
    title: "",
    content: "",
    createdAt: now,
    updatedAt: now,
  };
}

@Component({
  selector: "app-note",
  standalone: true,
  imports: [NgIcon, ModalHostComponent],
  providers: [
    provideIcons({
      heroArrowLeft,
      heroBars3,
      heroMagnifyingGlass,
      heroPlus,
      heroTrash,
      heroXMark,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      .note-editor-textarea {
        font-family:
          ui-sans-serif,
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          Roboto,
          sans-serif;
        font-size: 15px;
        line-height: 1.7;
      }
    `,
  ],
  template: `
    <div
      class="min-h-screen h-screen flex flex-col bg-base-200 text-base-content px-4 sm:px-6 md:px-10 lg:px-12 py-3 overflow-hidden"
    >
      <!-- Top Header -->
      <header
        class="shrink-0 flex items-center justify-between gap-3 pb-2.5 select-none"
      >
        <div class="flex items-center gap-2 min-w-0">
          <button
            type="button"
            class="surface-quiet elev-1 h-7 px-2.5 rounded-lg flex items-center gap-1 text-xs text-ink-2 hover:text-base-content hover:bg-chip transition-colors cursor-pointer shrink-0"
            (click)="goBack()"
          >
            <ng-icon name="heroArrowLeft" class="w-3.5 h-3.5" />
            <span>{{ i18n.t("back") }}</span>
          </button>

          <button
            type="button"
            class="surface-quiet elev-1 h-7 w-7 rounded-lg grid place-items-center text-ink-2 hover:text-base-content hover:bg-chip transition-colors cursor-pointer shrink-0"
            (click)="toggleSidebar()"
            [title]="i18n.t('noteToggleSidebar')"
            [attr.aria-label]="i18n.t('noteToggleSidebar')"
          >
            <ng-icon name="heroBars3" class="w-3.5 h-3.5" />
          </button>

          <h1 class="text-sm font-semibold text-base-content truncate">
            {{ i18n.t("toolNote") }}
          </h1>
        </div>
      </header>

      <!-- Notes Workspace (my-notes style sidebar + plain-text editor) -->
      <main class="flex-1 min-h-0 flex flex-col w-full mx-auto pb-2">
        <div
          class="surface elev-2 rounded-2xl flex-1 min-h-0 flex overflow-hidden"
        >
          <!-- Sidebar -->
          @if (sidebarOpen()) {
            <aside
              class="w-60 sm:w-72 shrink-0 border-r border-line-soft bg-base-200/35 flex flex-col min-h-0 select-none"
            >
              <!-- Search & New Note -->
              <div
                class="p-3 border-b border-line-soft flex items-center gap-2"
              >
                <div
                  class="flex-1 min-w-0 flex items-center gap-2 px-2.5 h-8 rounded-lg surface-sunken border border-line-soft focus-within:border-primary/50 transition-colors"
                >
                  <ng-icon
                    name="heroMagnifyingGlass"
                    class="w-3.5 h-3.5 text-ink-3 shrink-0"
                  />
                  <input
                    type="text"
                    class="flex-1 min-w-0 bg-transparent text-xs text-base-content placeholder:text-ink-3 focus:outline-none"
                    [placeholder]="i18n.t('noteSearchPlaceholder')"
                    [value]="searchQuery()"
                    (input)="onSearchInput($event)"
                  />
                  @if (searchQuery()) {
                    <button
                      type="button"
                      class="text-ink-3 hover:text-base-content cursor-pointer"
                      (click)="clearSearch()"
                      [attr.aria-label]="i18n.t('clear')"
                    >
                      <ng-icon name="heroXMark" class="w-3.5 h-3.5" />
                    </button>
                  }
                </div>
                <button
                  type="button"
                  class="h-8 w-8 rounded-lg surface-quiet elev-1 grid place-items-center text-primary hover:bg-primary/10 transition-colors cursor-pointer shrink-0"
                  (click)="createNote()"
                  [title]="i18n.t('noteNew')"
                  [attr.aria-label]="i18n.t('noteNew')"
                >
                  <ng-icon name="heroPlus" class="w-4 h-4" />
                </button>
              </div>

              <!-- Note List -->
              <div class="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
                @if (filteredNotes().length === 0) {
                  <div class="px-3 py-8 text-center text-xs text-ink-3">
                    {{ i18n.t("noteEmptySearch") }}
                  </div>
                } @else {
                  @for (note of filteredNotes(); track note.id) {
                    <div
                      role="button"
                      tabindex="0"
                      class="group relative flex items-start justify-between gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-colors"
                      [class.bg-primary/12]="note.id === activeNoteId()"
                      [class.text-base-content]="note.id === activeNoteId()"
                      [class.hover:bg-chip]="note.id !== activeNoteId()"
                      (click)="selectNote(note.id)"
                      (keydown.enter)="selectNote(note.id)"
                      (keydown.space)="selectNote(note.id)"
                    >
                      <div class="min-w-0 flex-1">
                        <div
                          class="text-sm font-medium truncate"
                          [class.text-primary]="note.id === activeNoteId()"
                          [class.italic]="!note.title.trim()"
                          [class.text-ink-3]="
                            !note.title.trim() && note.id !== activeNoteId()
                          "
                        >
                          {{ note.title.trim() || i18n.t("noteUntitled") }}
                        </div>
                        <div class="text-xs text-ink-3 truncate mt-0.5">
                          {{
                            getPreviewText(note.content) ||
                              formatDate(note.updatedAt)
                          }}
                        </div>
                      </div>

                      <button
                        type="button"
                        class="opacity-0 group-hover:opacity-100 focus:opacity-100 w-6 h-6 rounded-md grid place-items-center text-ink-3 hover:text-error hover:bg-error/10 transition-all cursor-pointer shrink-0 mt-0.5"
                        [class.opacity-100]="note.id === activeNoteId()"
                        (click)="deleteNote(note.id, $event)"
                        [title]="i18n.t('noteDelete')"
                        [attr.aria-label]="i18n.t('noteDelete')"
                      >
                        <ng-icon name="heroTrash" class="w-3.5 h-3.5" />
                      </button>
                    </div>
                  }
                }
              </div>
            </aside>
          }

          <!-- Main Plain-Text Editor -->
          <section class="flex-1 min-w-0 flex flex-col min-h-0">
            @if (activeNote(); as current) {
              <div class="px-6 pt-5 pb-3 border-b border-line-soft shrink-0">
                <input
                  #titleInputEl
                  type="text"
                  class="w-full bg-transparent text-lg sm:text-xl font-semibold text-base-content placeholder:text-ink-3/60 focus:outline-none"
                  [placeholder]="i18n.t('noteTitlePlaceholder')"
                  [value]="current.title"
                  (input)="onTitleInput($event)"
                />
              </div>

              <textarea
                #textareaEl
                class="flex-1 w-full h-full px-6 py-5 bg-transparent resize-none border-0 text-base-content placeholder:text-ink-3/50 note-editor-textarea overflow-y-auto focus:outline-none"
                spellcheck="false"
                autocomplete="off"
                [placeholder]="i18n.t('noteContentPlaceholder')"
                [value]="current.content"
                (input)="onContentInput($event)"
              ></textarea>
            }
          </section>
        </div>
      </main>
      <app-modal-host />
    </div>
  `,
})
export class NoteComponent implements OnInit {
  private router = inject(Router);
  private titleService = inject(Title);
  private modalService = inject(ModalService);
  private settingsService = inject(SettingsService);
  private noteService = inject(NoteService);
  public i18n = inject(I18nService);
  private destroyRef = inject(DestroyRef);

  @ViewChild("textareaEl")
  textareaRef?: ElementRef<HTMLTextAreaElement>;
  @ViewChild("titleInputEl")
  titleInputRef?: ElementRef<HTMLInputElement>;

  private static readonly SAVE_DEBOUNCE_MS = 300;
  private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private hasPendingSave = false;

  notes = signal<NoteItem[]>([]);
  activeNoteId = signal<string | null>(null);
  sidebarOpen = signal(true);
  searchQuery = signal("");

  private previousTitle = "";

  readonly activeNote = computed(() => {
    const id = this.activeNoteId();
    return this.notes().find((n) => n.id === id) ?? null;
  });

  readonly filteredNotes = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const all = this.notes();
    if (!query) return all;
    return all.filter(
      (n) =>
        n.title.toLowerCase().includes(query) ||
        n.content.toLowerCase().includes(query),
    );
  });

  constructor() {
    this.previousTitle = this.titleService.getTitle();
    effect(() => {
      this.titleService.setTitle(this.getPageTitle());
    });
    this.destroyRef.onDestroy(() => {
      this.titleService.setTitle(this.previousTitle);
    });

    afterNextRender(() => {
      this.textareaRef?.nativeElement.focus();
    });
  }

  private getPageTitle(): string {
    const noteTitle = this.activeNote()?.title.trim();
    const toolTitle = this.i18n.t("toolNote");
    return noteTitle ? `${noteTitle} - ${toolTitle}` : toolTitle;
  }

  ngOnInit(): void {
    this.titleService.setTitle(this.getPageTitle());

    // Ensure theme and language are applied when directly landing on or refreshing #/note
    this.settingsService.settingsSource
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((settings) => {
        document.documentElement.setAttribute(
          "data-theme",
          settings.theme || "light",
        );
        if (settings.language) {
          this.i18n.setLanguage(settings.language);
        }
      });

    void this.loadFromStorage();

    if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
      const onChromeStorageChanged = (
        changes: Record<string, chrome.storage.StorageChange>,
        areaName: string,
      ) => {
        if (areaName !== "local" || !changes[NOTES_STORAGE_KEY]?.newValue) {
          return;
        }
        const normalized = this.noteService.normalizeNotesState(
          changes[NOTES_STORAGE_KEY].newValue,
        );
        if (normalized && normalized.notes.length > 0) {
          const currentState: NotesStorageState = {
            notes: this.notes(),
            activeNoteId: this.activeNoteId(),
          };
          if (JSON.stringify(normalized) === JSON.stringify(currentState)) {
            return;
          }
          this.notes.set(normalized.notes);
          this.activeNoteId.set(normalized.activeNoteId);
        }
      };
      chrome.storage.onChanged.addListener(onChromeStorageChanged);
      this.destroyRef.onDestroy(() => {
        chrome.storage.onChanged.removeListener(onChromeStorageChanged);
      });
    } else if (typeof window !== "undefined") {
      const onStorage = (event: StorageEvent) => {
        if (event.key === NOTES_STORAGE_KEY) {
          void this.loadFromStorage();
        }
      };
      window.addEventListener("storage", onStorage);
      this.destroyRef.onDestroy(() => {
        window.removeEventListener("storage", onStorage);
      });
    }

    if (typeof document !== "undefined") {
      const onVisibilityChange = () => {
        if (document.visibilityState === "hidden") {
          this.flushPendingSave();
        }
      };
      document.addEventListener("visibilitychange", onVisibilityChange);
      this.destroyRef.onDestroy(() => {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      });
    }

    this.destroyRef.onDestroy(() => {
      this.flushPendingSave();
    });
  }

  private async loadFromStorage(): Promise<void> {
    const loaded = await this.noteService.loadNotesState();
    if (loaded && loaded.notes.length > 0) {
      this.notes.set(loaded.notes);
      this.activeNoteId.set(loaded.activeNoteId);
      return;
    }

    const initial = createEmptyNote();
    this.notes.set([initial]);
    this.activeNoteId.set(initial.id);
    this.saveToStorage();
  }

  private scheduleSave(): void {
    this.hasPendingSave = true;
    if (this.saveDebounceTimer !== null) {
      clearTimeout(this.saveDebounceTimer);
    }
    this.saveDebounceTimer = setTimeout(() => {
      this.flushPendingSave();
    }, NoteComponent.SAVE_DEBOUNCE_MS);
  }

  private flushPendingSave(): void {
    if (this.saveDebounceTimer !== null) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
    if (!this.hasPendingSave) {
      return;
    }
    this.saveToStorage();
  }

  private saveToStorage(): void {
    if (this.saveDebounceTimer !== null) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
    this.hasPendingSave = false;
    const state: NotesStorageState = {
      notes: this.notes(),
      activeNoteId: this.activeNoteId(),
    };
    void this.noteService.saveNotesState(state);
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
  }

  createNote(): void {
    const next = createEmptyNote();
    this.notes.update((list) => [next, ...list]);
    this.activeNoteId.set(next.id);
    this.searchQuery.set("");
    this.saveToStorage();
    setTimeout(() => {
      this.titleInputRef?.nativeElement.focus();
    }, 0);
  }

  selectNote(id: string): void {
    if (this.activeNoteId() === id) return;
    this.activeNoteId.set(id);
    this.saveToStorage();
  }

  async deleteNote(id: string, event?: Event): Promise<void> {
    event?.stopPropagation();
    const target = this.notes().find((n) => n.id === id);
    if (!target) return;

    const hasContent =
      target.title.trim().length > 0 || target.content.trim().length > 0;
    if (!hasContent) {
      this.performDeleteNote(id);
      return;
    }

    const { ConfirmModalComponent } =
      await import("@app/new-tab/confirm-modal/confirm-modal.component");
    const ref = this.modalService.open(ConfirmModalComponent, {
      title: this.i18n.t("noteDeleteConfirm"),
      confirmButtonClass: "btn-error",
    });
    ref.instance.confirm.subscribe(() => {
      this.performDeleteNote(id);
    });
  }

  private performDeleteNote(id: string): void {
    const remaining = this.notes().filter((n) => n.id !== id);

    if (remaining.length === 0) {
      const fresh = createEmptyNote();
      this.notes.set([fresh]);
      this.activeNoteId.set(fresh.id);
    } else {
      this.notes.set(remaining);
      if (this.activeNoteId() === id) {
        this.activeNoteId.set(remaining[0].id);
      }
    }
    this.saveToStorage();
  }

  onTitleInput(event: Event): void {
    const title = (event.target as HTMLInputElement).value;
    const id = this.activeNoteId();
    if (!id) return;
    const now = Date.now();
    this.notes.update((list) =>
      list.map((n) => (n.id === id ? { ...n, title, updatedAt: now } : n)),
    );
    this.scheduleSave();
  }

  onContentInput(event: Event): void {
    const content = (event.target as HTMLTextAreaElement).value;
    const id = this.activeNoteId();
    if (!id) return;
    const now = Date.now();
    this.notes.update((list) =>
      list.map((n) => (n.id === id ? { ...n, content, updatedAt: now } : n)),
    );
    this.scheduleSave();
  }

  onSearchInput(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  clearSearch(): void {
    this.searchQuery.set("");
  }

  getPreviewText(content: string): string {
    const firstLine = content
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    return firstLine ?? "";
  }

  formatDate(timestamp: number): string {
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(timestamp));
    } catch {
      return "";
    }
  }

  goBack(): void {
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/index.html");
    }
    void this.router.navigate(["/new-tab"]);
  }
}
