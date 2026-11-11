import {
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  DestroyRef,
  HostListener,
  ViewChild,
  ViewContainerRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';

import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import {
  CdkDrag,
  CdkDropList,
  CdkDragDrop,
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
  private destroyRef: DestroyRef = inject(DestroyRef);

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

  // dock
  dockFolder = toSignal(this.bookmarkService.dockBookmarks$, {
    requireSync: true,
  });
  dockEnabled = computed(() => this.settings().dockEnabled ?? true);
  dockIconSize = computed(() => this.settings().dockIconSize ?? 52);
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

  // drag & drop
  draggedItem = signal<Bookmark | Window | undefined>(undefined);
  draggedHoverdItem = signal<Bookmark | Window | undefined>(undefined);

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

    // 2. Cmd/Ctrl + A: Select All in current folder
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

    // 3. Escape: Deselect All
    if (kbEvent.key === 'Escape') {
      if (this.selectedBookmarkIds().size > 0) {
        kbEvent.preventDefault();
        this.clearSelection();
      }
      return;
    }

    // 4. Delete / Backspace: Delete selected
    if (kbEvent.key === 'Delete' || kbEvent.key === 'Backspace') {
      if (this.selectedBookmarkIds().size > 0) {
        kbEvent.preventDefault();
        this.deleteSelectedBookmarks();
      }
      return;
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
        const bookmark = item as Bookmark;
        // Holding Command (macOS), Ctrl (Windows), or Middle Click (button 1) opens in background tab
        if (event.metaKey || event.ctrlKey || event.button === 1) {
          this.tabService.createTab([bookmark.url!], {
            active: false,
          });
        } else if (this.bookmarkOpenInNewTab()) {
          this.tabService.createTab([bookmark.url!], {
            active: false,
          });
        } else {
          this.tabService.updateCurrentTab(bookmark.url!);
        }
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

    if (
      dragItem === undefined ||
      droppedItem === undefined ||
      dragItem === droppedItem
    ) {
      this.resetDragState();
      return;
    }

    // Check if dragging bookmark into folder (hovering over folder)
    if (
      (dragItemType === 'bookmark' || dragItemType === 'bookmarkFolder') &&
      droppedItemType === 'bookmarkFolder' &&
      this.draggedHoverdItem() === droppedItem
    ) {
      const bookmark = dragItem as Bookmark;
      const bookmarkFolder = droppedItem as Bookmark;

      const selectedIds = this.selectedBookmarkIds();
      if (selectedIds.size > 1 && selectedIds.has(bookmark.id)) {
        selectedIds.forEach((id) => {
          if (
            id !== bookmarkFolder.id &&
            this.currentFolder()?.children?.find((c) => c.id === id)
          ) {
            this.bookmarkService.move(id, { parentId: bookmarkFolder.id });
          }
        });
        this.clearSelection();
      } else {
        this.bookmarkService.move(bookmark.id, {
          parentId: bookmarkFolder.id,
        });
      }
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
  }

  onDragEnded() {
    this.resetDragState();
  }

  private resetDragState() {
    this.draggedItem.set(undefined);
    this.draggedHoverdItem.set(undefined);
  }

  onFolderMouseEnter(folder: Bookmark) {
    // Only set hover state if we're currently dragging something
    const dragged = this.draggedItem();
    if (dragged && dragged !== folder) {
      this.draggedHoverdItem.set(folder);
    }
  }

  onFolderMouseLeave() {
    // Clear hover state when mouse leaves folder
    this.draggedHoverdItem.set(undefined);
  }

  onBookmarkMouseEnter(event: MouseEvent) {
    if (this.draggedItem()) return;
    const card = event.currentTarget as HTMLElement | null;
    if (!card) return;
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
    if (!card) return;
    card.style.removeProperty('--tooltip-max-width');
  }

  onDragListEntered(item: Bookmark) {
    this.draggedHoverdItem.set(item);
  }

  onDragListExited() {
    this.draggedHoverdItem.set(undefined);
  }

  isDroppableHover(item: Bookmark | Window): boolean {
    const dragged = this.draggedItem();
    return !!dragged && dragged !== item && this.draggedHoverdItem() === item;
  }

  onClickCrumb(crumb: Bookmark) {
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
