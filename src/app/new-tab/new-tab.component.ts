import {
  Component,
  OnInit,
  ViewContainerRef,
  inject,
  HostListener,
  ChangeDetectorRef,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
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
  heroCog6Tooth,
  heroPlus,
  heroChevronRight,
  heroCheck,
  heroFolderOpen,
} from '@ng-icons/heroicons/outline';
import { trigger, transition, style, animate } from '@angular/animations';

import { Bookmark, Window } from '@app/services/types';
import { BookmarkService } from '@app/services/bookmark.service';
import { TabService } from '@app/services/tab.service';

import { SettingsService } from '@app/services/settings.service';
import { ModalService } from '@app/services/modal.service';
import { ToastService } from '@app/services/toast.service';
import { I18nService } from '@app/services/i18n.service';
import { WallpaperService, ActiveWallpaper } from '@app/services/wallpaper.service';

import {
  ContextMenuComponent,
  ContextMenuItem,
} from '@app/components/context-menu/context-menu.component';
import { ToastContainerComponent } from '@app/components/toast-container/toast-container.component';
import { ModalHostComponent } from '@app/components/modal-host/modal-host.component';

import { SettingsModalComponent } from './settings-modal/settings-modal.component';
import { ConfirmModalComponent } from './confirm-modal/confirm-modal.component';
import { BookmarkModalComponent } from './bookmark-modal/bookmark-modal.component';
import { BookmarkSearchBoxComponent } from './bookmark-search-box/bookmark-search-box.component';
import { BookmarkMoveModalComponent } from './bookmark-move-modal/bookmark-move-modal.component';
import { DockComponent } from './dock/dock.component';

