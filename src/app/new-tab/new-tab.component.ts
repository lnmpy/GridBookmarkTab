import {
  Component,
  OnInit,
  ViewContainerRef,
  inject,
  HostListener,
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
import { heroHome } from '@ng-icons/heroicons/outline';
import { trigger, transition, style, animate } from '@angular/animations';

import { Bookmark, Window } from '@app/services/types';
import { BookmarkService } from '@app/services/bookmark.service';
import { TabService } from '@app/services/tab.service';

import { SettingsService } from '@app/services/settings.service';
import { ModalService } from '@app/services/modal.service';
import { ToastService } from '@app/services/toast.service';
import { I18nService } from '@app/services/i18n.service';

import {
  ContextMenuComponent,
  ContextMenuItem,
} from '@app/components/context-menu/context-menu.component';
import { ToastContainerComponent } from '@app/components/toast-container/toast-container.component';
import { ModalHostComponent } from '@app/components/modal-host/modal-host.component';

import { SettingsModalComponent } from './settings-modal/settings-modal.component';
import { ConfirmModalComponent } from './confirm-modal/confirm-modal.component';
import { BookmarkModalComponent } from './bookmark-modal/bookmark-modal.component';
import { BookmarkFaviconModalComponent } from './bookmark-favicon-modal/bookmark-favicon-modal.component';
import { BookmarkSearchModalComponent } from './bookmark-search-modal/bookmark-search-modal.component';
import { NotepadPanelComponent } from './notepad-panel/notepad-panel.component';

@Component({
  selector: 'app-new-tab',
  imports: [
    CommonModule,
    ModalHostComponent,
    NgIcon,
    ToastContainerComponent,
    CdkDrag,
    CdkDropList,
    NotepadPanelComponent,
  ],
  providers: [provideIcons({ heroHome })],
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
  private i18n: I18nService = inject(I18nService);

  overlayRef!: OverlayRef;

  // bookmarks
  breadcrumb: Bookmark[] = [];
  rootFolder!: Bookmark;
  currentFolder!: Bookmark;

  // settings
  bookmarkDisplayColumn!: number;
  bookmarkOpenInNewTab!: boolean;
  searchShortcut!: { modifiers: string[]; key: string };
  enableNotepad = false;

  // notepad
  notepadOpen = false;
  notepadExpanded = false;

  // drag selection
  selectionBox = { visible: false, startX: 0, startY: 0, left: 0, top: 0, width: 0, height: 0 };
  selectedBookmarkIds = new Set<string>();
  initialSelectedIds = new Set<string>();
  isSelectionDragging = false;

  // drag & drop
  draggedItem: Bookmark | Window | undefined = undefined;
  draggedHoverdItem: Bookmark | Window | undefined = undefined;

  ngOnInit() {
    this.settingsService.onSettingsChange().subscribe((s) => {
      if (!s) {
        return;
      }
      this.bookmarkDisplayColumn = s.bookmarkDisplayColumn;
      this.bookmarkOpenInNewTab = s.bookmarkOpenInNewTab;
      this.searchShortcut = s.searchShortcut;
      this.enableNotepad = s.enableNotepad;
      // Update language when settings change
      if (s.language) {
        this.i18n.setLanguage(s.language);
      }
    });

    // Set initial language from settings
    const currentSettings = this.settingsService.settingsSource.value;
    if (currentSettings.language) {
      this.i18n.setLanguage(currentSettings.language);
    }


    this.bookmarkService.bookmarks$.subscribe((b) => {
      if (!b) {
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
    });
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: Event) {
    if (this.modalService.hasOpenModals() || this.notepadOpen) {
      return;
    }

    if (this.isSearchShortcut(event as KeyboardEvent)) {
      event.preventDefault();
      this.openBookmarkSearch();
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
    this.modalService
      .open(BookmarkSearchModalComponent, {
        title: this.i18n.t('searchBookmarks'),
      })
      .instance.confirm.subscribe((bookmark: Bookmark) => {
        if (bookmark.url) {
          if (this.bookmarkOpenInNewTab) {
            this.tabService.createTab([bookmark.url], {
              active: true,
            });
          } else {
            window.location.href = bookmark.url;
          }
        }
      });
  }

  onNotepadExpandedChange(expanded: boolean) {
    this.notepadExpanded = expanded;
    this.updateNotepadUrl();
  }

  closeNotepad() {
    this.notepadOpen = false;
    this.notepadExpanded = false;
    this.updateNotepadUrl();
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

  private updateNotepadUrl() {
    const url = new URL(window.location.href);
    if (this.notepadExpanded) {
      url.searchParams.set('notepad', 'expanded');
    } else {
      url.searchParams.delete('notepad');
    }
    window.history.replaceState({}, '', url.toString());
  }

  onClick(event: MouseEvent, item: Bookmark | Window) {
    if (item?.type === 'bookmark' || item?.type === 'bookmarkFolder') {
      this.selectedBookmarkIds.clear();
    }

    switch (item?.type) {
      case 'bookmark': {
        const bookmark = item as Bookmark;
        if (event.ctrlKey || event.metaKey || event.shiftKey) {
          return; // Let native browser handle modifier clicks
        }
        if (this.bookmarkOpenInNewTab) {
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
        this.breadcrumb.push(bookmark);
        this.currentFolder = bookmark;
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

  private openFaviconEditor(bookmark: Bookmark) {
    // Open modal
    this.modalService
      .open(BookmarkFaviconModalComponent, {
        title: `${this.i18n.t('editFavicon')} - ${bookmark.title}`,
        bookmark: bookmark,
        currentFaviconUrl: bookmark.favIconUrl,
      })
      .instance.confirm.subscribe(async (newFaviconUrl: string) => {
        // Save will be handled by modal component
        this.toastService.show(this.i18n.t('faviconUpdated'), 'success');
      });

    // Open Google Images search window beside the modal
    const domain = bookmark.url
      ? new URL(bookmark.url).hostname
      : bookmark.title;
    const searchQuery = encodeURIComponent(`${domain} favicon`);

    // Calculate position - place window to the right of the modal
    // Modal is centered, so we position the new window to the right
    const screenWidth = window.screen.availWidth;
    const screenHeight = window.screen.availHeight;
    const windowWidth = 600;
    const windowHeight = 800;

    // Position to the right side of screen
    const left = Math.floor(screenWidth - windowWidth - 20);
    const top = Math.floor((screenHeight - windowHeight) / 2);

    this.tabService.createWindow(
      `https://www.google.com/search?tbm=isch&q=${searchQuery}`,
      false,
      {
        width: windowWidth,
        height: windowHeight,
        left: left,
        top: top,
      },
    );
  }

  private getMultiSelectionContextMenuItems(): ContextMenuItem[] {
    let items: ContextMenuItem[] = [];
    items.push({
      label: this.i18n.t('openAllBookmarks') || this.i18n.t('openAllInNewWindow'),
      action: async () => {
        const urls: string[] = [];
        this.currentFolder.children!
          .filter(b => this.selectedBookmarkIds.has(b.id))
          .forEach(b => {
            if (b.type === 'bookmark' && b.url) {
              urls.push(b.url);
            } else if (b.type === 'bookmarkFolder' && b.children) {
              urls.push(...b.children.filter(c => c.type === 'bookmark' && c.url).map(c => c.url as string));
            }
          });

        if (urls.length > 0) {
          const tabIds = await this.tabService.createTab(urls);
          if (tabIds && tabIds.length > 0 && urls.length > 1) {
            this.tabService.createTabGroup(tabIds, this.currentFolder.title || 'Bookmarks');
          }
        } else {
          this.toastService.show(this.i18n.t('noBookmarkToOpen'), 'info');
        }
      }
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
            this.selectedBookmarkIds.forEach(id => {
              const bookmark = this.currentFolder.children?.find(c => c.id === id);
              if (bookmark) {
                this.bookmarkService.delete(bookmark);
              }
            });
            this.selectedBookmarkIds.clear();
            this.toastService.show(this.i18n.t('bookmarkDeleted'), 'warning');
          });
      }
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
      label: this.i18n.t('editFavicon'),
      action: () => {
        this.openFaviconEditor(bookmark);
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
