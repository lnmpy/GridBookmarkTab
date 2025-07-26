import {
  Component,
  OnInit,
  HostListener,
  ViewContainerRef,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';

import { Bookmark, BookmarkService } from '../services/bookmark.service';
import { SettingsService } from '../services/settings.service';
import {
  ContextMenuComponent,
  ContextMenuItem,
} from '../components/context-menu/context-menu.component';

@Component({
  selector: 'app-new-tab',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './new-tab.component.html',
  styleUrls: ['./new-tab.component.scss'],
})
export class NewTabComponent implements OnInit {
  // inject value
  private bookmarkService: BookmarkService = inject(BookmarkService);
  private settingsService: SettingsService = inject(SettingsService);
  private overlay: Overlay = inject(Overlay);
  private vcr: ViewContainerRef = inject(ViewContainerRef);

  breadcrumb: Bookmark[] = [];
  currentFolder: Bookmark | undefined;
  overlayRef: OverlayRef | null = null;
  selectedItem: Bookmark | null = null;

  columns: number = 7;

  ngOnInit() {
    const rootFolderId = this.settingsService.getSettings().rootFolderId;
    const bookmarks = this.bookmarkService.getBookmarks()[0].children || [];
    this.currentFolder =
      this.getRootFolder(bookmarks, rootFolderId) || bookmarks[0];
    this.breadcrumb = [this.currentFolder];
  }

  openContextMenu(event: MouseEvent, bookmark: Bookmark | undefined) {
    let items: ContextMenuItem[] = [];
    console.log(bookmark);
    if (bookmark !== undefined) {
      switch (bookmark.type) {
        case 'bookmark':
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
              console.log(`delete bookmark ${bookmark.id}`);
              // TODO
            },
          });
          break;
        case 'bookmarkFolder':
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
    }
    items.push({
      label: 'Bookmark Manager',
      action: () => {
        chrome.tabs.create({ url: 'chrome://bookmarks' });
      },
    });
    // 动态传菜单项
    this.internalOpenContextMenu(event, items);
  }

  @HostListener('document:mousedown', ['$event'])
  onClickOutside(event: MouseEvent) {
    //prevent default event
    event.preventDefault();
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
    rootFolderId: string,
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
}
