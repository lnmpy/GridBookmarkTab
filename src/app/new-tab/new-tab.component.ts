import {
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  DestroyRef,
  HostListener,
  Injector,
  ViewChild,
  ViewContainerRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';

import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import {
  CdkDrag,
  CdkDropList,
  CdkDragDrop,
  CdkDragMove,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  heroHome,
  heroFolder,
  heroFolderPlus,
  heroTrash,
  heroXMark,
  heroAdjustmentsHorizontal,
  heroArrowTopRightOnSquare,
  heroPlus,
  heroChevronRight,
  heroCheck,
  heroFolderOpen,
} from '@ng-icons/heroicons/outline';

import { Bookmark, Window } from '@app/services/types';
import { BookmarkService } from '@app/services/bookmark.service';
import { TabService } from '@app/services/tab.service';

import { SettingsService } from '@app/services/settings.service';
import { ModalService } from '@app/services/modal.service';
import { ToastService } from '@app/services/toast.service';
import { I18nService } from '@app/services/i18n.service';
import { WallpaperService } from '@app/services/wallpaper.service';
import {
  ToolDefinition,
  ToolId,
  ToolboxService,
} from '@app/services/toolbox.service';
import { PomodoroService } from '@app/services/pomodoro.service';

import {
  ContextMenuComponent,
  ContextMenuItem,
} from '@app/components/context-menu/context-menu.component';
import { ToastContainerComponent } from '@app/components/toast-container/toast-container.component';
import { ModalHostComponent } from '@app/components/modal-host/modal-host.component';

import type { SettingsModalComponent } from './settings-modal/settings-modal.component';
import type { ConfirmModalComponent } from './confirm-modal/confirm-modal.component';
import type { BookmarkModalComponent } from './bookmark-modal/bookmark-modal.component';
import { BookmarkSearchBoxComponent } from './bookmark-search-box/bookmark-search-box.component';
import type { BookmarkMoveModalComponent } from './bookmark-move-modal/bookmark-move-modal.component';
import { DockComponent } from './dock/dock.component';
import { ToolboxPopoverComponent } from './toolbox/toolbox-popover.component';
import { ToolIconComponent } from './toolbox/tool-icon.component';

type NavDirection = 'left' | 'right' | 'up' | 'down';

@Component({
  selector: 'app-new-tab',
  imports: [
    ModalHostComponent,
    NgIcon,
    ToastContainerComponent,
    CdkDrag,
    CdkDropList,
    BookmarkSearchBoxComponent,
    DockComponent,
    ToolboxPopoverComponent,
    ToolIconComponent,
  ],
  providers: [
    provideIcons({
      heroHome,
      heroFolder,
      heroFolderPlus,
      heroTrash,
      heroXMark,
      heroAdjustmentsHorizontal,
      heroArrowTopRightOnSquare,
      heroPlus,
      heroChevronRight,
      heroCheck,
      heroFolderOpen,
    }),
  ],
  templateUrl: './new-tab.component.html',
  styleUrls: ['./new-tab.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewTabComponent {
  // inject value
  private bookmarkService: BookmarkService = inject(BookmarkService);
  private settingsService: SettingsService = inject(SettingsService);
  private tabService: TabService = inject(TabService);
  private overlay: Overlay = inject(Overlay);
  private vcr: ViewContainerRef = inject(ViewContainerRef);
  private modalService: ModalService = inject(ModalService);
  private toastService: ToastService = inject(ToastService);
  public i18n: I18nService = inject(I18nService);
  public wallpaperService: WallpaperService = inject(WallpaperService);
  public toolboxService: ToolboxService = inject(ToolboxService);
  public pomodoroService: PomodoroService = inject(PomodoroService);
  private destroyRef: DestroyRef = inject(DestroyRef);
  private injector: Injector = inject(Injector);
  private router: Router = inject(Router);

  overlayRef!: OverlayRef;

  @ViewChild('searchBox') searchBox?: BookmarkSearchBoxComponent;
  @ViewChild(DockComponent) dockComponent?: DockComponent;

  // bookmarks
  breadcrumb = signal<Bookmark[]>([]);
  rootFolder = signal<Bookmark | undefined>(undefined);
  // The current folder is always the last breadcrumb entry
  currentFolder = computed<Bookmark | undefined>(() => this.breadcrumb().at(-1));
  isBookmarksLoaded = signal(false);

  // settings
  private settings = toSignal(this.settingsService.onSettingsChange(), {
    requireSync: true,
  });
  bookmarkDisplayColumn = computed(() => this.settings().bookmarkDisplayColumn);
  bookmarkSize = computed(() => this.settings().bookmarkSize);
  bookmarkOpenInNewTab = computed(() => this.settings().bookmarkOpenInNewTab);
  keyboardNavigation = computed(
    () => this.settings().keyboardNavigation ?? true,
  );
  searchShortcut = computed(() => this.settings().searchShortcut);

  // wallpaper
  activeWallpaper = toSignal(this.wallpaperService.activeWallpaper$, {
    requireSync: true,
  });
  hasWallpaper = computed(
    () =>
      this.activeWallpaper().type !== 'none' &&
      !!this.activeWallpaper().background,
  );
  wallpaperDim = computed(() => this.settings().wallpaperDim ?? 10);
  wallpaperBlur = computed(() => this.settings().wallpaperBlur ?? 0);

  // dock & toolbox
  dockFolder = toSignal(this.bookmarkService.dockBookmarks$, {
    requireSync: true,
  });
  dockEnabled = computed(() => this.settings().dockEnabled ?? true);
  dockIconSize = computed(() => this.settings().dockIconSize ?? 52);
  pinnedTools = this.toolboxService.pinnedTools;
  isToolboxOpen = signal(false);
  hasDock = computed(
    () =>
      this.dockEnabled() && (this.dockFolder()?.children?.length ?? 0) > 0,
  );
  dockBottomPadding = computed(() =>
    this.hasDock() ? Math.round(this.dockIconSize() * 1.6 + 56) : 24,
  );

  // drag selection
  selectionBox = signal({
    visible: false,
    startX: 0,
    startY: 0,
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  });
  selectedBookmarkIds = signal<ReadonlySet<string>>(new Set());
  private initialSelectedIds = new Set<string>();
  private isSelectionDragging = false;

  // keyboard navigation: id of the bookmark the keyboard cursor is on
  keyboardFocusId = signal<string | undefined>(undefined);
  // index into the breadcrumb when the cursor is on an ancestor crumb
  keyboardCrumbIndex = signal<number | undefined>(undefined);
  private static readonly NAV_KEYS: Record<string, NavDirection> = {
    ArrowLeft: 'left',
    h: 'left',
    ArrowRight: 'right',
    l: 'right',
    ArrowUp: 'up',
    k: 'up',
    ArrowDown: 'down',
    j: 'down',
  };

  // drag & drop
  draggedItem = signal<Bookmark | Window | undefined>(undefined);

  // drag into folder: the folder that takes the drop, set once the dragged
  // card's center has rested in its center zone for DROP_DWELL_MS
  dropTargetId = signal<string | undefined>(undefined);
  dropPulseId = signal<string | undefined>(undefined);
  // cards already dropped into a folder, hidden until the tree reloads
  movingOutIds = signal<ReadonlySet<string>>(new Set());
  private static readonly DROP_DWELL_MS = 120;
  // a folder only gives way at once when the card is past its center (the
  // side away from the slot it left); on the near side it waits this long,
  // so approaching its center never pushes it away
  private static readonly EDGE_REORDER_MS = 300;
  // share of the folder icon that counts as "into": to enter, then to stay
  private static readonly DROP_ZONE = 0.64;
  private static readonly DROP_ZONE_HOLD = 0.8;
  private pendingTargetId?: string;
  private pendingTargetTimer?: ReturnType<typeof setTimeout>;
  private dropPulseTimer?: ReturnType<typeof setTimeout>;
  private edgeFolderId?: string;
  private edgeSince = 0;
  private edgeFarSide = false;
  private dragPreview?: HTMLElement;
  // pointer offset from the preview's icon center, known after the first move
  private previewOffset?: { x: number; y: number };
  private stopPointerTracking?: () => void;
  private releasedTargetId?: string;
  private releasedInsertIndex = -1;

  // spring-loaded folder: keep hovering a target and it opens as a panel
  springFolder = signal<Bookmark | undefined>(undefined);
  springPanelPos = signal({ left: 0, top: 0, width: 0 });
  // where the drop lands among the open folder's children, -1 = append
  springInsertIndex = signal(-1);
  private static readonly SPRING_OPEN_MS = 800;
  private static readonly SPRING_CLOSE_MS = 300;
  private static readonly SPRING_COLUMNS = 5;
  private static readonly SPRING_CELL = 76;
  private springOpenTimer?: ReturnType<typeof setTimeout>;
  private springCloseTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // Mirror the glass settings onto <html> so global surface styles can react
    effect(() => {
      const s = this.settings();
      const root = document.documentElement;
      const enabled = s.glassEnabled ?? true;
      for (const area of ['top', 'tiles', 'dock', 'overlay']) {
        root.classList.toggle(`gbk-glass-${area}`, enabled);
      }
      root.style.setProperty('--glass-blur', `${s.glassBlur ?? 20}px`);
      root.style.setProperty('--glass-alpha', `${(s.glassOpacity ?? 65) / 100}`);
    });

    this.settingsService
      .onSettingsChange()
      .pipe(takeUntilDestroyed())
      .subscribe((s) => {
        // Update language when settings change
        if (s?.language) {
          this.i18n.setLanguage(s.language);
        }
      });

    this.bookmarkService.bookmarks$
      .pipe(takeUntilDestroyed())
      .subscribe((b) => {
        if (!b || !b.id) {
          return;
        }
        this.rootFolder.set(b);
        const breadcrumb = this.breadcrumb();
        if (breadcrumb.length <= 1) {
          this.breadcrumb.set([b]);
        } else {
          // Re-resolve every breadcrumb entry against the new tree
          const next = [...breadcrumb];
          let temp = [b];
          for (let i = 0; i < next.length; i++) {
            for (const bookmark of temp) {
              if (bookmark.id === next[i].id) {
                next[i] = bookmark;
                temp = bookmark.children || [];
                break;
              }
            }
          }
          this.breadcrumb.set(next);
        }
        this.isBookmarksLoaded.set(true);
      });

    this.destroyRef.onDestroy(() => this.stopSelectionDrag());
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: Event) {
    if (this.modalService.hasOpenModals()) {
      return;
    }

    const kbEvent = event as KeyboardEvent;
    const activeEl = document.activeElement;
    const isInput =
      activeEl instanceof HTMLInputElement ||
      activeEl instanceof HTMLTextAreaElement ||
      activeEl instanceof HTMLSelectElement ||
      activeEl?.getAttribute('contenteditable') === 'true';

    if (isInput) return;

    // 1. Search shortcut (⌘K / Ctrl+K)
    if (this.isSearchShortcut(kbEvent)) {
      kbEvent.preventDefault();
      this.openBookmarkSearch();
      return;
    }

    // 2. Grid navigation: arrows / hjkl move, Enter opens
    if (this.keyboardNavigation() && this.handleGridNavigation(kbEvent)) {
      kbEvent.preventDefault();
      return;
    }

    // 3. Cmd/Ctrl + A: Select All in current folder
    if (
      (kbEvent.metaKey || kbEvent.ctrlKey) &&
      kbEvent.key.toLowerCase() === 'a'
    ) {
      const children = this.currentFolder()?.children;
      if (children && children.length > 0) {
        kbEvent.preventDefault();
        this.selectedBookmarkIds.set(new Set(children.map((c) => c.id)));
      }
      return;
    }

    // 4. Escape: leave keyboard navigation and deselect all
    if (kbEvent.key === 'Escape') {
      if (this.isKeyboardActive() || this.selectedBookmarkIds().size > 0) {
        kbEvent.preventDefault();
        this.clearKeyboardFocus();
        this.clearSelection();
      }
      return;
    }

    // 5. Delete / Backspace: Delete selected
    if (kbEvent.key === 'Delete' || kbEvent.key === 'Backspace') {
      if (this.selectedBookmarkIds().size > 0) {
        kbEvent.preventDefault();
        this.deleteSelectedBookmarks();
      }
      return;
    }
  }

  private isKeyboardActive(): boolean {
    return !!this.keyboardFocusId() || this.keyboardCrumbIndex() !== undefined;
  }

  private clearKeyboardFocus() {
    this.keyboardFocusId.set(undefined);
    this.keyboardCrumbIndex.set(undefined);
  }

  private handleGridNavigation(event: KeyboardEvent): boolean {
    if (event.altKey) return false;

    const direction = NewTabComponent.NAV_KEYS[event.key];
    if (direction && !event.metaKey && !event.ctrlKey) {
      if (this.keyboardCrumbIndex() !== undefined) {
        this.moveCrumbFocus(direction);
      } else {
        this.moveKeyboardFocus(direction);
      }
      return true;
    }

    if (event.key === 'Enter') {
      const crumbIndex = this.keyboardCrumbIndex();
      if (crumbIndex !== undefined) {
        this.openKeyboardCrumb(crumbIndex);
        return true;
      }
      if (this.keyboardFocusId()) {
        this.openKeyboardFocused(event.metaKey || event.ctrlKey);
        return true;
      }
    }
    return false;
  }

  private getGridCards(): HTMLElement[] {
    return Array.from(
      document.querySelectorAll<HTMLElement>(
        '.bookmark-container > .bookmark-card',
      ),
    );
  }

  // Ancestor crumbs only: the last crumb is the folder already on screen
  private get ancestorCrumbCount(): number {
    return Math.max(this.breadcrumb().length - 1, 0);
  }

  private moveKeyboardFocus(direction: NavDirection) {
    const cards = this.getGridCards();
    const index = cards.findIndex(
      (card) => card.id === `bookmark-${this.keyboardFocusId()}`,
    );
    // The first key press only shows the cursor on the first bookmark
    if (index < 0) {
      if (cards.length > 0) {
        this.setKeyboardFocus(cards[0]);
      } else if (this.isKeyboardActive() || direction === 'up') {
        // Empty folder: the breadcrumb is the only place to go
        this.focusLastCrumb();
      }
      return;
    }

    let next: HTMLElement | undefined;
    if (direction === 'left') {
      next = cards[index - 1];
    } else if (direction === 'right') {
      next = cards[index + 1];
    } else {
      // Nearest row in that direction, then the closest column within it
      const rect = cards[index].getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      let bestScore = Infinity;
      for (const card of cards) {
        const r = card.getBoundingClientRect();
        const inDirection =
          direction === 'up' ? r.bottom <= rect.top + 1 : r.top >= rect.bottom - 1;
        if (!inDirection) continue;
        const score =
          Math.abs(r.top - rect.top) * 1000 +
          Math.abs(r.left + r.width / 2 - centerX);
        if (score < bestScore) {
          bestScore = score;
          next = card;
        }
      }
      // Above the first row sits the breadcrumb
      if (!next && direction === 'up') {
        this.focusLastCrumb();
        return;
      }
    }
    if (next) {
      this.setKeyboardFocus(next);
    }
  }

  private focusLastCrumb() {
    if (this.ancestorCrumbCount === 0) return;
    this.keyboardFocusId.set(undefined);
    this.keyboardCrumbIndex.set(this.ancestorCrumbCount - 1);
  }

  private moveCrumbFocus(direction: NavDirection) {
    const index = this.keyboardCrumbIndex() ?? 0;
    if (direction === 'left') {
      this.keyboardCrumbIndex.set(Math.max(index - 1, 0));
    } else if (direction === 'right') {
      this.keyboardCrumbIndex.set(
        Math.min(index + 1, this.ancestorCrumbCount - 1),
      );
    } else if (direction === 'down') {
      const first = this.getGridCards()[0];
      if (first) {
        this.setKeyboardFocus(first);
      }
    }
  }

  private openKeyboardCrumb(index: number) {
    const crumbs = this.breadcrumb();
    const crumb = crumbs[index];
    if (!crumb) return;
    // Land on the folder we came out of, so going up keeps our place
    const cameFrom = crumbs[index + 1];
    this.onClickCrumb(crumb);
    const focusId = cameFrom?.id ?? crumb.children?.[0]?.id;
    this.keyboardFocusId.set(focusId);
    afterNextRender(
      () => {
        const card = document.getElementById(`bookmark-${focusId}`);
        if (card) {
          card.scrollIntoView({ block: 'nearest' });
          this.updateTitleCardWidth(card);
        }
      },
      { injector: this.injector },
    );
  }

  private setKeyboardFocus(card: HTMLElement) {
    this.keyboardCrumbIndex.set(undefined);
    this.keyboardFocusId.set(card.id.replace(/^bookmark-/, ''));
    card.scrollIntoView({ block: 'nearest' });
    this.updateTitleCardWidth(card);
  }

  private openKeyboardFocused(background: boolean) {
    const item = this.currentFolder()?.children?.find(
      (child) => child.id === this.keyboardFocusId(),
    );
    if (!item) return;

    if (item.type === 'bookmarkFolder') {
      this.breadcrumb.update((crumbs) => [...crumbs, item]);
      // Stay in keyboard mode inside the folder
      this.keyboardFocusId.set(item.children?.[0]?.id);
    } else {
      this.openBookmark(item, background);
    }
  }

  isSearchShortcut(event: KeyboardEvent): boolean {
    const shortcut = this.searchShortcut();
    if (!shortcut) return false;

    const { modifiers, key } = shortcut;

    const meta = modifiers.includes('Meta');
    const ctrl = modifiers.includes('Ctrl');
    const alt = modifiers.includes('Alt');
    const shift = modifiers.includes('Shift');

    if (event.metaKey !== meta) return false;
    if (event.ctrlKey !== ctrl) return false;
    if (event.altKey !== alt) return false;
    if (event.shiftKey !== shift) return false;

    return event.key.toLowerCase() === key?.toLowerCase();
  }

  onBackgroundDblClick(event: MouseEvent) {
    // Only trigger if clicking on the background, not on bookmark cards
    const target = event.target as HTMLElement;
    if (target.closest('.bookmark-card')) {
      return;
    }
    this.openBookmarkSearch();
  }

  openBookmarkSearch() {
    this.searchBox?.focus();
  }

  formattedShortcutKey = computed(() => {
    const shortcut = this.searchShortcut();
    if (!shortcut) return '⌘K';
    const isMac =
      typeof navigator !== 'undefined' &&
      /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    const modMap: Record<string, string> = {
      Meta: isMac ? '⌘' : 'Win',
      Ctrl: isMac ? '⌃' : 'Ctrl',
      Alt: isMac ? '⌥' : 'Alt',
      Shift: isMac ? '⇧' : 'Shift',
    };
    const keyMap: Record<string, string> = {
      ' ': 'Space',
      ArrowUp: '↑',
      ArrowDown: '↓',
      ArrowLeft: '←',
      ArrowRight: '→',
      Enter: '↵',
      Escape: 'Esc',
      Backspace: '⌫',
      Tab: 'Tab',
    };
    const mods = (shortcut.modifiers || [])
      .map((m) => modMap[m] || m)
      .join(isMac ? '' : '+');
    const rawKey = shortcut.key || 'k';
    const key = keyMap[rawKey] || rawKey.toUpperCase();
    if (!mods) return key;
    return isMac ? `${mods}${key}` : `${mods}+${key}`;
  });

  private async openSettingsModalInstance(): Promise<ComponentRef<SettingsModalComponent>> {
    return this.modalService.openLazy(
      () =>
        import('./settings-modal/settings-modal.component').then(
          (m) => m.SettingsModalComponent,
        ),
    );
  }

  private async openBookmarkModal(
    inputs?: Partial<BookmarkModalComponent>,
  ): Promise<ComponentRef<BookmarkModalComponent>> {
    return this.modalService.openLazy(
      () =>
        import('./bookmark-modal/bookmark-modal.component').then(
          (m) => m.BookmarkModalComponent,
        ),
      inputs,
    );
  }

  private async openConfirmModal(
    inputs?: Partial<ConfirmModalComponent>,
  ): Promise<ComponentRef<ConfirmModalComponent>> {
    return this.modalService.openLazy(
      () =>
        import('./confirm-modal/confirm-modal.component').then(
          (m) => m.ConfirmModalComponent,
        ),
      inputs,
    );
  }

  private async openMoveModal(
    inputs?: Partial<BookmarkMoveModalComponent>,
  ): Promise<ComponentRef<BookmarkMoveModalComponent>> {
    return this.modalService.openLazy(
      () =>
        import('./bookmark-move-modal/bookmark-move-modal.component').then(
          (m) => m.BookmarkMoveModalComponent,
        ),
      inputs,
    );
  }

  async openSettingsModal() {
    return this.openSettingsModalInstance();
  }

  async openCreateBookmarkModal() {
    const ref = await this.openBookmarkModal({
      title: this.i18n.t('createBookmark'),
      bookmark: {
        id: '',
        title: '',
        type: 'bookmark' as const,
        parentId: this.currentFolder()?.id || this.rootFolder()?.id,
      },
    });
    ref.instance.confirm.subscribe(() => {
      this.toastService.show(this.i18n.t('bookmarkCreated'), 'success');
    });
  }

  async openCreateFolderModal() {
    const ref = await this.openBookmarkModal({
      title: this.i18n.t('createFolder'),
      bookmark: {
        id: '',
        title: '',
        type: 'bookmarkFolder' as const,
        parentId: this.currentFolder()?.id || this.rootFolder()?.id,
      },
    });
    ref.instance.confirm.subscribe(() => {
      this.toastService.show(this.i18n.t('folderCreated'), 'success');
    });
  }

  onSelectionMouseDown(event: MouseEvent) {
    if (event.button !== 0) return;
    this.clearKeyboardFocus();
    const target = event.target as HTMLElement;
    if (target.closest('.bookmark-card')) return;
    if (
      event.offsetX > target.clientWidth ||
      event.offsetY > target.clientHeight
    )
      return;

    this.isSelectionDragging = true;
    this.selectionBox.set({
      visible: true,
      startX: event.clientX,
      startY: event.clientY,
      left: event.clientX,
      top: event.clientY,
      width: 0,
      height: 0,
    });

    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      this.initialSelectedIds = new Set(this.selectedBookmarkIds());
    } else {
      this.selectedBookmarkIds.set(new Set());
      this.initialSelectedIds = new Set();
    }

    document.body.style.userSelect = 'none';
    // Only listen to document mouse events while a selection drag is active,
    // so ordinary mouse movement does not trigger change detection
    document.addEventListener('mousemove', this.onSelectionMouseMove);
    document.addEventListener('mouseup', this.onSelectionMouseUp);
  }

  private onSelectionMouseMove = (event: MouseEvent) => {
    if (!this.isSelectionDragging) return;

    const currentX = event.clientX;
    const currentY = event.clientY;

    this.selectionBox.update((box) => ({
      ...box,
      left: Math.min(box.startX, currentX),
      top: Math.min(box.startY, currentY),
      width: Math.abs(currentX - box.startX),
      height: Math.abs(currentY - box.startY),
    }));

    this.calculateSelection();
  };

  private onSelectionMouseUp = () => {
    this.stopSelectionDrag();
  };

  private stopSelectionDrag() {
    document.removeEventListener('mousemove', this.onSelectionMouseMove);
    document.removeEventListener('mouseup', this.onSelectionMouseUp);
    if (this.isSelectionDragging) {
      this.isSelectionDragging = false;
      this.selectionBox.update((box) => ({ ...box, visible: false }));
      document.body.style.userSelect = '';
    }
  }

  private calculateSelection() {
    const box = this.selectionBox();
    const cards = document.querySelectorAll('.bookmark-card');
    const selected = new Set(this.initialSelectedIds);

    cards.forEach((card) => {
      const rect = card.getBoundingClientRect();
      const intersect = !(
        rect.right < box.left ||
        rect.left > box.left + box.width ||
        rect.bottom < box.top ||
        rect.top > box.top + box.height
      );

      const id = card.getAttribute('id')?.replace('bookmark-', '');
      if (id && intersect) {
        selected.add(id);
      }
    });
    this.selectedBookmarkIds.set(selected);
  }

  private clearSelection() {
    this.selectedBookmarkIds.set(new Set());
  }

  private toggleSelection(id: string) {
    this.selectedBookmarkIds.update((ids) => {
      const next = new Set(ids);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  onClick(event: MouseEvent, item: Bookmark | Window) {
    if (item?.type === 'bookmark' || item?.type === 'bookmarkFolder') {
      const bookmark = item as Bookmark;
      // If already in multi-selection mode, toggle selection on left click
      if (this.selectedBookmarkIds().size > 0 && event.button === 0) {
        this.toggleSelection(bookmark.id);
        event.stopPropagation();
        event.preventDefault();
        return;
      }

      if (event.button === 0 && this.selectedBookmarkIds().size > 0) {
        this.clearSelection();
      }
    }

    switch (item?.type) {
      case 'bookmark': {
        // Holding Command (macOS), Ctrl (Windows), or Middle Click (button 1) opens in background tab
        this.openBookmark(
          item as Bookmark,
          event.metaKey || event.ctrlKey || event.button === 1,
        );
        break;
      }
      case 'bookmarkFolder': {
        const bookmark = item as Bookmark;
        if (event.button === 1) {
          // Middle click on folder: open all child bookmark URLs
          const urls = (bookmark.children || [])
            .filter((c) => c.type === 'bookmark' && c.url)
            .map((c) => c.url as string);
          if (urls.length > 0) {
            this.tabService
              .createTab(urls, { active: false })
              .then((tabIds) => {
                if (tabIds && tabIds.length > 1) {
                  this.tabService.createTabGroup(tabIds, bookmark.title);
                }
              });
          }
        } else {
          this.clearKeyboardFocus();
          this.breadcrumb.update((crumbs) => [...crumbs, bookmark]);
        }
        break;
      }
      default:
        break;
    }
    event.stopPropagation();
    event.preventDefault();
  }

  private openBookmark(bookmark: Bookmark, background: boolean) {
    if (background || this.bookmarkOpenInNewTab()) {
      this.tabService.createTab([bookmark.url!], {
        active: false,
      });
    } else {
      this.tabService.updateCurrentTab(bookmark.url!);
    }
  }

  onDoublClick(event: MouseEvent, item: Window) {
    event.stopPropagation();
    this.tabService.focusWindow(item);
  }

  onContextMenu(
    event: MouseEvent,
    item: Bookmark | Window | undefined = undefined,
  ) {
    let items: ContextMenuItem[];
    switch (item?.type) {
      case 'bookmark':
        items = this.getBookmarkContextMenuItems(item as Bookmark);
        break;
      case 'bookmarkFolder':
        items = this.getBookmarkFolderContextMenuItems(item as Bookmark);
        break;
      default:
        items = this.getBackgroundContextMenuItems();
    }
    this.openContextMenu(event, items);
  }

  onDropListDropped(event: CdkDragDrop<Bookmark[]>) {
    const dragItem = event.item.data;
    const dragItemType = dragItem?.type;
    const droppedItem = event.container.data[event.currentIndex];
    const droppedItemType = droppedItem?.type;

    // cdkDragEnded fires before cdkDropListDropped, so the target was saved on release
    const targetId = this.releasedTargetId;
    const insertIndex = this.releasedInsertIndex;
    this.releasedTargetId = undefined;
    this.releasedInsertIndex = -1;
    if (
      targetId &&
      (dragItemType === 'bookmark' || dragItemType === 'bookmarkFolder')
    ) {
      this.moveIntoFolder(dragItem as Bookmark, targetId, insertIndex);
      this.resetDragState();
      return;
    }

    if (
      dragItem === undefined ||
      droppedItem === undefined ||
      dragItem === droppedItem
    ) {
      this.resetDragState();
      return;
    }

    switch (`${dragItemType}->${droppedItemType}`) {
      case 'bookmark->bookmark':
      case 'bookmarkFolder->bookmark':
      case 'bookmark->bookmarkFolder':
      case 'bookmarkFolder->bookmarkFolder': {
        const bookmark = dragItem as Bookmark;
        const bookmarkTarget = droppedItem as Bookmark;

        const targetIndex =
          bookmark.index! < bookmarkTarget.index!
            ? bookmarkTarget.index! + 1
            : bookmarkTarget.index!;

        this.bookmarkService.move(
          bookmark.id,
          {
            index: targetIndex,
          },
          false,
        );

        // no reload the bookmarks, just move and re-index
        moveItemInArray(
          event.container.data,
          bookmark.index!,
          bookmarkTarget.index!,
        );

        event.container.data.forEach((b, i) => {
          b.index = i;
        });
        break;
      }
    }
    this.resetDragState();
  }

  onDragStarted(item: Bookmark | Window) {
    // cannot add event.preventDefault() or it will stop the next dragover/dragleave event
    this.draggedItem.set(item);
    this.dragPreview = undefined;
    this.previewOffset = undefined;

    // The CDK sorts before it emits cdkDragMoved, so hit tests must run
    // earlier, in the capture phase, for canSortInto to see this move
    const track = (e: PointerEvent) => {
      if (!this.previewOffset) return;
      this.updateDropTarget(
        e.clientX - this.previewOffset.x,
        e.clientY - this.previewOffset.y,
      );
    };
    window.addEventListener('pointermove', track, { capture: true });
    this.stopPointerTracking = () =>
      window.removeEventListener('pointermove', track, { capture: true });
  }

  // Hit tests follow the center of the card the user sees (the preview),
  // not wherever they grabbed it
  onDragMoved(event: CdkDragMove) {
    this.syncDragPreview();
    const icon = this.dragPreview?.querySelector('.icon-container');
    if (!icon) return;
    const r = icon.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    this.previewOffset ??= {
      x: event.pointerPosition.x - x,
      y: event.pointerPosition.y - y,
    };
    this.updateDropTarget(x, y);
  }

  onDragReleased() {
    this.clearPendingTarget();
    // Leaving the open panel cancels the drop even before it closes
    this.releasedTargetId = this.springCloseTimer ? undefined : this.dropTargetId();
    this.releasedInsertIndex = this.springFolder() ? this.springInsertIndex() : -1;
    if (this.releasedTargetId) {
      this.flyPreviewIntoFolder(this.releasedTargetId);
    }
  }

  onDragEnded() {
    this.resetDragState();
  }

  private resetDragState() {
    this.stopPointerTracking?.();
    this.stopPointerTracking = undefined;
    this.draggedItem.set(undefined);
    this.dropTargetId.set(undefined);
    this.clearPendingTarget();
    this.closeSpringFolder();
    this.edgeFolderId = undefined;
    this.edgeFarSide = false;
    this.dragPreview = undefined;
  }

  // Ids that cannot take the drop: the dragged card and, for a multi-drag,
  // everything selected with it
  private draggedIds(): ReadonlySet<string> {
    const dragged = this.draggedItem() as Bookmark | undefined;
    if (!dragged) return new Set();
    const selected = this.selectedBookmarkIds();
    return selected.size > 1 && selected.has(dragged.id)
      ? selected
      : new Set([dragged.id]);
  }

  isDragCompanion(item: Bookmark): boolean {
    const dragged = this.draggedItem();
    return !!dragged && dragged !== item && this.draggedIds().has(item.id);
  }

  private updateDropTarget(x: number, y: number) {
    if (this.springFolder()) {
      this.updateSpringPanel(x, y);
      return;
    }

    const excluded = this.draggedIds();
    const current = this.dropTargetId();
    let hit: string | undefined;
    let edge: string | undefined;
    let farSide = false;

    const icons = document.querySelectorAll<HTMLElement>(
      '.bookmark-container [data-folder-id]',
    );
    for (const icon of Array.from(icons)) {
      const id = icon.dataset['folderId']!;
      if (excluded.has(id)) continue;
      // The whole card counts as the folder's edge, title included
      const card = icon.closest<HTMLElement>('.bookmark-card') ?? icon;
      const c = card.getBoundingClientRect();
      if (x < c.left || x > c.right || y < c.top || y > c.bottom) continue;
      const r = icon.getBoundingClientRect();
      const zone =
        id === current ? NewTabComponent.DROP_ZONE_HOLD : NewTabComponent.DROP_ZONE;
      const insetX = (r.width * (1 - zone)) / 2;
      const insetY = (r.height * (1 - zone)) / 2;
      const inside =
        x > r.left + insetX &&
        x < r.right - insetX &&
        y > r.top + insetY &&
        y < r.bottom - insetY;
      if (inside) {
        hit = id;
      } else {
        edge = id;
        farSide = this.isPastFolder(card, r, x, y);
      }
      break;
    }

    if (hit) {
      this.edgeFolderId = undefined;
      if (hit !== current && hit !== this.pendingTargetId) {
        this.clearPendingTarget();
        this.pendingTargetId = hit;
        this.pendingTargetTimer = setTimeout(() => {
          this.pendingTargetId = undefined;
          if (this.draggedItem()) {
            this.dropTargetId.set(hit);
            this.syncDragPreview();
            this.scheduleSpringOpen(hit);
          }
        }, NewTabComponent.DROP_DWELL_MS);
      }
      return;
    }

    this.clearPendingTarget();
    if (current) {
      clearTimeout(this.springOpenTimer);
      this.dropTargetId.set(undefined);
      this.syncDragPreview();
    }
    if (edge !== this.edgeFolderId) {
      this.edgeFolderId = edge;
      this.edgeSince = Date.now();
    }
    this.edgeFarSide = farSide;
  }

  // Whether the point lies on the folder's side away from the dragged card's
  // slot: after it in reading order when the slot is before it, and vice versa
  private isPastFolder(card: HTMLElement, icon: DOMRect, x: number, y: number): boolean {
    const slot = document.querySelector('.bookmark-container .cdk-drag-placeholder');
    if (!slot) return false;
    const slotBefore = !!(
      slot.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING
    );
    const centerX = icon.left + icon.width / 2;
    return slotBefore
      ? x > centerX || y > icon.bottom
      : x < centerX || y < icon.top;
  }

  private scheduleSpringOpen(folderId: string) {
    clearTimeout(this.springOpenTimer);
    this.springOpenTimer = setTimeout(() => {
      if (this.draggedItem() && this.dropTargetId() === folderId) {
        this.openSpringFolder(folderId);
      }
    }, NewTabComponent.SPRING_OPEN_MS);
  }

  private openSpringFolder(folderId: string) {
    const folder = this.currentFolder()?.children?.find((c) => c.id === folderId);
    const icon = document.querySelector<HTMLElement>(
      `.bookmark-container [data-folder-id="${folderId}"]`,
    );
    const container = document.querySelector<HTMLElement>('.bookmark-scroll-viewport');
    if (!folder || !icon || !container) return;

    const count = folder.children?.length ?? 0;
    const columns = Math.max(1, Math.min(NewTabComponent.SPRING_COLUMNS, count));
    const rows = Math.min(3, Math.max(1, Math.ceil(count / columns)));
    // 16px padding each side plus the 1px surface border
    const width = Math.max(240, columns * NewTabComponent.SPRING_CELL + 34);
    const height = 52 + rows * (NewTabComponent.SPRING_CELL + 20) + 16;

    // The drag preview cannot leave the viewport, so keep the panel inside it
    const r = icon.getBoundingClientRect();
    const bounds = container.getBoundingClientRect();
    const margin = 16;
    const left = Math.min(
      Math.max(r.left + r.width / 2 - width / 2, bounds.left + margin),
      Math.max(bounds.left + margin, bounds.right - width - margin),
    );
    const below = r.bottom + margin;
    const above = r.top - margin - height;
    const top =
      below + height <= Math.min(bounds.bottom, window.innerHeight) || above < bounds.top
        ? below
        : above;

    this.springPanelPos.set({ left, top, width });
    this.springInsertIndex.set(-1);
    this.springFolder.set(folder);
  }

  private closeSpringFolder() {
    clearTimeout(this.springOpenTimer);
    clearTimeout(this.springCloseTimer);
    this.springCloseTimer = undefined;
    this.springFolder.set(undefined);
    this.springInsertIndex.set(-1);
  }

  // While the panel is open, the card may rest on the panel or the folder;
  // anywhere else closes it after a short grace period
  private updateSpringPanel(x: number, y: number) {
    const folder = this.springFolder()!;
    const panel = document.querySelector<HTMLElement>('.spring-panel');
    const icon = document.querySelector<HTMLElement>(
      `.bookmark-container [data-folder-id="${folder.id}"]`,
    );
    const within = (el: HTMLElement | null) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };

    if (panel && within(panel)) {
      this.cancelSpringClose();
      this.springInsertIndex.set(this.springIndexAt(panel, x, y));
      return;
    }
    this.springInsertIndex.set(-1);
    if (within(icon)) {
      this.cancelSpringClose();
      return;
    }
    this.springCloseTimer ??= setTimeout(() => {
      this.closeSpringFolder();
      this.dropTargetId.set(undefined);
      this.syncDragPreview();
    }, NewTabComponent.SPRING_CLOSE_MS);
  }

  private cancelSpringClose() {
    clearTimeout(this.springCloseTimer);
    this.springCloseTimer = undefined;
  }

  // Insertion index in reading order: before the first item the point is
  // above, or left of the middle of, on its row
  private springIndexAt(panel: HTMLElement, x: number, y: number): number {
    const items = Array.from(
      panel.querySelectorAll<HTMLElement>('[data-spring-index]'),
    );
    for (const [i, item] of items.entries()) {
      const r = item.getBoundingClientRect();
      if (y < r.top || (y <= r.bottom && x < r.left + r.width / 2)) return i;
    }
    return items.length;
  }

  private clearPendingTarget() {
    clearTimeout(this.pendingTargetTimer);
    this.pendingTargetId = undefined;
  }

  // Sorting freezes while a folder is (about to be) the target, and a folder
  // only gives way after the card has rested on its edge
  readonly canSortInto = (
    index: number,
    drag: CdkDrag<Bookmark>,
    drop: CdkDropList<Bookmark[]>,
  ): boolean => {
    if (this.dropTargetId() || this.pendingTargetId) return false;
    const target = drop.getSortedItems()[index]?.data as Bookmark | undefined;
    if (!target || target.type !== 'bookmarkFolder' || target === drag.data) {
      return true;
    }
    return (
      this.edgeFolderId === target.id &&
      (this.edgeFarSide ||
        Date.now() - this.edgeSince >= NewTabComponent.EDGE_REORDER_MS)
    );
  };

  // The CDK preview lives under <body>; mirror the drag state onto it
  private syncDragPreview() {
    this.dragPreview ??=
      document.querySelector<HTMLElement>('.bookmark-card.cdk-drag-preview') ??
      undefined;
    const preview = this.dragPreview;
    if (!preview) return;
    preview.classList.toggle('is-over-folder', !!this.dropTargetId());
    const count = this.draggedIds().size;
    if (count > 1) {
      preview.dataset['dragCount'] = String(count);
    }
  }

  // Shrink a copy of the preview into the folder; the real preview is hidden
  // so the CDK skips its return-to-slot animation
  private flyPreviewIntoFolder(folderId: string) {
    const preview = this.dragPreview;
    const folderIcon =
      document.querySelector<HTMLElement>(
        '.spring-panel .is-insert-before, .spring-panel .is-insert-after',
      ) ??
      document.querySelector<HTMLElement>(
        `.bookmark-container [data-folder-id="${folderId}"]`,
      );
    if (!preview || !folderIcon) return;

    const card = preview.getBoundingClientRect();
    const icon = (preview.querySelector('.icon-container') ?? preview).getBoundingClientRect();
    const to = folderIcon.getBoundingClientRect();
    const fromX = icon.left + icon.width / 2;
    const fromY = icon.top + icon.height / 2;
    const dx = to.left + to.width / 2 - fromX;
    const dy = to.top + to.height / 2 - fromY;

    const ghost = preview.cloneNode(true) as HTMLElement;
    ghost.classList.add('is-drop-ghost');
    ghost.style.transformOrigin = `${fromX - card.left}px ${fromY - card.top}px`;
    document.body.appendChild(ghost);
    preview.classList.add('is-dropping-in');

    const base = ghost.style.transform;
    ghost
      .animate(
        [
          { transform: base, opacity: 1 },
          { transform: `${base} translate(${dx}px, ${dy}px) scale(0.2)`, opacity: 0 },
        ],
        { duration: 220, easing: 'cubic-bezier(0.4, 0, 1, 1)' },
      )
      .finished.catch(() => undefined)
      .finally(() => ghost.remove());
  }

  private async moveIntoFolder(dragged: Bookmark, folderId: string, index = -1) {
    const children = this.currentFolder()?.children ?? [];
    const folder = children.find((c) => c.id === folderId);
    if (!folder) return;

    const selected = this.selectedBookmarkIds();
    const moving =
      selected.size > 1 && selected.has(dragged.id)
        ? children.filter((c) => selected.has(c.id) && c.id !== folderId)
        : [dragged];
    const origins = moving.map((b) => ({
      id: b.id,
      parentId: b.parentId,
      index: b.index,
    }));
    if (moving.length > 1) this.clearSelection();

    this.movingOutIds.set(new Set(moving.map((b) => b.id)));
    clearTimeout(this.dropPulseTimer);
    this.dropPulseId.set(folderId);
    this.dropPulseTimer = setTimeout(() => this.dropPulseId.set(undefined), 320);

    try {
      for (const [i, b] of moving.entries()) {
        await this.bookmarkService.move(
          b.id,
          { parentId: folderId, index: index >= 0 ? index + i : undefined },
          i === moving.length - 1,
        );
      }
    } finally {
      this.movingOutIds.set(new Set());
    }

    const message =
      moving.length > 1
        ? this.i18n.t('movedItemsIntoFolder', [String(moving.length), folder.title])
        : this.i18n.t('movedIntoFolder', folder.title);
    this.toastService.show(message, 'success', 4000, {
      label: this.i18n.t('undo'),
      run: () => this.undoMoveIntoFolder(origins),
    });
  }

  private async undoMoveIntoFolder(
    origins: { id: string; parentId?: string; index?: number }[],
  ) {
    // Ascending original index puts every card back exactly where it was
    const ordered = [...origins].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    for (const [i, o] of ordered.entries()) {
      await this.bookmarkService.move(
        o.id,
        { parentId: o.parentId, index: o.index },
        i === ordered.length - 1,
      );
    }
  }

  onBookmarkMouseEnter(event: MouseEvent) {
    if (this.draggedItem()) return;
    const card = event.currentTarget as HTMLElement | null;
    if (!card) return;
    // In keyboard mode the cursor follows the mouse
    if (this.isKeyboardActive()) {
      this.keyboardCrumbIndex.set(undefined);
      this.keyboardFocusId.set(card.id.replace(/^bookmark-/, ''));
    }
    this.updateTitleCardWidth(card);
  }

  // Widest the hover title card can grow without covering neighbour titles
  private updateTitleCardWidth(card: HTMLElement) {
    const container = card.parentElement;
    if (!container) return;

    const cardRect = card.getBoundingClientRect();
    const centerX = cardRect.left + cardRect.width / 2;
    const containerRect = container.getBoundingClientRect();
    const SAFETY_MARGIN = 8;
    const ABSOLUTE_MAX_WIDTH = 320;

    const cards = Array.from(
      container.querySelectorAll('.bookmark-card')
    ) as HTMLElement[];
    let leftNeighbor: HTMLElement | null = null;
    let rightNeighbor: HTMLElement | null = null;
    let minLeftDistance = Infinity;
    let minRightDistance = Infinity;

    for (const otherCard of cards) {
      if (otherCard === card) continue;
      const otherRect = otherCard.getBoundingClientRect();
      if (Math.abs(otherRect.top - cardRect.top) < 20) {
        if (otherRect.left < cardRect.left) {
          const dist = cardRect.left - otherRect.left;
          if (dist < minLeftDistance) {
            minLeftDistance = dist;
            leftNeighbor = otherCard;
          }
        } else if (otherRect.left > cardRect.left) {
          const dist = otherRect.left - cardRect.left;
          if (dist < minRightDistance) {
            minRightDistance = dist;
            rightNeighbor = otherCard;
          }
        }
      }
    }

    let maxLeftReach: number;
    if (leftNeighbor) {
      const leftTitle = leftNeighbor.querySelector('.bookmark-title') as HTMLElement | null;
      const leftBoundary = leftTitle
        ? leftTitle.getBoundingClientRect().right
        : leftNeighbor.getBoundingClientRect().right;
      maxLeftReach = centerX - (leftBoundary + SAFETY_MARGIN);
    } else {
      maxLeftReach = centerX - (containerRect.left + SAFETY_MARGIN);
    }

    let maxRightReach: number;
    if (rightNeighbor) {
      const rightTitle = rightNeighbor.querySelector('.bookmark-title') as HTMLElement | null;
      const rightBoundary = rightTitle
        ? rightTitle.getBoundingClientRect().left
        : rightNeighbor.getBoundingClientRect().left;
      maxRightReach = (rightBoundary - SAFETY_MARGIN) - centerX;
    } else {
      maxRightReach = (containerRect.right - SAFETY_MARGIN) - centerX;
    }

    const halfWidth = Math.max(0, Math.min(maxLeftReach, maxRightReach));
    let calculatedMaxWidth = halfWidth * 2;
    calculatedMaxWidth = Math.max(cardRect.width, calculatedMaxWidth);
    calculatedMaxWidth = Math.min(calculatedMaxWidth, ABSOLUTE_MAX_WIDTH);

    card.style.setProperty(
      '--tooltip-max-width',
      `${Math.floor(calculatedMaxWidth)}px`
    );
  }

  onBookmarkMouseLeave(event: MouseEvent) {
    const card = event.currentTarget as HTMLElement | null;
    if (!card || card.classList.contains('is-kb-focused')) return;
    card.style.removeProperty('--tooltip-max-width');
  }

  onClickCrumb(crumb: Bookmark) {
    this.clearKeyboardFocus();
    const index = this.breadcrumb().indexOf(crumb);
    this.breadcrumb.update((crumbs) => crumbs.slice(0, index + 1));
  }

  onDockFolderClick({
    event,
    folder,
  }: {
    event: MouseEvent;
    folder: Bookmark;
  }) {
    if (!folder) return;
    if (event?.button === 1) {
      this.onClick(event, folder);
      return;
    }
    const root = this.rootFolder();
    if (!root) return;
    const path = this.findPathToFolder(root, folder.id);
    this.breadcrumb.set(path ?? [root, folder]);
  }

  onDockBookmarkClick({
    event,
    bookmark,
  }: {
    event: MouseEvent;
    bookmark: Bookmark;
  }) {
    this.onClick(event, bookmark);
  }

  private findPathToFolder(
    current: Bookmark,
    targetId: string,
  ): Bookmark[] | null {
    if (!current) return null;
    if (current.id === targetId) {
      return [current];
    }
    if (current.children) {
      for (const child of current.children) {
        if (child.type === 'bookmarkFolder') {
          const path = this.findPathToFolder(child, targetId);
          if (path) {
            return [current, ...path];
          }
        }
      }
    }
    return null;
  }

  onDockBookmarkContextMenu({
    event,
    bookmark,
  }: {
    event: MouseEvent;
    bookmark: Bookmark;
  }) {
    this.onContextMenu(event, bookmark);
  }

  toggleToolbox(): void {
    this.isToolboxOpen.update((open) => !open);
  }

  async openToolModal(toolId: ToolId): Promise<void> {
    this.isToolboxOpen.set(false);
    if (toolId === 'calculator') {
      if (typeof window !== 'undefined') {
        window.history.pushState(null, '', '/index.html?target=calculator');
      }
      void this.router.navigateByUrl('/calculator', { skipLocationChange: true });
      return;
    }
    const { ToolboxModalComponent } = await import(
      './toolbox/toolbox-modal.component'
    );
    const ref = this.modalService.open(ToolboxModalComponent, { toolId });
    ref.instance.closeModal.subscribe(() => this.modalService.close());
  }

  async openToolboxManagerModal(): Promise<void> {
    this.isToolboxOpen.set(false);
    const { ToolboxManagerModalComponent } = await import(
      './toolbox/toolbox-manager-modal.component'
    );
    const ref = this.modalService.open(ToolboxManagerModalComponent);
    ref.instance.closeModal.subscribe(() => this.modalService.close());
  }

  onMenuToolContextMenu(event: MouseEvent, tool: ToolDefinition): void {
    const items: ContextMenuItem[] = [
      {
        label: this.i18n.t('openTool'),
        action: () => {
          void this.openToolModal(tool.id);
        },
      },
      {
        label: this.i18n.t('unpinFromMenu'),
        action: () => {
          void this.toolboxService.togglePinToMenu(tool.id);
          this.toastService.show(
            this.i18n.t('unpinnedFromMenuToast', [this.i18n.t(tool.nameKey)]),
            'success',
          );
        },
      },
    ];
    this.openContextMenu(event, items);
  }

  async openMoveToFolderModal() {
    if (this.selectedBookmarkIds().size === 0) return;
    const ref = await this.openMoveModal({
      selectedBookmarkIds: Array.from(this.selectedBookmarkIds()),
      currentFolderId: this.currentFolder()?.id,
    });
    ref.instance.confirm.subscribe(() => {
      this.clearSelection();
    });
  }

  openSelectedBookmarks() {
    const urls: string[] = [];
    const currentFolder = this.currentFolder();
    const selectedIds = this.selectedBookmarkIds();
    (currentFolder?.children || [])
      .filter((b) => selectedIds.has(b.id))
      .forEach((b) => {
        if (b.type === 'bookmark' && b.url) {
          urls.push(b.url);
        } else if (b.type === 'bookmarkFolder' && b.children) {
          urls.push(
            ...b.children
              .filter((c) => c.type === 'bookmark' && c.url)
              .map((c) => c.url as string),
          );
        }
      });

    if (urls.length > 0) {
      this.tabService.createTab(urls).then((tabIds) => {
        if (tabIds && tabIds.length > 0 && urls.length > 1) {
          this.tabService.createTabGroup(
            tabIds,
            currentFolder?.title || 'Bookmarks',
          );
        }
      });
    } else {
      this.toastService.show(this.i18n.t('noBookmarkToOpen'), 'info');
    }
  }

  async deleteSelectedBookmarks() {
    if (this.selectedBookmarkIds().size === 0) return;
    const ref = await this.openConfirmModal({
      title: this.i18n.t('confirmDeleteBookmark'),
      confirmButtonClass: 'btn-error',
    });
    ref.instance.confirm.subscribe(() => {
      this.selectedBookmarkIds().forEach((id) => {
        const bookmark = this.currentFolder()?.children?.find(
          (c) => c.id === id,
        );
        if (bookmark) {
          this.bookmarkService.delete(bookmark);
        }
      });
      this.clearSelection();
      this.toastService.show(this.i18n.t('bookmarkDeleted'), 'warning');
    });
  }

  deselectAll() {
    this.clearSelection();
  }

  private getMultiSelectionContextMenuItems(): ContextMenuItem[] {
    const items: ContextMenuItem[] = [];
    items.push({
      label: this.i18n.t('moveIntoFolder'),
      action: () => {
        this.openMoveToFolderModal();
      },
    });
    items.push({
      label:
        this.i18n.t('openAllBookmarks') || this.i18n.t('openAllInNewWindow'),
      action: () => {
        this.openSelectedBookmarks();
      },
    });
    items.push({
      label: this.i18n.t('delete'),
      action: () => {
        this.deleteSelectedBookmarks();
      },
    });
    return items;
  }

  private getBookmarkContextMenuItems(bookmark: Bookmark): ContextMenuItem[] {
    if (
      this.selectedBookmarkIds().size > 1 &&
      this.selectedBookmarkIds().has(bookmark.id)
    ) {
      return this.getMultiSelectionContextMenuItems();
    }
    const items: ContextMenuItem[] = [];
    items.push({
      label: this.i18n.t('openInNewTab'),
      action: () => {
        this.tabService.createTab([bookmark.url!], {
          active: this.bookmarkOpenInNewTab(),
        });
      },
    });
    items.push({
      label: this.i18n.t('openInNewWindow'),
      action: () => {
        this.tabService.createWindow(bookmark.url!);
      },
    });
    items.push({
      label: this.i18n.t('openInIncognito'),
      action: () => {
        this.tabService.createWindow(bookmark.url!, true);
      },
    });
    items.push({
      label: this.i18n.t('edit'),
      action: () => {
        this.openBookmarkModal({
          title: this.i18n.t('editBookmark'),
          bookmark: bookmark,
        }).then((ref) => {
          ref.instance.confirm.subscribe(() => {
            this.toastService.show(this.i18n.t('bookmarkUpdated'), 'info');
          });
        });
      },
    });
    items.push({
      label: this.i18n.t('delete'),
      action: () => {
        this.openConfirmModal({
          title: this.i18n.t('confirmDeleteBookmark'),
          confirmButtonClass: 'btn-error',
        }).then((ref) => {
          ref.instance.confirm.subscribe(() => {
            this.bookmarkService.delete(bookmark);
            this.toastService.show(this.i18n.t('bookmarkDeleted'), 'warning');
          });
        });
      },
    });
    return items;
  }

  private getBookmarkFolderContextMenuItems(
    bookmark: Bookmark,
  ): ContextMenuItem[] {
    if (
      this.selectedBookmarkIds().size > 1 &&
      this.selectedBookmarkIds().has(bookmark.id)
    ) {
      return this.getMultiSelectionContextMenuItems();
    }
    const items: ContextMenuItem[] = [];
    items.push({
      label: this.i18n.t('openAllBookmarks'),
      action: () => {
        if (!bookmark.children || bookmark.children.length === 0) {
          this.toastService.show(this.i18n.t('noBookmarkToOpen'), 'info');
          return;
        }
        const f = async () => {
          const tabIds = await this.tabService.createTab(
            bookmark
              .children!.filter((u): u is Bookmark => !!u.url)
              .map((b) => b.url) as string[],
          );
          if (tabIds && tabIds.length > 0) {
            this.tabService.createTabGroup(tabIds, bookmark.title);
          }
        };
        if (bookmark.children.length <= 5) {
          f();
          return;
        }
        this.openConfirmModal({
          title: this.i18n.t('confirmOpenAll', [
            bookmark.children.length.toString(),
          ]),
        }).then((ref) => {
          ref.instance.confirm.subscribe(f);
        });
      },
    });
    items.push({
      label: this.i18n.t('openAllInNewWindow'),
      action: () => {
        if (!bookmark.children || bookmark.children.length === 0) {
          this.toastService.show(this.i18n.t('noBookmarkToOpen'), 'info');
          return;
        }
        const f = async () => {
          const newWindow = await this.tabService.createWindow(
            bookmark
              .children!.map((b) => b.url)
              .filter((u): u is string => !!u),
          );
          if (!!newWindow && newWindow.tabs) {
            this.tabService.createTabGroup(
              newWindow.tabs.map((t) => t.id!),
              bookmark.title,
              newWindow.id,
            );
          }
        };
        if (bookmark.children.length <= 5) {
          f();
          return;
        }
        this.openConfirmModal({
          title: this.i18n.t('confirmOpenAllInNewWindow'),
        }).then((ref) => {
          ref.instance.confirm.subscribe(f);
        });
      },
    });
    items.push({
      label: this.i18n.t('openAllInIncognito'),
      action: () => {
        if (!bookmark.children || bookmark.children.length === 0) {
          this.toastService.show(this.i18n.t('noBookmarkToOpen'), 'info');
          return;
        }
        const f = async () => {
          await this.tabService.createWindow(
            bookmark
              .children!.map((b) => b.url)
              .filter((u): u is string => !!u),
            true,
          );
        };
        if (bookmark.children.length <= 5) {
          f();
          return;
        }
        this.openConfirmModal({
          title: this.i18n.t('confirmOpenAllInIncognito'),
        }).then((ref) => {
          ref.instance.confirm.subscribe(f);
        });
      },
    });
    items.push({
      label: this.i18n.t('edit'),
      action: () => {
        this.openBookmarkModal({
          title: this.i18n.t('editBookmarkFolder'),
          bookmark: bookmark,
        }).then((ref) => {
          ref.instance.confirm.subscribe(() => {
            this.toastService.show(
              this.i18n.t('bookmarkFolderUpdated'),
              'info',
            );
          });
        });
      },
    });
    items.push({
      label: this.i18n.t('delete'),
      action: () => {
        this.openConfirmModal({
          title: this.i18n.t('confirmDeleteBookmarkFolder'),
          confirmButtonClass: 'btn-error',
        }).then((ref) => {
          ref.instance.confirm.subscribe(() => {
            this.bookmarkService.delete(bookmark);
            this.toastService.show(this.i18n.t('bookmarkDeleted'), 'warning');
          });
        });
      },
    });
    return items;
  }

  private getBackgroundContextMenuItems(): ContextMenuItem[] {
    const items: ContextMenuItem[] = [];
    items.push({
      label: this.i18n.t('createBookmark'),
      action: () => {
        this.openBookmarkModal({
          title: this.i18n.t('createBookmark'),
          bookmark: {
            id: '',
            title: '',
            type: 'bookmark' as const,
            parentId: this.currentFolder()?.id,
          },
        }).then((ref) => {
          ref.instance.confirm.subscribe(() => {
            this.toastService.show(this.i18n.t('bookmarkCreated'), 'success');
          });
        });
      },
    });
    items.push({
      label: this.i18n.t('createFolder'),
      action: () => {
        this.openBookmarkModal({
          title: this.i18n.t('createFolder'),
          bookmark: {
            id: '',
            title: '',
            type: 'bookmarkFolder' as const,
            parentId: this.currentFolder()?.id,
          },
        }).then((ref) => {
          ref.instance.confirm.subscribe(() => {
            this.toastService.show(this.i18n.t('folderCreated'), 'success');
          });
        });
      },
    });
    items.push({
      label: this.i18n.t('bookmarkManager'),
      action: () => {
        this.tabService.createTab(
          [`chrome://bookmarks/?id=${this.currentFolder()?.id}`],
          { active: true },
        );
      },
    });
    items.push({
      label: this.i18n.t('settings'),
      action: () => {
        // TODO: Enable animation beforehand
        this.openSettingsModalInstance().then((ref) => {
          ref.instance.confirm.subscribe(() => {
            // TODO: Disable animation
          });
        });
      },
    });
    return items;
  }

  private openContextMenu(event: MouseEvent, items: ContextMenuItem[]) {
    event.preventDefault();
    event.stopPropagation();

    // clear previous menu
    this.overlayRef?.dispose();

    const positionStrategy = this.overlay
      .position()
      .flexibleConnectedTo({ x: event.clientX, y: event.clientY })
      .withPositions([
        {
          originX: 'start',
          originY: 'top',
          overlayX: 'start',
          overlayY: 'top',
        },
      ]);

    this.overlayRef = this.overlay.create({
      positionStrategy,
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
    });

    this.overlayRef.detachments().subscribe(() => {
      this.dockComponent?.clearContextMenuState();
    });

    const menuPortal = new ComponentPortal(ContextMenuComponent, this.vcr);
    const menuRef = this.overlayRef.attach(menuPortal);

    // menu click event
    menuRef.instance.menuSelect.subscribe((menuItem: ContextMenuItem) => {
      menuItem.action?.();
      this.overlayRef?.dispose();
    });
    menuRef.setInput('items', items);

    // backdrop click close menu
    this.overlayRef.backdropClick().subscribe((e) => {
      e.preventDefault();
      this.overlayRef?.dispose();
    });
    // backdrop disable context menu, and close menu
    this.overlayRef.backdropElement?.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.overlayRef?.dispose();
    });
  }

  public getFolderIcons(bookmark: Bookmark): (Bookmark | null)[] {
    if (!bookmark.children) {
      return [];
    }
    const icons: (Bookmark | null)[] = bookmark.children
      .filter(
        (b) =>
          !!b.favIconUrl &&
          (b.favIconUrl.startsWith('data:image/') ||
            b.favIconUrl.startsWith('http')),
      )
      .slice(0, 4);
    if (icons.length === 0) {
      return [];
    }
    // Pad to 4 items for consistent 2x2 grid layout
    while (icons.length < 4) {
      icons.push(null);
    }
    return icons;
  }

  public trackById(index: number, bookmark: Bookmark): string {
    return bookmark.id;
  }
}
