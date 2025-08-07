import { Component, OnInit, ViewContainerRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { heroHome } from '@ng-icons/heroicons/outline';
import {
  trigger,
  transition,
  style,
  animate,
  query,
} from '@angular/animations';

import { Bookmark, BookmarkService } from '@app/services/bookmark.service';
import {
  Window,
  TabGroup,
  Tab,
  WindowTabService,
} from '@app/services/window-tab.service';

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

@Component({
  selector: 'app-new-tab',
  imports: [CommonModule, ModalHostComponent, NgIcon, ToastContainerComponent],
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
    trigger('gridAnimation', [
      transition('* <=> *', [
        query(':enter, :leave', [style({ opacity: 0 })], { optional: true }),
        query(':enter', [animate('300ms ease-out', style({ opacity: 1 }))], {
          optional: true,
        }),
      ]),
    ]),
  ],
})
export class NewTabComponent implements OnInit {
  // inject value
  private bookmarkService: BookmarkService = inject(BookmarkService);
  private settingsService: SettingsService = inject(SettingsService);
  private windowTabService: WindowTabService = inject(WindowTabService);
  private overlay: Overlay = inject(Overlay);
  private vcr: ViewContainerRef = inject(ViewContainerRef);
  private modalService: ModalService = inject(ModalService);
  private toastService: ToastService = inject(ToastService);

  breadcrumb!: Bookmark[];
  currentFolder!: Bookmark;
  overlayRef!: OverlayRef;
  selectedItem!: Bookmark;

  windows!: Window[];

  columns!: number;
  showActiveWindows!: boolean;

  dragSelectedBookmark: Bookmark | null = null;
  dropHoveredBookmark: Bookmark | null = null;

  async ngOnInit() {
    const rootFolderId = this.settingsService.getSettings().rootFolderId;
    const bookmarks = this.bookmarkService.getBookmarks()[0].children || [];
    this.currentFolder =
      this.getRootFolder(bookmarks, rootFolderId) || bookmarks[0];
    this.breadcrumb = [this.currentFolder];
    this.columns = this.settingsService.getSettings().columns;
    this.showActiveWindows =
      this.settingsService.getSettings().showActiveWindows;
    this.windows = await this.windowTabService.getWindows();
  }

  contextMenuBackground(event: MouseEvent) {
    let items: ContextMenuItem[] = this.getBackgroundContextMenuItems();
    this.openContextMenu(event, items);
  }

  contextMenuWindow(event: MouseEvent, window: Window) {
    let items: ContextMenuItem[] = this.getWindowContextMenuItems(window);
    this.openContextMenu(event, items);
  }

  clickWindow(event: MouseEvent, window: Window) {
    event.stopPropagation();
    this.windows.forEach((w) => {
      w.focused = w.id === window.id;
    });
  }

  doublClickWindow(event: MouseEvent, window: Window) {
    event.stopPropagation();
    chrome.windows.update(window.id!, {
      focused: true,
    });
  }

  contextMenuTabGroup(event: MouseEvent, tabGroup: TabGroup) {
    let items: ContextMenuItem[] = this.getTabGroupContextMenuItems(tabGroup);
    this.openContextMenu(event, items);
  }

  clickTabGroup(event: MouseEvent, tabGroup: TabGroup) {
    event.stopPropagation();
    chrome.windows
      .update(tabGroup.tabs![0].windowId, {
        focused: true,
      })
      .then(() => {
        chrome.tabs.update(tabGroup.tabs![0]!.id, { active: true });
      });
  }

  contextMenuTab(event: MouseEvent, tab: Tab) {
    let items: ContextMenuItem[] = this.getTabContextMenuItems(tab);
    this.openContextMenu(event, items);
  }

  clickTab(event: MouseEvent, tab: Tab) {
    event.stopPropagation();
    chrome.windows
      .update(tab.windowId, {
        focused: true,
      })
      .then(() => {
        chrome.tabs.update(tab.id, { active: true });
      });
  }

  contextMenuBookmark(event: MouseEvent, bookmark: Bookmark) {
    let items: ContextMenuItem[] = this.getBookmarkContextMenuItems(bookmark);
    this.openContextMenu(event, items);
  }

  clickBookmark(event: MouseEvent, bookmark: Bookmark) {
    event.stopPropagation();
    event.stopImmediatePropagation();
    event.preventDefault();
    if (bookmark?.url) {
      window.location.href = bookmark.url;
      // chrome.tabs.create({
      //   url: bookmark?.url,
      // });
    } else {
      this.breadcrumb.push(bookmark);
      this.currentFolder = bookmark;
    }
  }

  dragBookmark(event: MouseEvent, bookmark: Bookmark) {
    this.dragSelectedBookmark = bookmark;
  }

  dragOverBookmark(event: MouseEvent, bookmark: Bookmark) {
    event.preventDefault();
    if (this.dropHoveredBookmark === bookmark) {
      return;
    }
    this.dropHoveredBookmark = bookmark;
  }

  dragLeaveBookmark(event: MouseEvent, bookmark: Bookmark) {
    event.preventDefault();
    if (this.dropHoveredBookmark === null) {
      return;
    }
    this.dropHoveredBookmark = null;
  }

  dropBookmark(event: MouseEvent, bookmark: Bookmark) {
    event.preventDefault();
    if (bookmark.type == 'bookmarkFolder') {
      chrome.bookmarks.move(this.dragSelectedBookmark!.id, {
        parentId: bookmark.id,
      });
    }
    this.dragSelectedBookmark = null;
    this.dropHoveredBookmark = null;
  }