@Component({
  selector: 'app-new-tab',
  imports: [
    CommonModule,
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
      heroCog6Tooth,
      heroPlus,
      heroChevronRight,
      heroCheck,
      heroFolderOpen,
    }),
  ],
  templateUrl: './new-tab.component.html',
  styleUrls: ['./new-tab.component.scss'],
  animations: [
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('500ms ease-out', style({ opacity: 1 })),
      ]),
    ]),
    trigger('shrinkOut', [
      transition(':leave', [
        animate(
          '300ms ease',
          style({
            transform: 'scale(0)',
            opacity: 0,
          }),
        ),
      ]),
    ]),
  ],
})
export class NewTabComponent implements OnInit {
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
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);

  overlayRef!: OverlayRef;

  @ViewChild('searchBox') searchBox?: BookmarkSearchBoxComponent;
  @ViewChild(DockComponent) dockComponent?: DockComponent;

  // bookmarks
  breadcrumb: Bookmark[] = [];
  rootFolder!: Bookmark;
  currentFolder!: Bookmark;
  isBookmarksLoaded = false;

  // wallpaper
  activeWallpaper: ActiveWallpaper = {
    type: 'none',
    background: '',
    isImage: false,
  };
  wallpaperDim = 10;
  wallpaperBlur = 0;

  // dock
  dockFolder: Bookmark | null = null;
  dockEnabled = true;
  dockIconSize = 52;
  dockMagnification = true;

  public get dockBottomPadding(): number {
    if (!this.dockEnabled || !this.dockFolder || (this.dockFolder.children?.length ?? 0) === 0) {
      return 24;
    }
    return Math.round(this.dockIconSize * 1.6 + 56);
  }

  // settings
  bookmarkDisplayColumn!: number;
  bookmarkSize!: number;
  bookmarkOpenInNewTab!: boolean;
  searchShortcut!: { modifiers: string[]; key: string };

  // drag selection
  selectionBox = { visible: false, startX: 0, startY: 0, left: 0, top: 0, width: 0, height: 0 };
  selectedBookmarkIds = new Set<string>();
  initialSelectedIds = new Set<string>();
  isSelectionDragging = false;

  // drag & drop
  draggedItem: Bookmark | Window | undefined = undefined;
  draggedHoverdItem: Bookmark | Window | undefined = undefined;

  selectionStartPoint = { x: 0, y: 0 };

  async ngOnInit(): Promise<void> {
    this.wallpaperService.activeWallpaper$.subscribe((w) => {
      this.activeWallpaper = w;
      this.cdr.detectChanges();
    });

    this.settingsService.onSettingsChange().subscribe((s) => {
      if (!s) {
        return;
      }
      this.bookmarkDisplayColumn = s.bookmarkDisplayColumn;
      this.bookmarkSize = s.bookmarkSize;
      this.bookmarkOpenInNewTab = s.bookmarkOpenInNewTab;
      this.searchShortcut = s.searchShortcut;
      this.dockEnabled = s.dockEnabled ?? true;
      this.dockIconSize = s.dockIconSize ?? 52;
      this.dockMagnification = s.dockMagnification ?? true;
      this.wallpaperDim = s.wallpaperDim ?? 10;
      this.wallpaperBlur = s.wallpaperBlur ?? 0;
      // Update language when settings change
      if (s.language) {
        this.i18n.setLanguage(s.language);
      }
      this.cdr.detectChanges();
    });

    // Set initial language from settings
    const currentSettings = this.settingsService.settingsSource.value;
    if (currentSettings.language) {
      this.i18n.setLanguage(currentSettings.language);
    }

    this.bookmarkService.dockBookmarks$.subscribe((dock) => {
      this.dockFolder = dock;
      this.cdr.detectChanges();
    });

    this.bookmarkService.bookmarks$.subscribe((b) => {
      if (!b || !b.id) {
        return;
      }
      this.rootFolder = b;
      if (this.breadcrumb.length <= 1) {
        this.currentFolder = this.rootFolder;
        this.breadcrumb = [this.rootFolder];
      } else {
        let temp = [this.rootFolder];
        for (let i = 0; i < this.breadcrumb.length; i++) {
          for (let bookmark of temp) {
            if (bookmark.id === this.breadcrumb[i].id) {
              this.breadcrumb[i] = bookmark;
              temp = bookmark.children || [];
              break;
            }
          }
        }
        this.currentFolder = this.breadcrumb[this.breadcrumb.length - 1];
      }
      this.isBookmarksLoaded = true;
      this.cdr.detectChanges();
    });
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
    if ((kbEvent.metaKey || kbEvent.ctrlKey) && kbEvent.key.toLowerCase() === 'a') {
      if (this.currentFolder?.children && this.currentFolder.children.length > 0) {
        kbEvent.preventDefault();
        this.selectedBookmarkIds = new Set(this.currentFolder.children.map((c) => c.id));
        this.cdr.detectChanges();
      }
      return;
    }

    // 3. Escape: Deselect All
    if (kbEvent.key === 'Escape') {
      if (this.selectedBookmarkIds.size > 0) {
        kbEvent.preventDefault();
        this.selectedBookmarkIds.clear();
        this.cdr.detectChanges();
      }
      return;
    }

    // 4. Delete / Backspace: Delete selected
    if (kbEvent.key === 'Delete' || kbEvent.key === 'Backspace') {
      if (this.selectedBookmarkIds.size > 0) {
        kbEvent.preventDefault();
        this.deleteSelectedBookmarks();
      }
      return;
    }
  }

  isSearchShortcut(event: KeyboardEvent): boolean {
    if (!this.searchShortcut) return false;

    const { modifiers, key } = this.searchShortcut;

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

  get formattedShortcutKey(): string {
    if (!this.searchShortcut) return '⌘K';
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
    const mods = (this.searchShortcut.modifiers || [])
      .map((m) => modMap[m] || m)
      .join(isMac ? '' : '+');
    const rawKey = this.searchShortcut.key || 'k';
    const key = keyMap[rawKey] || rawKey.toUpperCase();
    if (!mods) return key;
    return isMac ? `${mods}${key}` : `${mods}+${key}`;
  }

  openSettingsModal() {
    this.modalService.open(SettingsModalComponent);
  }

  openCreateBookmarkModal() {
    this.modalService
      .open(BookmarkModalComponent, {
        title: this.i18n.t('createBookmark'),
        bookmark: {
          id: '',
          title: '',
          type: 'bookmark' as const,
          parentId: this.currentFolder?.id || this.rootFolder?.id,
        },
      })
      .instance.confirm.subscribe(() => {
        this.toastService.show(this.i18n.t('bookmarkCreated'), 'success');
      });
  }

  openCreateFolderModal() {
    this.modalService
      .open(BookmarkModalComponent, {
        title: this.i18n.t('createFolder'),
        bookmark: {
          id: '',
          title: '',
          type: 'bookmarkFolder' as const,
          parentId: this.currentFolder?.id || this.rootFolder?.id,
        },
      })
      .instance.confirm.subscribe(() => {
        this.toastService.show(this.i18n.t('folderCreated'), 'success');
      });
  }

  onSelectionMouseDown(event: MouseEvent) {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('.bookmark-card')) return;
    if (event.offsetX > target.clientWidth || event.offsetY > target.clientHeight) return;

    this.isSelectionDragging = true;
    this.selectionBox.visible = true;
    this.selectionBox.startX = event.clientX;
    this.selectionBox.startY = event.clientY;
    this.selectionBox.left = event.clientX;
    this.selectionBox.top = event.clientY;
    this.selectionBox.width = 0;
    this.selectionBox.height = 0;

    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      this.initialSelectedIds = new Set(this.selectedBookmarkIds);
    } else {
      this.selectedBookmarkIds.clear();
      this.initialSelectedIds.clear();
    }

    document.body.style.userSelect = 'none';
  }

  @HostListener('document:mousemove', ['$event'])
  onSelectionMouseMove(event: MouseEvent) {
    if (!this.isSelectionDragging) return;

    const currentX = event.clientX;
    const currentY = event.clientY;

    this.selectionBox.left = Math.min(this.selectionBox.startX, currentX);
    this.selectionBox.top = Math.min(this.selectionBox.startY, currentY);
    this.selectionBox.width = Math.abs(currentX - this.selectionBox.startX);
    this.selectionBox.height = Math.abs(currentY - this.selectionBox.startY);

    this.calculateSelection();
  }

  @HostListener('document:mouseup', ['$event'])
  onSelectionMouseUp(event: MouseEvent) {
    if (this.isSelectionDragging) {
      this.isSelectionDragging = false;
      this.selectionBox.visible = false;
      document.body.style.userSelect = '';
    }
  }

  private calculateSelection() {
    const box = this.selectionBox;
    const cards = document.querySelectorAll('.bookmark-card');
    this.selectedBookmarkIds = new Set(this.initialSelectedIds);

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
        this.selectedBookmarkIds.add(id);
      }
    });
  }

  onClick(event: MouseEvent, item: Bookmark | Window) {
    if (item?.type === 'bookmark' || item?.type === 'bookmarkFolder') {
      const bookmark = item as Bookmark;
      // If already in multi-selection mode, toggle selection on left click
      if (this.selectedBookmarkIds.size > 0 && event.button === 0) {
        if (this.selectedBookmarkIds.has(bookmark.id)) {
          this.selectedBookmarkIds.delete(bookmark.id);
        } else {
          this.selectedBookmarkIds.add(bookmark.id);
        }
        this.cdr.detectChanges();
        event.stopPropagation();
        event.preventDefault();
        return;
      }

      if (event.button === 0) {
        this.selectedBookmarkIds.clear();
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
        } else if (this.bookmarkOpenInNewTab) {
          this.tabService.createTab([bookmark.url!], {
            active: false,
          });
        } else {
          window.location.href = bookmark.url!;
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
            this.tabService.createTab(urls, { active: false }).then((tabIds) => {
              if (tabIds && tabIds.length > 1) {
                this.tabService.createTabGroup(tabIds, bookmark.title);
              }
            });
          }
        } else {
          this.breadcrumb.push(bookmark);
          this.currentFolder = bookmark;
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

  onDropListDropped(event: CdkDragDrop<any[]>) {
    const dragItem = event.item.data;
    const dragItemType = dragItem?.type;
    const droppedItem = event.container.data[event.currentIndex];
    const droppedItemType = droppedItem?.type;

    if (
      dragItem === undefined ||
      droppedItem === undefined ||
      dragItem === droppedItem
    ) {
      this.draggedItem = undefined;
      this.draggedHoverdItem = undefined;
      return;
    }

    // Check if dragging bookmark into folder (hovering over folder)
    if (
      (dragItemType === 'bookmark' || dragItemType === 'bookmarkFolder') &&
      droppedItemType === 'bookmarkFolder' &&
      this.draggedHoverdItem === droppedItem
    ) {
      const bookmark = dragItem as Bookmark;
      const bookmarkFolder = droppedItem as Bookmark;

      if (this.selectedBookmarkIds.size > 1 && this.selectedBookmarkIds.has(bookmark.id)) {
        this.selectedBookmarkIds.forEach(id => {
          if (id !== bookmarkFolder.id && this.currentFolder.children?.find(c => c.id === id)) {
            this.bookmarkService.move(id, { parentId: bookmarkFolder.id });
          }
        });
        this.selectedBookmarkIds.clear();
      } else {
        this.bookmarkService.move(bookmark.id, {
          parentId: bookmarkFolder.id,
        });
      }
      this.draggedItem = undefined;
      this.draggedHoverdItem = undefined;
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
    this.draggedItem = undefined;
    this.draggedHoverdItem = undefined;
  }

  onDragStarted(item: Bookmark | Window) {
    // cannot add event.preventDefault() or it will stop the next dragover/dragleave event
    this.draggedItem = item;
  }

  onDragEnded() {
    this.draggedItem = undefined;
    this.draggedHoverdItem = undefined;
  }

  onFolderMouseEnter(folder: Bookmark) {
    // Only set hover state if we're currently dragging something
    if (this.draggedItem && this.draggedItem !== folder) {
      this.draggedHoverdItem = folder;
    }
  }

  onFolderMouseLeave() {
    // Clear hover state when mouse leaves folder
    if (this.draggedHoverdItem !== undefined) {
      this.draggedHoverdItem = undefined;
    }
  }

  onDragListEntered(item: Bookmark) {
    if (this.draggedHoverdItem !== item) {
      this.draggedHoverdItem = item;
    }
  }

  onDragListExited() {
    if (this.draggedHoverdItem !== undefined) {
      this.draggedHoverdItem = undefined;
    }
  }

  isDroppableHover(item: Bookmark | Window): boolean {
    return (
      !!this.draggedItem &&
      this.draggedItem !== item &&
      this.draggedHoverdItem === item
    );
  }

  onClickCrumb(crumb: Bookmark) {
    const index = this.breadcrumb.indexOf(crumb);
    this.breadcrumb = this.breadcrumb.slice(0, index + 1);
    this.currentFolder = crumb;
  }

  onDockFolderClick({ event, folder }: { event: MouseEvent; folder: Bookmark }) {
    if (!folder) return;
    if (event?.button === 1) {
      this.onClick(event, folder);
      return;
    }
    const path = this.findPathToFolder(this.rootFolder, folder.id);
    if (path) {
      this.breadcrumb = path;
      this.currentFolder = path[path.length - 1];
    } else {
      this.breadcrumb = [this.rootFolder, folder];
      this.currentFolder = folder;
    }
    this.cdr.detectChanges();
  }

  onDockBookmarkClick({ event, bookmark }: { event: MouseEvent; bookmark: Bookmark }) {
    this.onClick(event, bookmark);
  }

  private findPathToFolder(current: Bookmark, targetId: string): Bookmark[] | null {
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

  onDockBookmarkContextMenu({ event, bookmark }: { event: MouseEvent; bookmark: Bookmark }) {
    this.onContextMenu(event, bookmark);
  }

  openMoveToFolderModal() {
    if (this.selectedBookmarkIds.size === 0) return;
    this.modalService
      .open(BookmarkMoveModalComponent, {
        selectedBookmarkIds: Array.from(this.selectedBookmarkIds),
        currentFolderId: this.currentFolder?.id,
      })
      .instance.confirm.subscribe(() => {
        this.selectedBookmarkIds.clear();
        this.cdr.detectChanges();
      });
  }

  openSelectedBookmarks() {
    const urls: string[] = [];
    this.currentFolder.children!
      .filter((b) => this.selectedBookmarkIds.has(b.id))
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
            this.currentFolder.title || 'Bookmarks',
          );
        }
      });
    } else {
      this.toastService.show(this.i18n.t('noBookmarkToOpen'), 'info');
    }
  }

  deleteSelectedBookmarks() {
    if (this.selectedBookmarkIds.size === 0) return;
    this.modalService
      .open(ConfirmModalComponent, {
        title: this.i18n.t('confirmDeleteBookmark'),
        confirmButtonClass: 'btn-error',
      })
      .instance.confirm.subscribe(() => {
        this.selectedBookmarkIds.forEach((id) => {
          const bookmark = this.currentFolder.children?.find((c) => c.id === id);
          if (bookmark) {
            this.bookmarkService.delete(bookmark);
          }
        });
        this.selectedBookmarkIds.clear();
        this.toastService.show(this.i18n.t('bookmarkDeleted'), 'warning');
      });
  }

  deselectAll() {
    this.selectedBookmarkIds.clear();
    this.cdr.detectChanges();
  }

  private getMultiSelectionContextMenuItems(): ContextMenuItem[] {
    let items: ContextMenuItem[] = [];
    items.push({
      label: this.i18n.t('moveIntoFolder'),
      action: () => {
        this.openMoveToFolderModal();
      },
    });
    items.push({
      label: this.i18n.t('openAllBookmarks') || this.i18n.t('openAllInNewWindow'),
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
    if (this.selectedBookmarkIds.size > 1 && this.selectedBookmarkIds.has(bookmark.id)) {
      return this.getMultiSelectionContextMenuItems();
    }
    let items: ContextMenuItem[] = [];
    items.push({
      label: this.i18n.t('openInNewTab'),
      action: () => {
        this.tabService.createTab([bookmark.url!], {
          active: this.bookmarkOpenInNewTab,
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
        this.modalService
          .open(BookmarkModalComponent, {
            title: this.i18n.t('editBookmark'),
            bookmark: bookmark,
          })
          .instance.confirm.subscribe(() => {
            this.toastService.show(this.i18n.t('bookmarkUpdated'), 'info');
          });
      },
    });
    items.push({
      label: this.i18n.t('delete'),
      action: () => {
        this.modalService
          .open(ConfirmModalComponent, {
            title: this.i18n.t('confirmDeleteBookmark'),
            confirmButtonClass: 'btn-error',
          })
          .instance.confirm.subscribe(() => {
            this.bookmarkService.delete(bookmark);
            this.toastService.show(this.i18n.t('bookmarkDeleted'), 'warning');
          });
      },
    });
    return items;
  }

  private getBookmarkFolderContextMenuItems(
    bookmark: Bookmark,
  ): ContextMenuItem[] {
    if (this.selectedBookmarkIds.size > 1 && this.selectedBookmarkIds.has(bookmark.id)) {
      return this.getMultiSelectionContextMenuItems();
    }
    let items: ContextMenuItem[] = [];
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
        this.modalService
          .open(ConfirmModalComponent, {
            title: this.i18n.t('confirmOpenAll', [
              bookmark.children.length.toString(),
            ]),
          })
          .instance.confirm.subscribe(f);
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
        this.modalService
          .open(ConfirmModalComponent, {
            title: this.i18n.t('confirmOpenAllInNewWindow'),
          })
          .instance.confirm.subscribe(f);
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
        this.modalService
          .open(ConfirmModalComponent, {
            title: this.i18n.t('confirmOpenAllInIncognito'),
          })
          .instance.confirm.subscribe(f);
      },
    });
    items.push({
      label: this.i18n.t('edit'),
      action: () => {
        this.modalService
          .open(BookmarkModalComponent, {
            title: this.i18n.t('editBookmarkFolder'),
            bookmark: bookmark,
          })
          .instance.confirm.subscribe(() => {
            this.toastService.show(
              this.i18n.t('bookmarkFolderUpdated'),
              'info',
            );
          });
      },
    });
    items.push({
      label: this.i18n.t('delete'),
      action: () => {
        this.modalService
          .open(ConfirmModalComponent, {
            title: this.i18n.t('confirmDeleteBookmarkFolder'),
            confirmButtonClass: 'btn-error',
          })
          .instance.confirm.subscribe(() => {
            this.bookmarkService.delete(bookmark);
            this.toastService.show(this.i18n.t('bookmarkDeleted'), 'warning');
          });
      },
    });
    return items;
  }

  private getBackgroundContextMenuItems(): ContextMenuItem[] {
    let items: ContextMenuItem[] = [];
    items.push({
      label: this.i18n.t('createBookmark'),
      action: () => {
        this.modalService
          .open(BookmarkModalComponent, {
            title: this.i18n.t('createBookmark'),
            bookmark: {
              id: '',
              title: '',
              type: 'bookmark' as const,
              parentId: this.currentFolder.id,
            },
          })
          .instance.confirm.subscribe(() => {
            this.toastService.show(this.i18n.t('bookmarkCreated'), 'success');
          });
      },
    });
    items.push({
      label: this.i18n.t('createFolder'),
      action: () => {
        this.modalService
          .open(BookmarkModalComponent, {
            title: this.i18n.t('createFolder'),
            bookmark: {
              id: '',
              title: '',
              type: 'bookmarkFolder' as const,
              parentId: this.currentFolder.id,
            },
          })
          .instance.confirm.subscribe(() => {
            this.toastService.show(this.i18n.t('folderCreated'), 'success');
          });
      },
    });
    items.push({
      label: this.i18n.t('bookmarkManager'),
      action: () => {
        this.tabService.createTab(
          [`chrome://bookmarks/?id=${this.currentFolder.id}`],
          { active: true },
        );
      },
    });
    items.push({
      label: this.i18n.t('settings'),
      action: () => {
        // TODO: Enable animation beforehand
        this.modalService
          .open(SettingsModalComponent)
          .instance.confirm.subscribe(() => {
            // TODO: Disable animation
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
    menuRef.instance.items = items;

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
    const icons = bookmark.children
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
      icons.push(null as any);
    }
    return icons;
  }

  public trackById(index: number, bookmark: Bookmark): string {
    return bookmark.id;
  }
}
