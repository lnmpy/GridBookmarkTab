import { Component, OnInit, ViewContainerRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import {
  CdkDrag,
  CdkDropList,
  CdkDragDrop,
  transferArrayItem,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { heroHome } from '@ng-icons/heroicons/outline';
import {
  trigger,
  transition,
  style,
  animate,
  query,
  group,
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
import { WindowTabgroupModalComponent } from './window-tabgroup-modal/window-tabgroup-modal.component';

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

  // bookmarks
  breadcrumb: Bookmark[] = [];
  rootFolder!: Bookmark;
  currentFolder!: Bookmark;

  // windows/tabgroups/tabs
  windows!: Window[];

  // settings
  bookmarkDisplayColumn!: number;
  bookmarkDisplayGap!: number;
  bookmarkDisplayRowHeight!: number;
  activeTabsDisplay!: boolean;
  bookmarkOpenInNewTab!: boolean;

  // drag & drop
  draggedItem: Bookmark | Tab | TabGroup | Window | undefined = undefined;
  draggedHoverdItem: Bookmark | Tab | TabGroup | Window | undefined = undefined;

  allBookmarkFolderIds: string[] = [];

  ngOnInit() {
    this.settingsService.onSettingsChange().subscribe((s) => {
      if (!s) {
        return;
      }
      this.bookmarkDisplayColumn = s.bookmarkDisplayColumn;
      this.bookmarkDisplayGap = s.bookmarkDisplayGap;
      this.bookmarkDisplayRowHeight = s.bookmarkDisplayRowHeight;
      this.bookmarkOpenInNewTab = s.bookmarkOpenInNewTab;
      this.activeTabsDisplay = s.activeTabsDisplay;
    });

    this.bookmarkService.bookmarks$.subscribe((b) => {
      if (!b) {
        return;
      }
      this.rootFolder = b;
      this.currentFolder = this.rootFolder;
      this.breadcrumb = [this.rootFolder];

      if (this.currentFolder.children) {
        this.allBookmarkFolderIds = [];
        // this.allBookmarkFolderIds = [`bookmarkfolder-${this.currentFolder.id}`];
        for (const bookmark of this.currentFolder.children) {
          if (bookmark.type == 'bookmarkFolder') {
            this.allBookmarkFolderIds.push(`bookmark-${bookmark.id}`);
          }
        }
      }
    });

    this.windowTabService.windows$.subscribe((w) => {
      if (!w) {
        return;
      }
      this.windows = w;
    });
  }

  onClick(event: MouseEvent, item: Bookmark | Tab | TabGroup | Window) {
    switch (item?.type) {
      case 'window': {
        const window = item as Window;
        this.windows.forEach((w) => {
          w.focused = w.id === window.id;
        });
        break;
      }
      case 'tabGroup': {
        const tabGroup = item as TabGroup;
        this.windowTabService.focusTabGroup(tabGroup);
        break;
      }
      case 'tab': {
        const tab = item as Tab;
        this.windowTabService.focusTab(tab);
        break;
      }
      case 'bookmark': {
        if (event.ctrlKey || event.shiftKey || event.metaKey) {
          return;
        }
        const bookmark = item as Bookmark;
        if (this.bookmarkOpenInNewTab) {
          window.location.href = bookmark.url!;
        } else {
          this.windowTabService.createTab([bookmark.url!], {
            active: false,
          });
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
    this.windowTabService.focusWindow(item);
  }

  onContextMenu(
    event: MouseEvent,
    item: Bookmark | Tab | TabGroup | Window | undefined = undefined,
  ) {
    let items: ContextMenuItem[];
    switch (item?.type) {
      case 'window':
        items = this.getWindowContextMenuItems(item as Window);
        break;
      case 'tabGroup':
        items = this.getTabGroupContextMenuItems(item as TabGroup);
        break;
      case 'tab':
        items = this.getTabContextMenuItems(item as Tab);
        break;
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
    const dragItemType = this.draggedItem?.type;
    const droppedItem = event.container.data[event.currentIndex];
    const droppedItemType = droppedItem?.type;

    console.log('onDrop', dragItemType, droppedItemType);

    if (
      this.draggedItem === undefined ||
      droppedItem === undefined ||
      this.draggedItem === droppedItem
    ) {
      this.draggedItem = undefined;
      this.draggedHoverdItem = undefined;
      return;
    }

    // if (this.draggedItem.type === droppedItem.type) {
    //   this.draggedItem = undefined;
    //   this.draggedHoverdItem = undefined;
    //   return;
    // }

    switch (`${this.draggedItem.type}->${droppedItem.type}`) {
      case 'bookmark->bookmark': {
        const bookmark = this.draggedItem as Bookmark;
        const bookmarkTarget = droppedItem as Bookmark;
        const targetIndex =
          bookmarkTarget.index! < bookmark.index!
            ? bookmarkTarget.index!
            : bookmarkTarget.index! + 1;
        this.bookmarkService.move(bookmark.id, {
          parentId: bookmarkTarget.parentId,
          index: targetIndex,
        });
        break;
      }
      case 'bookmark->bookmarkFolder': {
        const bookmark = this.draggedItem as Bookmark;
        const bookmarkFolder = droppedItem as Bookmark;
        this.bookmarkService.move(bookmark.id, {
          parentId: bookmarkFolder.id,
        });
        break;
      }
      case 'tab->tab': {
        const tab = this.draggedItem as Tab;
        const tabTarget = droppedItem as Tab;
        this.windowTabService.moveTab([tab.id!], {
          index: tabTarget.index!,
        });
        break;
      }
      case 'tab->tabGroup': {
        const tab = this.draggedItem as Tab;
        const tabGroup = droppedItem as TabGroup;
        this.windowTabService.groupTab([tab.id!], tabGroup.id);
        break;
      }
      case 'tab->window': {
        const tab = this.draggedItem as Tab;
        const window = droppedItem as Window;
        this.windowTabService.moveTab([tab.id!], { windowId: window.id! });
        break;
      }
      case 'tabGroup->window': {
        const tabGroup = this.draggedItem as TabGroup;
        const window = droppedItem as Window;
        this.windowTabService.moveTabGroup(tabGroup, {
          windowId: window.id!,
        });
        break;
      }
    }
    this.draggedItem = undefined;
    this.draggedHoverdItem = undefined;
  }

  onDragStarted(item: Bookmark | Tab | TabGroup | Window) {
    // cannot add event.preventDefault() or it will stop the next dragover/dragleave event
    this.draggedItem = item;
    console.log('onDragStarted', item);
  }

  onDragEnded() {
    console.log('onDragEnded');
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

  isDroppableHover(item: Bookmark | Tab | TabGroup | Window): boolean {
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

  private getBookmarkContextMenuItems(bookmark: Bookmark): ContextMenuItem[] {
    let items: ContextMenuItem[] = [];
    items.push({
      label: 'Open in new tab',
      action: () => {
        this.windowTabService.createTab([bookmark.url!], {
          active: this.bookmarkOpenInNewTab,
        });
      },
    });
    items.push({
      label: 'Open in new window',
      action: () => {
        this.windowTabService.createWindow(bookmark.url!);
      },
    });
    items.push({
      label: 'Open in incognito',
      action: () => {
        this.windowTabService.createWindow(bookmark.url!, true);
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
          const tabIds = await this.windowTabService.createTab(
            bookmark
              .children!.filter((u): u is Bookmark => !!u.url)
              .map((b) => b.url) as string[],
          );
          if (tabIds && tabIds.length > 0) {
            this.windowTabService.createTabGroup(tabIds, bookmark.title);
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
          const newWindow = await this.windowTabService.createWindow(
            bookmark
              .children!.map((b) => b.url)
              .filter((u): u is string => !!u),
          );
          if (newWindow && newWindow.tabs) {
            this.windowTabService.createTabGroup(
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
          await this.windowTabService.createWindow(
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
            await this.windowTabService.deleteWindow(window);
            this.toastService.show('Window closed', 'warning');
          });
      },
    });
    return items;
  }

  private getTabGroupContextMenuItems(tabGroup: TabGroup): ContextMenuItem[] {
    let items: ContextMenuItem[] = [];
    items.push({
      label: 'Edit',
      action: () => {
        this.modalService
          .open(WindowTabgroupModalComponent, {
            title: 'Edit tab group',
            tabGroup: tabGroup,
          })
          .instance.confirm.subscribe(() => {
            this.toastService.show('Tab group updated', 'info');
          });
      },
    });
    items.push({
      label: 'Ungroup',
      action: async () => {
        this.modalService
          .open(ConfirmModalComponent, {
            title: 'Confirm to ungroup tab group',
            confirmButtonClass: 'btn-error',
          })
          .instance.confirm.subscribe(async () => {
            await this.windowTabService.ungroupTabGroup(tabGroup);
            this.toastService.show(
              `TabGroup ungrouped: ${tabGroup.title}`,
              'warning',
            );
          });
      },
    });
    items.push({
      label: 'Delete',
      action: async () => {
        this.modalService
          .open(ConfirmModalComponent, {
            title: 'Confirm to delete tab group',
            confirmButtonClass: 'btn-error',
          })
          .instance.confirm.subscribe(async () => {
            await this.windowTabService.deleteTabGroup(tabGroup);
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
        await this.windowTabService.deleteTab([tab.id!]);
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
        this.windowTabService.createTab(
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

  public trackById(index: number, bookmark: Bookmark): string {
    return bookmark.id;
  }
}
