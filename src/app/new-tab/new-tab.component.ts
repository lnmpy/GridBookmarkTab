import { Component, OnInit, ViewContainerRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';

import { Bookmark, BookmarkService } from '@app/services/bookmark.service';
import {
  Tab,
  TabGroup,
  TabGroupService,
} from '@app/services/tab-group.service';

import { SettingsService } from '@app/services/settings.service';
import { ModalService } from '@app/services/modal.service';

import {
  ContextMenuComponent,
  ContextMenuItem,
} from '../components/context-menu/context-menu.component';
import { ModalHostComponent } from '../components/modal-host/modal-host.component';
import { SettingsModalComponent } from './settings-modal/settings-modal.component';
import { ConfirmModalComponent } from './confirm-modal/confirm-modal.component';

@Component({
  selector: 'app-new-tab',
  imports: [CommonModule, ModalHostComponent],
  templateUrl: './new-tab.component.html',
  styleUrls: ['./new-tab.component.scss'],
})
export class NewTabComponent implements OnInit {
  // inject value
  private bookmarkService: BookmarkService = inject(BookmarkService);
  private settingsService: SettingsService = inject(SettingsService);
  private tabGroupService: TabGroupService = inject(TabGroupService);
  private overlay: Overlay = inject(Overlay);
  private vcr: ViewContainerRef = inject(ViewContainerRef);
  private modalService: ModalService = inject(ModalService);

  breadcrumb!: Bookmark[];
  currentFolder!: Bookmark;
  overlayRef!: OverlayRef;
  selectedItem!: Bookmark;

  tabGroups!: Map<number, TabGroup>;

  columns!: number;

  async ngOnInit() {
    const rootFolderId = this.settingsService.getSettings().rootFolderId;
    const bookmarks = this.bookmarkService.getBookmarks()[0].children || [];
    this.currentFolder =
      this.getRootFolder(bookmarks, rootFolderId) || bookmarks[0];
    this.breadcrumb = [this.currentFolder];
    this.columns = this.settingsService.getSettings().columns;
    this.tabGroups = await this.tabGroupService.getTabGroups();
  }

  openContextMenu(event: MouseEvent, bookmark: Bookmark | undefined) {
    let items: ContextMenuItem[] = [];
    if (bookmark !== undefined) {
      switch (bookmark.type) {
        case 'bookmark':
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
                  confirmButtonClass: 'is-danger',
                })
                .instance.confirm.subscribe(() => {
                  this.bookmarkService.deleteBookmark(bookmark);
                });
            },
          });
          break;
        case 'bookmarkFolder':
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
          break;
        default:
          break;
      }
    } else {
      items.push({
        label: 'Bookmark Manager',
        action: () => {
          chrome.tabs.create({ url: 'chrome://bookmarks' });
        },
      });
      items.push({
        label: 'Settings',
        action: () => {
          this.modalService
            .open(SettingsModalComponent)
            .instance.confirm.subscribe(() => {
              this.columns = this.settingsService.getSettings().columns;
              console.log('用户点击了确认');
            });
        },
      });
    }
    this.internalOpenContextMenu(event, items);
  }

  openBookmarkFolder(folder: Bookmark) {
    this.breadcrumb.push(folder);
    this.currentFolder = folder;
  }

  navigateToCrumb(crumb: Bookmark) {
    const index = this.breadcrumb.indexOf(crumb);
    this.breadcrumb = this.breadcrumb.slice(0, index + 1);
    this.currentFolder = crumb;
  }

  private internalOpenContextMenu(event: MouseEvent, items: ContextMenuItem[]) {
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

  trackById(index: number, bookmark: Bookmark): string {
    return bookmark.id;
  }
}
