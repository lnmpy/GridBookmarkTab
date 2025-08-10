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
import { NgIcon, provideIcons } from '@ng-icons/core';
import { heroHome } from '@ng-icons/heroicons/outline';
import {
  trigger,
  transition,
  style,
  animate,
  query,
} from '@angular/animations';

import { Bookmark, Window, TabGroup, Tab } from '@app/services/types';
import { BookmarkService } from '@app/services/bookmark.service';
import { WindowTabService } from '@app/services/window-tab.service';

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

  overlayRef!: OverlayRef;

  breadcrumb: Bookmark[] = [];
  rootFolder!: Bookmark;
  currentFolder!: Bookmark;

  // windows/tabgroups/tabs
  windows!: Window[];

  // settings
  columns!: number;
  showActiveWindows!: boolean;

  // drag & drop
  draggedSource: Bookmark | Tab | TabGroup | Window | undefined = undefined;
  draggeHoverdTarget: Bookmark | Tab | TabGroup | Window | undefined =
    undefined;

  async ngOnInit() {
    const rootFolderId = this.settingsService.getSettings().rootFolderId;
    this.rootFolder = await this.bookmarkService.get(rootFolderId);
    this.currentFolder = this.rootFolder;
    this.breadcrumb = [this.rootFolder];
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
    event.preventDefault();
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
    event.preventDefault();
    chrome.windows
      .update(tab.windowId, {
        focused: true,
      })
      .then(() => {
        chrome.tabs.update(tab.id, { active: true });
      });
  }

  contextMenuBookmark(event: MouseEvent, bookmark: Bookmark) {
    event.preventDefault();
    let items: ContextMenuItem[] = this.getBookmarkContextMenuItems(bookmark);
    this.openContextMenu(event, items);
  }

  clickBookmark(event: MouseEvent, bookmark: Bookmark) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (bookmark?.url) {
      if (this.settingsService.getSettings().openBookmarkInCurrentTab) {
        window.location.href = bookmark.url;
      } else {
        chrome.tabs.create({
          url: bookmark?.url,
        });
      }
    } else {
      this.breadcrumb.push(bookmark);
      this.currentFolder = bookmark;
    }
  }

  // special for mouse middle click
  mousedownBookmark(event: MouseEvent, bookmark: Bookmark) {
    if (event.button === 1 && bookmark.type === 'bookmarkFolder') {
      this.clickBookmark(event, bookmark);
    } else if (event.button === 2 || event.button === 3) {
      // event.stopPropagation();
      // event.stopImmediatePropagation();
    }
    // event.preventDefault();
  }

  dragSource(event: MouseEvent, source: Bookmark | Tab | TabGroup | Window) {
    this.draggedSource = source;
  }

  dragOverTarget(
    event: MouseEvent,
    target: Bookmark | Tab | TabGroup | Window,
  ) {
    event.preventDefault();
    if (this.draggeHoverdTarget === target) {
      return;
    }
    this.draggeHoverdTarget = target;
  }

  dragLeaveTarget(event: MouseEvent) {
    event.preventDefault();
    this.draggeHoverdTarget = undefined;
  }

  @HostListener('document:dragend')
  dropTarget(
    event: MouseEvent,
    target: Bookmark | Tab | TabGroup | Window | undefined,
  ) {
    if (
      this.draggedSource === undefined ||
      target === undefined ||
      this.draggedSource === target
    ) {
      this.draggedSource = undefined;
      this.draggeHoverdTarget = undefined;
      return;
    }
    if (this.draggedSource.type === target.type) {
      return;
    }

    switch (`${this.draggedSource.type}->${target.type}`) {
      case 'bookmark->bookmark': {
        const bookmark = this.draggedSource as Bookmark;
        const bookmarkTarget = target as Bookmark;
        chrome.bookmarks.move(bookmark.id, {
          parentId: bookmarkTarget.parentId,
          index: bookmarkTarget.index!,
        });
        break;
      }
      case 'bookmark->bookmarkFolder': {
        const bookmark = this.draggedSource as Bookmark;
        const bookmarkFolder = target as Bookmark;
        chrome.bookmarks.move(bookmark.id, {
          parentId: bookmarkFolder.id,
        });
        break;
      }
      case 'bookmark->tabGroup': {
        const bookmark = this.draggedSource as Bookmark;
        const tabGroup = target as TabGroup;
        chrome.tabs
          .create({
            url: bookmark.url,
            windowId: tabGroup.windowId,
            active: true,
            index: -1,
          })
          .then((tab) => {
            chrome.tabs.group({
              tabIds: [tab.id!],
              groupId: tabGroup.id,
            });
          });
        break;
      }
      case 'bookmark->window': {
        const bookmark = this.draggedSource as Bookmark;
        const window = target as Window;
        chrome.tabs.create({
          url: bookmark.url,
          windowId: window.id!,
          active: true,
          index: -1,
        });
        break;
      }
      case 'tab->tab': {
        const tab = this.draggedSource as Tab;
        const tabTarget = target as Tab;
        chrome.tabs.move(tab.id!, {
          windowId: tabTarget.windowId,
          index: tabTarget.index!,
        });
        break;
      }
      case 'tab->tabGroup': {
        const tab = this.draggedSource as Tab;
        const tabGroup = target as TabGroup;
        chrome.tabs.group({
          tabIds: [tab.id!],
          groupId: tabGroup.id,
        });
        break;
      }
      case 'tab->window': {
        const tab = this.draggedSource as Tab;
        const window = target as Window;
        chrome.tabs.move(tab.id! as number, {
          windowId: window.id! as number,
          index: -1,
        });
        break;
      }
      case 'tabGroup->tabGroup': {
        const tabGroup = this.draggedSource as TabGroup;
        const tabGroupTarget = target as TabGroup;
        console.log(tabGroup, tabGroupTarget);
        chrome.tabGroups.move(tabGroup.id, {
          windowId: tabGroupTarget.windowId,
          index: 0,
        });
        break;
      }
      case 'tabGroup->window': {
        const tabGroup = this.draggedSource as TabGroup;
        const window = target as Window;
        chrome.tabs.move(tabGroup.tabs![0]!.id, {
          windowId: window.id! as number,
          index: -1,
        });
        break;
      }
    }
  }

  isDroppableHover(target: Bookmark | Tab | TabGroup | Window): boolean {
    return this.isDroppable(target) && this.draggeHoverdTarget === target;
  }

  isNoDroppableUI(target: Bookmark | Tab | TabGroup | Window): boolean {
    return (
      this.draggedSource !== undefined &&
      this.draggedSource !== target &&
      !this.isDroppable(target)
    );
  }

  isDroppable(target: Bookmark | Tab | TabGroup | Window) {
    if (this.draggedSource === undefined || this.draggedSource === target) {
      return false;
    }
    if (this.draggedSource.type === 'bookmark') {
      return ['bookmarkFolder', 'tabGroup', 'window'].includes(target.type);
    } else if (this.draggedSource.type === 'bookmarkFolder') {
      if (target.type === 'bookmarkFolder') {
        return this.draggedSource !== target;
      }
    } else if (this.draggedSource.type === 'tab') {
      if (target.type === 'tabGroup') {
        return (this.draggedSource as Tab).groupId !== target.id;
      } else if (target.type === 'window') {
        return (this.draggedSource as TabGroup).windowId !== target.id;
      }
    } else if (this.draggedSource.type === 'tabGroup') {
      if (target.type === 'window') {
        return (this.draggedSource as TabGroup).windowId !== target.id;
      }
    }
    return false;
  }

  clickCrumb(crumb: Bookmark) {
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
            this.toastService.show(
              `<small>Window closed</small>: ${window.title}`,
              'warning',
            );
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

  public trackById(index: number, bookmark: Bookmark): string {
    return bookmark.id;
  }
}
