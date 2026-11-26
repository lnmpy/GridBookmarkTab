import { NgTemplateOutlet } from "@angular/common";
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
  heroArrowsUpDown,
  heroBars3,
  heroCheck,
  heroChevronDown,
  heroChevronRight,
  heroFolder,
  heroFolderOpen,
  heroFolderPlus,
  heroMagnifyingGlass,
  heroPencil,
  heroPlus,
  heroTrash,
  heroXMark,
} from "@ng-icons/heroicons/outline";
import { ModalHostComponent } from "@app/components/modal-host/modal-host.component";
import { I18nService } from "@app/services/i18n.service";
import { ModalService } from "@app/services/modal.service";
import { SettingsService } from "@app/services/settings.service";
import {
  DEFAULT_NOTE_GROUP_ORDER,
  DEFAULT_NOTE_SORT,
  NoteFolder,
  NoteGroupOrder,
  NoteItem,
  NoteService,
  NoteSortOption,
  NOTES_STORAGE_KEY,
  NotesStorageState,
} from "@app/services/note.service";

export type {
  NoteFolder,
  NoteGroupOrder,
  NoteItem,
  NoteSortOption,
  NotesStorageState,
};
export { NOTES_STORAGE_KEY };

function generateId(prefix: string): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function createEmptyNote(now = Date.now(), folderId?: string | null): NoteItem {
  return {
    id: generateId("note"),
    title: "",
    content: "",
    createdAt: now,
    updatedAt: now,
    ...(folderId ? { folderId } : {}),
  };
}