  navigateToCrumb(crumb: Bookmark) {
    const index = this.breadcrumb.indexOf(crumb);
    this.breadcrumb = this.breadcrumb.slice(0, index + 1);
    this.currentFolder = crumb;
  }

  private getBookmarkContextMenuItems(bookmark: Bookmark): ContextMenuItem[] {
    let items: ContextMenuItem[] = [];
    if (bookmark.type == 'bookmark') {
      items.push({
        label: 'Open in new tab',
        action: () => {
          chrome.tabs.create({
            url: bookmark.url,
          });
        },
      });
      items.push({
        label: 'Open in new window',
        action: () => {
          chrome.windows.create({
            url: bookmark.url,
          });
        },
      });
      items.push({
        label: 'Open in incognito',
        action: () => {
          chrome.windows.create({
            url: bookmark.url,
            incognito: true,
          });
        },
      });
      items.push({
        label: 'Edit',
        action: () => {
          console.log(`edit bookmark ${bookmark.id}`);
          // TODO
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
              this.bookmarkService.deleteBookmark(bookmark);
              this.toastService.show('Bookmark deleted', 'warning');
            });
        },
      });
    } else {
      items.push({
        label: 'Open all bookmarks',
        action: () => {
          this.modalService
            .open(ConfirmModalComponent, {
              title: 'Confirm to Open all bookmarks',
            })
            .instance.confirm.subscribe(() => {
              bookmark.children?.forEach((bookmark) => {
                if (bookmark.url) {
                  chrome.tabs.create({ url: bookmark.url });
                }
              });
            });
        },
      });
      items.push({
        label: 'Open all in new window',
        action: () => {
          this.modalService
            .open(ConfirmModalComponent, {
              title: 'Confirm to Open all in new window',
            })
            .instance.confirm.subscribe(() => {
              chrome.windows.create({
                url: bookmark.children
                  ?.map((b) => b.url)
                  .filter((u): u is string => !!u),
              });
            });
        },
      });
      items.push({
        label: 'Open all in incognito',
        action: () => {
          this.modalService
            .open(ConfirmModalComponent, {
              title: 'Confirm to Open all in incognito',
            })
            .instance.confirm.subscribe(() => {
              chrome.windows.create({
                url: bookmark.children
                  ?.map((b) => b.url)
                  .filter((u): u is string => !!u),
                incognito: true,
              });
            });
        },
      });
      items.push({
        label: 'Edit',
        action: () => {
          console.log(`edit bookmark folder ${bookmark.id}`);
          // TODO
        },
      });
    }
    return items;
  }

  private getWindowContextMenuItems(window: Window): ContextMenuItem[] {
    let items: ContextMenuItem[] = [];
    items.push({
      label: 'Close',
      action: () => {
        this.modalService
          .open(ConfirmModalComponent, {
            title: 'Confirm to close window',
            confirmButtonClass: 'btn-error',
          })
          .instance.confirm.subscribe(async () => {
            await this.windowTabService.delete(window, undefined, undefined);
            window.closed = true;
            this.toastService.show(`Window closed: ${window.title}`, 'warning');
          });
      },
    });
    return items;
  }

  private getTabGroupContextMenuItems(tabGroup: TabGroup): ContextMenuItem[] {
    let items: ContextMenuItem[] = [];
    items.push({
      label: 'Close',
      action: async () => {
        this.modalService
          .open(ConfirmModalComponent, {
            title: 'Confirm to close tab group',
            confirmButtonClass: 'btn-error',
          })
          .instance.confirm.subscribe(async () => {
            await this.windowTabService.delete(undefined, tabGroup, undefined);
            tabGroup.closed = true;
            this.toastService.show(
              `TabGroup closed: ${tabGroup.title}`,
              'warning',
            );
          });
      },
    });
    return items;
  }

  private getTabContextMenuItems(tab: Tab): ContextMenuItem[] {
    let items: ContextMenuItem[] = [];
    items.push({
      label: 'Close',
      action: async () => {
        await this.windowTabService.delete(undefined, undefined, tab);
        tab.closed = true;
        this.toastService.show(`Tab closed: ${tab.title} `, 'warning');
      },
    });
    return items;
  }

  private getBackgroundContextMenuItems(): ContextMenuItem[] {
    let items: ContextMenuItem[] = [];
    items.push({
      label: 'Bookmark Manager',
      action: () => {
        chrome.tabs.create({ url: 'chrome://bookmarks' });
      },
    });
    items.push({
      label: 'Settings',
      action: () => {
        const settingsModalRef = this.modalService.open(SettingsModalComponent);
        settingsModalRef.instance.confirm.subscribe(() => {
          console.log('用户点击了确认');
        });
        settingsModalRef.instance.columnsChange.subscribe((columns) => {
          this.columns = columns;
        });
        settingsModalRef.instance.showActiveWindowsChange.subscribe(
          (showActiveWindows) => {
            this.showActiveWindows = showActiveWindows;
          },
        );
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
    this.overlayRef.backdropClick().subscribe(() => {
      this.overlayRef?.dispose();
    });
    // backdrop disable context menu
    this.overlayRef.backdropElement?.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
  }

  private getRootFolder(
    bookmarks: Bookmark[],
    rootFolderId: string | undefined,
  ): Bookmark | null {
    for (const bookmark of bookmarks) {
      if (bookmark.type !== 'bookmarkFolder') {
        continue;
      }
      if (bookmark.id === rootFolderId) {
        return bookmark;
      }

      if (bookmark.children) {
        const result = this.getRootFolder(bookmark.children, rootFolderId);
        if (result) return result;
      }
    }
    return null;
  }

  public trackById(index: number, bookmark: Bookmark): string {
    return bookmark.id;
  }
}
