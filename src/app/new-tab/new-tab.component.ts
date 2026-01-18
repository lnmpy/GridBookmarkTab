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

@Component({
  selector: 'app-new-tab',
  imports: [
    CommonModule,
    ModalHostComponent,
    NgIcon,
    ToastContainerComponent,
    CdkDrag,
    CdkDropList,
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

  overlayRef!: OverlayRef;

  // bookmarks
  breadcrumb: Bookmark[] = [];
  rootFolder!: Bookmark;
  currentFolder!: Bookmark;

  // settings
  bookmarkDisplayColumn!: number;
  bookmarkOpenInNewTab!: boolean;

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
    });

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
  onKeyDown(event: KeyboardEvent) {
    // Ctrl+K or Cmd+K to open search
    if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
      event.preventDefault();
      this.openBookmarkSearch();
    }
  }

  openBookmarkSearch() {
    this.modalService
      .open(BookmarkSearchModalComponent, {
        title: 'Search Bookmarks',
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

  onClick(event: MouseEvent, item: Bookmark | Window) {
    switch (item?.type) {
      case 'bookmark': {
        if (event.ctrlKey || event.shiftKey || event.metaKey) {
          return;
        }
        const bookmark = item as Bookmark;
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
      this.bookmarkService.move(bookmark.id, {
        parentId: bookmarkFolder.id,
      });
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
        title: `Edit Favicon - ${bookmark.title}`,
        bookmark: bookmark,
        currentFaviconUrl: bookmark.favIconUrl,
      })
      .instance.confirm.subscribe(async (newFaviconUrl: string) => {
        // Save will be handled by modal component
        this.toastService.show('Favicon updated', 'success');
      });

    // Open Google Images search window beside the modal
    const domain = bookmark.url
      ? new URL(bookmark.url).hostname
      : bookmark.title;
    const searchQuery = encodeURIComponent(`${domain} favicon icon`);

    // Calculate position - place window to the right of the modal
    // Modal is centered, so we position the new window to the right
    const screenWidth = window.screen.availWidth;
    const screenHeight = window.screen.availHeight;
    const windowWidth = 400;
    const windowHeight = 500;

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

  private getBookmarkContextMenuItems(bookmark: Bookmark): ContextMenuItem[] {
    let items: ContextMenuItem[] = [];
    items.push({
      label: 'Open in new tab',
      action: () => {
        this.tabService.createTab([bookmark.url!], {
          active: this.bookmarkOpenInNewTab,
        });
      },
    });
    items.push({
      label: 'Open in new window',
      action: () => {
        this.tabService.createWindow(bookmark.url!);
      },
    });
    items.push({
      label: 'Open in incognito',
      action: () => {
        this.tabService.createWindow(bookmark.url!, true);
      },
    });
    items.push({
      label: 'Edit Favicon',
      action: () => {
        this.openFaviconEditor(bookmark);
      },
    });
    items.push({
      label: 'Edit',
      action: () => {
        this.modalService
          .open(BookmarkModalComponent, {
            title: 'Edit bookmark',
            bookmark: bookmark,
          })
          .instance.confirm.subscribe(() => {
            this.toastService.show('Bookmark updated', 'info');
          });
      },
    });
    items.push({
      label: 'Delete',
      action: () => {
        this.modalService
          .open(ConfirmModalComponent, {
            title: 'Confirm to delete bookmark',
            confirmButtonClass: 'btn-error',
          })
          .instance.confirm.subscribe(() => {
            this.bookmarkService.delete(bookmark);
            this.toastService.show('Bookmark deleted', 'warning');
          });
      },
    });
    return items;
  }

  private getBookmarkFolderContextMenuItems(
    bookmark: Bookmark,
  ): ContextMenuItem[] {
    let items: ContextMenuItem[] = [];
    items.push({
      label: 'Open all bookmarks',
      action: () => {
        if (!bookmark.children || bookmark.children.length === 0) {
          this.toastService.show('No bookmark to open', 'info');
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
            title: `Confirm to Open all ${bookmark.children.length} bookmarks`,
          })
          .instance.confirm.subscribe(f);
      },
    });
    items.push({
      label: 'Open all in new window',
      action: () => {
        if (!bookmark.children || bookmark.children.length === 0) {
          this.toastService.show('No bookmark to open', 'info');
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
            title: 'Confirm to Open all in new window',
          })
          .instance.confirm.subscribe(f);
      },
    });
    items.push({
      label: 'Open all in incognito',
      action: () => {
        if (!bookmark.children || bookmark.children.length === 0) {
          this.toastService.show('No bookmark to open', 'info');
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
            title: 'Confirm to Open all in incognito',
          })
          .instance.confirm.subscribe(f);
      },
    });
    items.push({
      label: 'Edit',
      action: () => {
        this.modalService
          .open(BookmarkModalComponent, {
            title: 'Edit bookmark folder',
            bookmark: bookmark,
          })
          .instance.confirm.subscribe(() => {
            this.toastService.show('Bookmark folder updated', 'info');
          });
      },
    });
    items.push({
      label: 'Delete',
      action: () => {
        this.modalService
          .open(ConfirmModalComponent, {
            title: 'Confirm to delete bookmark folder',
            confirmButtonClass: 'btn-error',
          })
          .instance.confirm.subscribe(() => {
            this.bookmarkService.delete(bookmark);
            this.toastService.show('Bookmark deleted', 'warning');
          });
      },
    });
    return items;
  }

  private getBackgroundContextMenuItems(): ContextMenuItem[] {
    let items: ContextMenuItem[] = [];
    items.push({
      label: 'Bookmark Manager',
      action: () => {
        this.tabService.createTab(
          [`chrome://bookmarks/?id=${this.currentFolder.id}`],
          { active: true },
        );
      },
    });
    items.push({
      label: 'Settings',
      action: () => {
        // TODO 前置开启animation
        this.modalService
          .open(SettingsModalComponent)
          .instance.confirm.subscribe(() => {
            // TODO 关闭animation
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

  public getFolderIcons(bookmark: Bookmark): Bookmark[] {
    if (!bookmark.children) {
      return [];
    }
    return bookmark.children.filter((b) => !!b.favIconUrl).slice(0, 4);
  }

  public trackById(index: number, bookmark: Bookmark): string {
    return bookmark.id;
  }
}
