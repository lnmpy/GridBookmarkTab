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

  // bookmarks
  breadcrumb: Bookmark[] = [];
  rootFolder!: Bookmark;
  currentFolder!: Bookmark;

  // windows/tabgroups/tabs
  windows!: Window[];

  // settings
  columns!: number;
  showActiveWindows!: boolean;
  clickOpenBookmarkInCurrentTab!: boolean;
  dragOpenBookmarkInBackground!: boolean;

  // drag & drop
  draggedSource: Bookmark | Tab | TabGroup | Window | undefined = undefined;
  draggeHoverdTarget: Bookmark | Tab | TabGroup | Window | undefined =
    undefined;

  ngOnInit() {
    this.settingsService.settings$.subscribe((s) => {
      if (!s) {
        return;
      }
      this.columns = s.columns;
      this.showActiveWindows = s.showActiveWindows;
      this.clickOpenBookmarkInCurrentTab = s.clickOpenBookmarkInCurrentTab;
      this.dragOpenBookmarkInBackground = s.dragOpenBookmarkInBackground;
    });

    this.bookmarkService.bookmarks$.subscribe((b) => {
      if (!b) {
        return;
      }
      this.rootFolder = b;
      this.currentFolder = this.rootFolder;
      this.breadcrumb = [this.rootFolder];
      // TODO 当bookmark刷新时, 刷新当前文件夹, 不要更新breadcrumb和currentFolder
    });

    this.windowTabService.windows$.subscribe((w) => {
      if (!w) {
        return;
      }
      this.windows = w;
    });
  }

  click(event: MouseEvent, target: Bookmark | Tab | TabGroup | Window) {
    switch (target?.type) {
      case 'window': {
        const window = target as Window;
        this.windows.forEach((w) => {
          w.focused = w.id === window.id;
        });
        break;
      }
      case 'tabGroup': {
        const tabGroup = target as TabGroup;
        this.windowTabService.focusTabGroup(tabGroup);
        break;
      }
      case 'tab': {
        const tab = target as Tab;
        this.windowTabService.focusTab(tab);
        break;
      }
      case 'bookmark': {
        if (event.ctrlKey || event.shiftKey || event.metaKey) {
          return;
        }
        const bookmark = target as Bookmark;
        if (this.clickOpenBookmarkInCurrentTab) {
          window.location.href = bookmark.url!;
        } else {
          this.windowTabService.createTab([bookmark.url!], {
            active: false,
          });
        }
        break;
      }
      case 'bookmarkFolder': {
        const bookmark = target as Bookmark;
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

  doublClick(event: MouseEvent, window: Window) {
    event.stopPropagation();
    this.windowTabService.focusWindow(window);
  }

  contextMenu(
    event: MouseEvent,
    target: Bookmark | Tab | TabGroup | Window | undefined = undefined,
  ) {
    let items: ContextMenuItem[];
    switch (target?.type) {
      case 'window':
        items = this.getWindowContextMenuItems(target as Window);
        break;
      case 'tabGroup':
        items = this.getTabGroupContextMenuItems(target as TabGroup);
        break;
      case 'tab':
        items = this.getTabContextMenuItems(target as Tab);
        break;
      case 'bookmark':
        items = this.getBookmarkContextMenuItems(target as Bookmark);
        break;
      case 'bookmarkFolder':
        items = this.getBookmarkFolderContextMenuItems(target as Bookmark);
        break;
      default:
        items = this.getBackgroundContextMenuItems();
    }
    this.openContextMenu(event, items);
  }

  dragSource(event: MouseEvent, source: Bookmark | Tab | TabGroup | Window) {
    // cannot add event.preventDefault() or it will stop the next dragover/dragleave event
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
  dropTarget(event: MouseEvent, target: Bookmark | Tab | TabGroup | Window) {
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
      this.draggedSource = undefined;
      this.draggeHoverdTarget = undefined;
      return;
    }

    switch (`${this.draggedSource.type}->${target.type}`) {
      case 'bookmark->bookmark': {
        const bookmark = this.draggedSource as Bookmark;
        const bookmarkTarget = target as Bookmark;
        this.bookmarkService.move(bookmark.id, {
          parentId: bookmarkTarget.parentId,
          index: bookmarkTarget.index!,
        });
        break;
      }
      case 'bookmark->bookmarkFolder': {
        const bookmark = this.draggedSource as Bookmark;
        const bookmarkFolder = target as Bookmark;
        this.bookmarkService.move(bookmark.id, {
          parentId: bookmarkFolder.id,
        });
        break;
      }
      case 'bookmark->tabGroup': {
        const bookmark = this.draggedSource as Bookmark;
        const tabGroup = target as TabGroup;
        this.windowTabService.createTab([bookmark.url!], {
          windowId: tabGroup.windowId!,
          groupId: tabGroup.id,
          active: !this.dragOpenBookmarkInBackground,
        });
        break;
      }
      case 'bookmark->window': {
        const bookmark = this.draggedSource as Bookmark;
        const window = target as Window;
        this.windowTabService.createTab([bookmark.url!], {
          windowId: window.id!,
        });
        break;
      }
      case 'tab->tab': {
        const tab = this.draggedSource as Tab;
        const tabTarget = target as Tab;
        this.windowTabService.moveTab([tab.id!], {
          index: tabTarget.index!,
        });
        break;
      }
      case 'tab->tabGroup': {
        const tab = this.draggedSource as Tab;
        const tabGroup = target as TabGroup;
        this.windowTabService.groupTab([tab.id!], tabGroup.id);
        break;
      }
      case 'tab->window': {
        const tab = this.draggedSource as Tab;
        const window = target as Window;
        this.windowTabService.moveTab([tab.id!], { windowId: window.id! });
        break;
      }
      case 'tabGroup->window': {
        const tabGroup = this.draggedSource as TabGroup;
        const window = target as Window;
        this.windowTabService.moveTabGroup(tabGroup, {
          windowId: window.id!,
        });
        break;
      }
    }
    this.draggedSource = undefined;
    this.draggeHoverdTarget = undefined;
  }

  isDroppableHover(target: Bookmark | Tab | TabGroup | Window): boolean {
    return this.isDroppable(target) && this.draggeHoverdTarget === target;
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
    items.push({
      label: 'Open in new tab',
      action: () => {
        this.windowTabService.createTab([bookmark.url!], {
          active: this.clickOpenBookmarkInCurrentTab,
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
        if (!bookmark.children) {
          return;
        }
        this.modalService
          .open(ConfirmModalComponent, {
            title: 'Confirm to Open all bookmarks',
          })
          .instance.confirm.subscribe(async () => {
            const tabIds = await this.windowTabService.createTab(
              bookmark
                .children!.filter((u): u is Bookmark => !!u.url)
                .map((b) => b.url) as string[],
            );
            this.windowTabService.createTabGroup(tabIds, bookmark.title);
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
            this.windowTabService.createWindow(
              bookmark
                .children!.map((b) => b.url)
                .filter((u): u is string => !!u),
            );
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
            this.windowTabService.createWindow(
              bookmark
                .children!.map((b) => b.url)
                .filter((u): u is string => !!u),
              true,
            );
          });
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