@Component({
  selector: "app-note",
  standalone: true,
  imports: [NgIcon, NgTemplateOutlet, ModalHostComponent],
  providers: [
    provideIcons({
      heroArrowLeft,
      heroArrowsUpDown,
      heroBars3,
      heroCheck,
      heroChevronDown,
      heroChevronRight,
      heroFolder,
      heroFolderOpen,
      heroFolderPlus,
      heroMagnifyingGlass,
      heroPencil,
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
            class="btn btn-sm btn-ghost bg-base-100/70 border border-base-300/80 h-8 min-h-8 px-2.5 rounded-field gap-1.5 text-xs font-medium text-base-content/80 hover:text-base-content shrink-0"
            (click)="goBack()"
          >
            <ng-icon name="heroArrowLeft" class="w-3.5 h-3.5" />
            <span>{{ i18n.t("back") }}</span>
          </button>

          <button
            type="button"
            class="btn btn-sm btn-square btn-ghost bg-base-100/70 border border-base-300/80 h-8 w-8 min-h-8 rounded-field text-base-content/80 hover:text-base-content shrink-0"
            (click)="toggleSidebar()"
            [title]="i18n.t('noteToggleSidebar')"
            [attr.aria-label]="i18n.t('noteToggleSidebar')"
          >
            <ng-icon name="heroBars3" class="w-4 h-4" />
          </button>

          <h1 class="text-sm font-semibold text-base-content truncate ml-1">
            {{ i18n.t("toolNote") }}
          </h1>

          <span class="badge badge-sm badge-soft badge-primary font-medium">
            {{ notes().length }}
          </span>
        </div>
      </header>

      <!-- Notes Workspace -->
      <main class="flex-1 min-h-0 flex flex-col w-full mx-auto pb-2">
        <div
          class="bg-base-100 border border-base-300/80 shadow-sm rounded-box flex-1 min-h-0 flex overflow-hidden"
        >
          <!-- Sidebar -->
          @if (sidebarOpen()) {
            <aside
              class="w-64 sm:w-76 shrink-0 border-r border-base-300/70 bg-base-200/45 flex flex-col min-h-0 select-none"
            >
              <!-- Search, Sort & Create Actions -->
              <div
                class="p-3 border-b border-base-300/70 bg-base-100/50 flex items-center gap-1.5"
              >
                <label
                  class="input input-sm flex-1 min-w-0 bg-base-100 border-base-300 focus-within:border-primary/60 focus-within:outline-none gap-1.5 px-2.5"
                >
                  <ng-icon
                    name="heroMagnifyingGlass"
                    class="w-3.5 h-3.5 text-base-content/45 shrink-0"
                  />
                  <input
                    type="text"
                    class="grow min-w-0 text-xs"
                    [placeholder]="i18n.t('noteSearchPlaceholder')"
                    [value]="searchQuery()"
                    (input)="onSearchInput($event)"
                  />
                  @if (searchQuery()) {
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs btn-circle h-5 w-5 min-h-5 text-base-content/50 hover:text-base-content"
                      (click)="clearSearch()"
                      [attr.aria-label]="i18n.t('clear')"
                    >
                      <ng-icon name="heroXMark" class="w-3 h-3" />
                    </button>
                  }
                </label>

                <div
                  class="relative shrink-0"
                  (click)="$event.stopPropagation()"
                >
                  <button
                    type="button"
                    class="btn btn-sm btn-square h-8 w-8 min-h-8"
                    [class.btn-primary]="sortMenuOpen()"
                    [class.btn-soft]="sortMenuOpen()"
                    [class.btn-ghost]="!sortMenuOpen()"
                    (click)="toggleSortMenu($event)"
                    [title]="i18n.t('noteSort')"
                    [attr.aria-label]="i18n.t('noteSort')"
                    [attr.aria-expanded]="sortMenuOpen()"
                  >
                    <ng-icon name="heroArrowsUpDown" class="w-4 h-4" />
                  </button>

                  @if (sortMenuOpen()) {
                    <ul
                      role="menu"
                      class="menu menu-sm absolute right-0 top-full mt-1.5 z-30 w-48 p-1.5 rounded-box bg-base-100 border border-base-300 shadow-lg gap-0.5"
                    >
                      @for (opt of sortOptions; track opt.value) {
                        <li>
                          <button
                            type="button"
                            role="menuitemradio"
                            [attr.aria-checked]="sortBy() === opt.value"
                            class="flex items-center justify-between gap-2 text-xs rounded-field"
                            [class.menu-active]="sortBy() === opt.value"
                            (click)="setSortBy(opt.value)"
                          >
                            <span class="truncate">{{
                              i18n.t(opt.labelKey)
                            }}</span>
                            @if (sortBy() === opt.value) {
                              <ng-icon
                                name="heroCheck"
                                class="w-3.5 h-3.5 shrink-0"
                              />
                            }
                          </button>
                        </li>
                      }
                      <li
                        role="separator"
                        class="my-1 border-t border-base-300/70 pointer-events-none"
                      ></li>
                      @for (opt of groupOrderOptions; track opt.value) {
                        <li>
                          <button
                            type="button"
                            role="menuitemradio"
                            [attr.aria-checked]="groupOrder() === opt.value"
                            class="flex items-center justify-between gap-2 text-xs rounded-field"
                            [class.menu-active]="groupOrder() === opt.value"
                            (click)="setGroupOrder(opt.value)"
                          >
                            <span class="truncate">{{
                              i18n.t(opt.labelKey)
                            }}</span>
                            @if (groupOrder() === opt.value) {
                              <ng-icon
                                name="heroCheck"
                                class="w-3.5 h-3.5 shrink-0"
                              />
                            }
                          </button>
                        </li>
                      }
                    </ul>
                  }
                </div>

                <button
                  type="button"
                  class="btn btn-sm btn-square btn-ghost h-8 w-8 min-h-8"
                  (click)="createFolder()"
                  [title]="i18n.t('noteNewFolder')"
                  [attr.aria-label]="i18n.t('noteNewFolder')"
                >
                  <ng-icon name="heroFolderPlus" class="w-4 h-4" />
                </button>

                <button
                  type="button"
                  class="btn btn-sm btn-square btn-primary btn-soft h-8 w-8 min-h-8"
                  (click)="createNote()"
                  [title]="i18n.t('noteNew')"
                  [attr.aria-label]="i18n.t('noteNew')"
                >
                  <ng-icon name="heroPlus" class="w-4 h-4" />
                </button>
              </div>

              <!-- Note List -->
              <div class="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2">
                <ng-template #noteItemTpl let-note="note">
                  <div
                    role="button"
                    tabindex="0"
                    class="group relative flex items-start justify-between gap-2 px-3 py-2.5 rounded-field border cursor-pointer transition-all"
                    [class.bg-primary/10]="note.id === activeNoteId()"
                    [class.border-primary/25]="note.id === activeNoteId()"
                    [class.shadow-xs]="note.id === activeNoteId()"
                    [class.border-transparent]="note.id !== activeNoteId()"
                    [class.hover:bg-base-100/80]="note.id !== activeNoteId()"
                    [class.hover:border-base-300/60]="
                      note.id !== activeNoteId()
                    "
                    (click)="selectNote(note.id)"
                    (keydown.enter)="selectNote(note.id)"
                    (keydown.space)="selectNote(note.id)"
                  >
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-1.5 min-w-0">
                        <div
                          class="text-sm font-medium truncate"
                          [class.text-primary]="note.id === activeNoteId()"
                          [class.italic]="!note.title.trim()"
                          [class.text-base-content/50]="
                            !note.title.trim() && note.id !== activeNoteId()
                          "
                        >
                          {{ note.title.trim() || i18n.t("noteUntitled") }}
                        </div>
                      </div>
                      <div class="text-xs text-base-content/55 truncate mt-0.5">
                        {{
                          getPreviewText(note.content) ||
                            formatDate(note.updatedAt)
                        }}
                      </div>
                    </div>

                    <div class="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        class="btn btn-ghost btn-xs btn-square transition-opacity"
                        [class.opacity-100]="
                          note.pinned || note.id === activeNoteId()
                        "
                        [class.opacity-0]="
                          !note.pinned && note.id !== activeNoteId()
                        "
                        [class.group-hover:opacity-100]="!note.pinned"
                        [class.focus:opacity-100]="!note.pinned"
                        [class.text-primary]="note.pinned"
                        [class.bg-primary/10]="note.pinned"
                        [class.text-base-content/50]="!note.pinned"
                        [class.hover:text-primary]="!note.pinned"
                        (click)="togglePin(note.id, $event)"
                        [title]="
                          note.pinned ? i18n.t('noteUnpin') : i18n.t('notePin')
                        "
                        [attr.aria-label]="
                          note.pinned ? i18n.t('noteUnpin') : i18n.t('notePin')
                        "
                        [attr.aria-pressed]="!!note.pinned"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          class="w-3.5 h-3.5"
                          [attr.fill]="note.pinned ? 'currentColor' : 'none'"
                          stroke="currentColor"
                          stroke-width="1.8"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M12 17v5" />
                          <path
                            d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"
                          />
                        </svg>
                      </button>

                      <button
                        type="button"
                        class="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100 focus:opacity-100 text-base-content/50 hover:text-error hover:bg-error/10 transition-opacity"
                        [class.opacity-100]="note.id === activeNoteId()"
                        (click)="deleteNote(note.id, $event)"
                        [title]="i18n.t('noteDelete')"
                        [attr.aria-label]="i18n.t('noteDelete')"
                      >
                        <ng-icon name="heroTrash" class="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </ng-template>

                @if (
                  filteredNotes().length === 0 &&
                  (searchQuery().trim() || folders().length === 0)
                ) {
                  <div
                    class="px-3 py-10 text-center text-xs text-base-content/50"
                  >
                    {{ i18n.t("noteEmptySearch") }}
                  </div>
                } @else {
                  <!-- Pinned Notes -->
                  @if (pinnedNotes().length > 0) {
                    <div class="space-y-1">
                      @for (note of pinnedNotes(); track note.id) {
                        <ng-container
                          *ngTemplateOutlet="noteItemTpl; context: { note }"
                        />
                      }
                    </div>
                  }

                  <!-- Folders Template -->
                  <ng-template #foldersTpl>
                    @for (group of folderGroups(); track group.folder.id) {
                      <div
                        class="rounded-box bg-base-100/55 border border-base-300/60 overflow-hidden"
                      >
                        <div
                          role="button"
                          tabindex="0"
                          class="group flex items-center justify-between gap-1.5 px-2.5 py-2 hover:bg-base-100 transition-colors cursor-pointer"
                          (click)="
                            toggleFolderCollapse(group.folder.id, $event)
                          "
                          (keydown.enter)="
                            toggleFolderCollapse(group.folder.id, $event)
                          "
                          (keydown.space)="
                            toggleFolderCollapse(group.folder.id, $event)
                          "
                          [attr.aria-expanded]="!group.collapsed"
                        >
                          <div class="flex items-center gap-1.5 min-w-0 flex-1">
                            <ng-icon
                              [name]="
                                group.collapsed
                                  ? 'heroChevronRight'
                                  : 'heroChevronDown'
                              "
                              class="w-3.5 h-3.5 text-base-content/50 shrink-0"
                            />
                            <ng-icon
                              [name]="
                                group.collapsed
                                  ? 'heroFolder'
                                  : 'heroFolderOpen'
                              "
                              class="w-4 h-4 text-primary shrink-0"
                            />

                            @if (editingFolderId() === group.folder.id) {
                              <input
                                type="text"
                                class="input input-xs flex-1 min-w-0 bg-base-100 border-primary/60 text-xs font-medium focus:outline-none"
                                [value]="editingFolderName()"
                                (click)="$event.stopPropagation()"
                                (input)="onFolderRenameInput($event)"
                                (keydown.enter)="
                                  commitRenameFolder(group.folder.id)
                                "
                                (keydown.escape)="cancelRenameFolder()"
                                (blur)="commitRenameFolder(group.folder.id)"
                              />
                            } @else {
                              <span
                                class="text-xs font-semibold text-base-content truncate"
                                (dblclick)="
                                  startRenameFolder(group.folder, $event)
                                "
                              >
                                {{ group.folder.name }}
                              </span>
                              <span
                                class="badge badge-xs badge-ghost font-medium shrink-0"
                              >
                                {{ group.notes.length }}
                              </span>
                            }
                          </div>

                          <div
                            class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0"
                          >
                            <button
                              type="button"
                              class="btn btn-ghost btn-xs btn-square h-5 w-5 min-h-5 text-base-content/60 hover:text-primary"
                              (click)="
                                createNoteInFolder(group.folder.id, $event)
                              "
                              [title]="i18n.t('noteNewInFolder')"
                              [attr.aria-label]="i18n.t('noteNewInFolder')"
                            >
                              <ng-icon name="heroPlus" class="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              class="btn btn-ghost btn-xs btn-square h-5 w-5 min-h-5 text-base-content/60 hover:text-base-content"
                              (click)="startRenameFolder(group.folder, $event)"
                              [title]="i18n.t('noteRenameFolder')"
                              [attr.aria-label]="i18n.t('noteRenameFolder')"
                            >
                              <ng-icon name="heroPencil" class="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              class="btn btn-ghost btn-xs btn-square h-5 w-5 min-h-5 text-base-content/60 hover:text-error hover:bg-error/10"
                              (click)="deleteFolder(group.folder.id, $event)"
                              [title]="i18n.t('noteDeleteFolder')"
                              [attr.aria-label]="i18n.t('noteDeleteFolder')"
                            >
                              <ng-icon name="heroTrash" class="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        @if (!group.collapsed && group.notes.length > 0) {
                          <div
                            class="p-1.5 pt-1 space-y-1 border-t border-base-300/50 bg-base-200/30"
                          >
                            @for (note of group.notes; track note.id) {
                              <ng-container
                                *ngTemplateOutlet="
                                  noteItemTpl;
                                  context: { note }
                                "
                              />
                            }
                          </div>
                        }
                      </div>
                    }
                  </ng-template>

                  <!-- Uncategorized Root Notes Template -->
                  <ng-template #rootNotesTpl>
                    @if (rootNotes().length > 0) {
                      @if (
                        groupOrder() === "foldersFirst" &&
                        (folderGroups().length > 0 || pinnedNotes().length > 0)
                      ) {
                        <div
                          class="divider my-1 text-[11px] text-base-content/45"
                        >
                          {{ i18n.t("noteFolderRoot") }}
                        </div>
                      }
                      <div class="space-y-1">
                        @for (note of rootNotes(); track note.id) {
                          <ng-container
                            *ngTemplateOutlet="noteItemTpl; context: { note }"
                          />
                        }
                      </div>
                    }
                  </ng-template>

                  @if (groupOrder() === "notesFirst") {
                    <ng-container *ngTemplateOutlet="rootNotesTpl" />
                    @if (rootNotes().length > 0 && folderGroups().length > 0) {
                      <div class="divider my-1"></div>
                    }
                    <ng-container *ngTemplateOutlet="foldersTpl" />
                  } @else {
                    <ng-container *ngTemplateOutlet="foldersTpl" />
                    <ng-container *ngTemplateOutlet="rootNotesTpl" />
                  }
                }
              </div>
            </aside>
          }

          <!-- Main Plain-Text Editor -->
          <section class="flex-1 min-w-0 flex flex-col min-h-0 bg-base-100">
            @if (activeNote(); as current) {
              <div
                class="px-6 pt-4 pb-3 border-b border-base-300/70 bg-base-100 shrink-0 flex items-center gap-3"
              >
                <input
                  #titleInputEl
                  type="text"
                  class="flex-1 min-w-0 bg-transparent text-lg sm:text-xl font-semibold text-base-content placeholder:text-base-content/35 focus:outline-none"
                  [placeholder]="i18n.t('noteTitlePlaceholder')"
                  [value]="current.title"
                  (input)="onTitleInput($event)"
                />
                @if (folders().length > 0) {
                  <select
                    class="select select-xs h-7 min-h-7 rounded-field bg-base-200/70 border-base-300 text-xs text-base-content/80 focus:outline-none max-w-40"
                    [value]="current.folderId ?? ''"
                    (change)="onNoteFolderChange(current.id, $event)"
                    [title]="i18n.t('noteMoveToFolder')"
                    [attr.aria-label]="i18n.t('noteMoveToFolder')"
                  >
                    <option value="">{{ i18n.t("noteFolderRoot") }}</option>
                    @for (folder of sortedFolders(); track folder.id) {
                      <option [value]="folder.id">{{ folder.name }}</option>
                    }
                  </select>
                }
                <button
                  type="button"
                  class="btn btn-sm btn-square h-8 w-8 min-h-8 shrink-0"
                  [class.btn-primary]="current.pinned"
                  [class.btn-soft]="current.pinned"
                  [class.btn-ghost]="!current.pinned"
                  (click)="togglePin(current.id)"
                  [title]="
                    current.pinned ? i18n.t('noteUnpin') : i18n.t('notePin')
                  "
                  [attr.aria-label]="
                    current.pinned ? i18n.t('noteUnpin') : i18n.t('notePin')
                  "
                  [attr.aria-pressed]="!!current.pinned"
                >
                  <svg
                    viewBox="0 0 24 24"
                    class="w-4 h-4"
                    [attr.fill]="current.pinned ? 'currentColor' : 'none'"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 17v5" />
                    <path
                      d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"
                    />
                  </svg>
                </button>
              </div>

              <textarea
                #textareaEl
                class="flex-1 w-full h-full px-6 py-5 bg-transparent resize-none border-0 text-base-content placeholder:text-base-content/35 note-editor-textarea overflow-y-auto focus:outline-none"
                spellcheck="false"
                autocomplete="off"
                [placeholder]="i18n.t('noteContentPlaceholder')"
                [value]="current.content"
                (input)="onContentInput($event)"
              ></textarea>

              <footer
                class="px-6 py-2 border-t border-base-300/60 bg-base-200/35 flex items-center justify-between gap-3 text-xs text-base-content/55 shrink-0 select-none"
              >
                <div class="flex items-center gap-2">
                  <span class="badge badge-xs badge-soft badge-success">
                    {{ i18n.t("noteSaved") }}
                  </span>
                  <span>{{ formatDate(current.updatedAt) }}</span>
                </div>
                <span class="tabular-nums">{{ current.content.length }}</span>
              </footer>
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
  folders = signal<NoteFolder[]>([]);
  activeNoteId = signal<string | null>(null);
  sidebarOpen = signal(true);
  searchQuery = signal("");
  sortBy = signal<NoteSortOption>(DEFAULT_NOTE_SORT);
  groupOrder = signal<NoteGroupOrder>(DEFAULT_NOTE_GROUP_ORDER);
  sortMenuOpen = signal(false);
  editingFolderId = signal<string | null>(null);
  editingFolderName = signal("");

  readonly sortOptions: ReadonlyArray<{
    value: NoteSortOption;
    labelKey: string;
  }> = [
    { value: "updatedDesc", labelKey: "noteSortUpdatedDesc" },
    { value: "updatedAsc", labelKey: "noteSortUpdatedAsc" },
    { value: "createdDesc", labelKey: "noteSortCreatedDesc" },
    { value: "createdAsc", labelKey: "noteSortCreatedAsc" },
    { value: "titleAsc", labelKey: "noteSortTitleAsc" },
    { value: "titleDesc", labelKey: "noteSortTitleDesc" },
  ];

  readonly groupOrderOptions: ReadonlyArray<{
    value: NoteGroupOrder;
    labelKey: string;
  }> = [
    { value: "notesFirst", labelKey: "noteGroupNotesFirst" },
    { value: "foldersFirst", labelKey: "noteGroupFoldersFirst" },
  ];

  private previousTitle = "";

  readonly activeNote = computed(() => {
    const id = this.activeNoteId();
    return this.notes().find((n) => n.id === id) ?? null;
  });

  readonly sortedNotes = computed(() => {
    const sort = this.sortBy();
    const fallbackTitle = this.i18n.t("noteUntitled");
    const getTitle = (note: NoteItem) => note.title.trim() || fallbackTitle;

    return [...this.notes()].sort((a, b) => {
      const pinDiff = (a.pinned ? 0 : 1) - (b.pinned ? 0 : 1);
      if (pinDiff !== 0) return pinDiff;

      let diff: number;
      switch (sort) {
        case "updatedAsc":
          diff = (a.updatedAt ?? 0) - (b.updatedAt ?? 0);
          break;
        case "createdDesc":
          diff = (b.createdAt ?? 0) - (a.createdAt ?? 0);
          break;
        case "createdAsc":
          diff = (a.createdAt ?? 0) - (b.createdAt ?? 0);
          break;
        case "titleAsc":
          diff = getTitle(a).localeCompare(getTitle(b), undefined, {
            numeric: true,
            sensitivity: "base",
          });
          break;
        case "titleDesc":
          diff = getTitle(b).localeCompare(getTitle(a), undefined, {
            numeric: true,
            sensitivity: "base",
          });
          break;
        case "updatedDesc":
        default:
          diff = (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
          break;
      }

      if (diff !== 0) return diff;
      return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    });
  });

  readonly filteredNotes = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const all = this.sortedNotes();
    if (!query) return all;
    return all.filter(
      (n) =>
        n.title.toLowerCase().includes(query) ||
        n.content.toLowerCase().includes(query),
    );
  });

  readonly pinnedNotes = computed(() =>
    this.filteredNotes().filter((n) => Boolean(n.pinned)),
  );

  readonly sortedFolders = computed(() =>
    [...this.folders()].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    ),
  );

  readonly folderGroups = computed(() => {
    const isSearching = this.searchQuery().trim().length > 0;
    const unpinned = this.filteredNotes().filter((n) => !n.pinned);
    return this.sortedFolders()
      .map((folder) => {
        const notes = unpinned.filter((n) => n.folderId === folder.id);
        return {
          folder,
          notes,
          collapsed: isSearching ? false : Boolean(folder.collapsed),
        };
      })
      .filter((group) => !isSearching || group.notes.length > 0);
  });

  readonly rootNotes = computed(() =>
    this.filteredNotes().filter((n) => !n.pinned && !n.folderId),
  );

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
            folders: this.folders(),
            activeNoteId: this.activeNoteId(),
            sortBy: this.sortBy(),
            groupOrder: this.groupOrder(),
          };
          if (JSON.stringify(normalized) === JSON.stringify(currentState)) {
            return;
          }
          this.notes.set(normalized.notes);
          this.folders.set(normalized.folders ?? []);
          this.activeNoteId.set(normalized.activeNoteId);
          if (normalized.sortBy) {
            this.sortBy.set(normalized.sortBy);
          }
          if (normalized.groupOrder) {
            this.groupOrder.set(normalized.groupOrder);
          }
        }
      };
      chrome.storage.onChanged.addListener(onChromeStorageChanged);
      this.destroyRef.onDestroy(() => {
        chrome.storage.onChanged.removeListener(onChromeStorageChanged);
      });
    }

    if (typeof document !== "undefined") {
      const onVisibilityChange = () => {
        if (document.visibilityState === "hidden") {
          this.flushPendingSave();
        }
      };
      const onDocumentClick = () => {
        if (this.sortMenuOpen()) {
          this.sortMenuOpen.set(false);
        }
      };
      const onDocumentKeydown = (event: KeyboardEvent) => {
        if (event.key === "Escape" && this.sortMenuOpen()) {
          this.sortMenuOpen.set(false);
        }
      };
      document.addEventListener("click", onDocumentClick);
      document.addEventListener("keydown", onDocumentKeydown);
      document.addEventListener("visibilitychange", onVisibilityChange);
      this.destroyRef.onDestroy(() => {
        document.removeEventListener("click", onDocumentClick);
        document.removeEventListener("keydown", onDocumentKeydown);
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
      this.folders.set(loaded.folders ?? []);
      this.activeNoteId.set(loaded.activeNoteId);
      if (loaded.sortBy) {
        this.sortBy.set(loaded.sortBy);
      }
      if (loaded.groupOrder) {
        this.groupOrder.set(loaded.groupOrder);
      }
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
      folders: this.folders(),
      activeNoteId: this.activeNoteId(),
      sortBy: this.sortBy(),
      groupOrder: this.groupOrder(),
    };
    void this.noteService.saveNotesState(state);
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
  }

  toggleSortMenu(event?: Event): void {
    event?.stopPropagation();
    this.sortMenuOpen.update((open) => !open);
  }

  setSortBy(option: NoteSortOption): void {
    this.sortMenuOpen.set(false);
    if (this.sortBy() === option) return;
    this.sortBy.set(option);
    this.saveToStorage();
  }

  setGroupOrder(order: NoteGroupOrder): void {
    this.sortMenuOpen.set(false);
    if (this.groupOrder() === order) return;
    this.groupOrder.set(order);
    this.saveToStorage();
  }

  togglePin(id: string, event?: Event): void {
    event?.stopPropagation();
    this.notes.update((list) =>
      list.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n)),
    );
    this.saveToStorage();
  }

  createFolder(): void {
    const now = Date.now();
    const folder: NoteFolder = {
      id: generateId("folder"),
      name: this.i18n.t("noteUntitledFolder"),
      createdAt: now,
      updatedAt: now,
      collapsed: false,
    };
    this.folders.update((list) => [...list, folder]);
    this.editingFolderId.set(folder.id);
    this.editingFolderName.set(folder.name);
    this.saveToStorage();
  }

  toggleFolderCollapse(folderId: string, event?: Event): void {
    event?.stopPropagation();
    if (this.editingFolderId() === folderId) return;
    this.folders.update((list) =>
      list.map((f) =>
        f.id === folderId ? { ...f, collapsed: !f.collapsed } : f,
      ),
    );
    this.saveToStorage();
  }

  startRenameFolder(folder: NoteFolder, event?: Event): void {
    event?.stopPropagation();
    this.editingFolderId.set(folder.id);
    this.editingFolderName.set(folder.name);
  }

  onFolderRenameInput(event: Event): void {
    this.editingFolderName.set((event.target as HTMLInputElement).value);
  }

  commitRenameFolder(folderId: string): void {
    if (this.editingFolderId() !== folderId) return;
    const trimmed = this.editingFolderName().trim();
    this.editingFolderId.set(null);
    if (!trimmed) return;
    const now = Date.now();
    this.folders.update((list) =>
      list.map((f) =>
        f.id === folderId ? { ...f, name: trimmed, updatedAt: now } : f,
      ),
    );
    this.saveToStorage();
  }

  cancelRenameFolder(): void {
    this.editingFolderId.set(null);
  }

  async deleteFolder(folderId: string, event?: Event): Promise<void> {
    event?.stopPropagation();
    const hasNotes = this.notes().some((n) => n.folderId === folderId);
    if (!hasNotes) {
      this.performDeleteFolder(folderId);
      return;
    }

    const { ConfirmModalComponent } =
      await import("@app/new-tab/confirm-modal/confirm-modal.component");
    const ref = this.modalService.open(ConfirmModalComponent, {
      title: this.i18n.t("noteDeleteFolderConfirm"),
      confirmButtonClass: "btn-error",
    });
    ref.instance.confirm.subscribe(() => {
      this.performDeleteFolder(folderId);
    });
  }

  private performDeleteFolder(folderId: string): void {
    if (this.editingFolderId() === folderId) {
      this.editingFolderId.set(null);
    }
    this.folders.update((list) => list.filter((f) => f.id !== folderId));
    this.notes.update((list) =>
      list.map((n) =>
        n.folderId === folderId ? { ...n, folderId: undefined } : n,
      ),
    );
    this.saveToStorage();
  }

  createNoteInFolder(folderId: string, event?: Event): void {
    event?.stopPropagation();
    this.createNote(folderId);
  }

  onNoteFolderChange(noteId: string, event: Event): void {
    const raw = (event.target as HTMLSelectElement).value;
    this.moveNoteToFolder(noteId, raw || null);
  }

  moveNoteToFolder(noteId: string, folderId: string | null): void {
    this.notes.update((list) =>
      list.map((n) =>
        n.id === noteId ? { ...n, folderId: folderId || undefined } : n,
      ),
    );
    if (folderId) {
      this.folders.update((list) =>
        list.map((f) => (f.id === folderId ? { ...f, collapsed: false } : f)),
      );
    }
    this.saveToStorage();
  }

  createNote(folderId?: string | null): void {
    const targetFolderId =
      folderId !== undefined ? folderId : (this.activeNote()?.folderId ?? null);
    const next = createEmptyNote(Date.now(), targetFolderId);
    this.notes.update((list) => [next, ...list]);
    if (targetFolderId) {
      this.folders.update((list) =>
        list.map((f) =>
          f.id === targetFolderId ? { ...f, collapsed: false } : f,
        ),
      );
    }
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
        this.activeNoteId.set(this.sortedNotes()[0]?.id ?? remaining[0].id);
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
