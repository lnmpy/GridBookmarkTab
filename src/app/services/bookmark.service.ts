import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

import { SettingsService } from '@app/services/settings.service';
import { FaviconService } from '@app/services/favicon.service';
import { Bookmark } from '@app/services/types';

@Injectable({
  providedIn: 'root',
})
export class BookmarkService {
  // inject value
  private readonly settingsService: SettingsService = inject(SettingsService);
  private readonly favIconService: FaviconService = inject(FaviconService);

  private readonly bookmarksSource = new BehaviorSubject<Bookmark>(
    {} as Bookmark,
  );
  public readonly bookmarks$ = this.bookmarksSource.asObservable();
  private rootFolderId: string = '';

  constructor() {
    this.settingsService.onSettingsChange().subscribe(async (settings) => {
      if (settings?.bookmarkRootFolderId) {
        this.rootFolderId = settings.bookmarkRootFolderId;
        await this.reloadBookmarks();
      }
    });
  }

  private iterateBookmarkNodes(
    bookmarkTreeNodes: chrome.bookmarks.BookmarkTreeNode[],
  ): Bookmark[] {
    const bookmarks: Bookmark[] = [];

    for (const node of bookmarkTreeNodes) {
      const bookmark: Bookmark = {
        id: node.id,
        parentId: node.parentId,
        index: node.index,
        title: node.title,
        dateAdded: node.dateAdded,
        type: node.url ? 'bookmark' : 'bookmarkFolder',
        url: node.url,
        favIconUrl: node.url
          ? '/assets/icons/default-icon.svg'
          : '/assets/icons/folder-icon.svg',
      };

      if (node.children) {
        bookmark.children = this.iterateBookmarkNodes(node.children);
        bookmark.dateGroupModified = node.dateGroupModified;
      } else {
        this.favIconService.loadBookmarkFavIconUrl(bookmark);
      }
      bookmarks.push(bookmark);
    }
    return bookmarks;
  }

  public async getAllBookmarkFolders(): Promise<Bookmark[]> {
    function flattenFolders(
      bookmarks: chrome.bookmarks.BookmarkTreeNode[],
      depth = 0,
    ): Bookmark[] {
      let result: Bookmark[] = [];
      for (const bc of bookmarks || []) {
        if (!bc.url) {
          // id=0 is the root folder, ignore it
          result.push({
            id: bc.id,
            title: bc.title || 'Root',
            type: 'bookmarkFolder',
            depth,
          });
          if (bc.children) {
            result = result.concat(flattenFolders(bc.children, depth + 1));
          }
        }
      }
      return result;
    }
    const bookmarkTreeNodes = await chrome.bookmarks.getTree();
    return flattenFolders(bookmarkTreeNodes || []);
  }

  private async reloadBookmarks() {
    await this.favIconService.initService(); // TODO 确保仅被执行一次吧
    const bookmarkTreeNodes = await chrome.bookmarks.getSubTree(
      this.rootFolderId,
    );
    const bookmark = this.iterateBookmarkNodes(bookmarkTreeNodes)[0];
    this.bookmarksSource.next(bookmark);
  }

  public async create(bookmark: Bookmark, reload = true): Promise<void> {
    await chrome.bookmarks.create({
      title: bookmark.title,
      url: bookmark.url,
      parentId: bookmark.parentId,
    });
    if (reload) {
      await this.reloadBookmarks();
    }
  }

  public async update(
    id: string,
    changes: Partial<Bookmark>,
    reload = true,
  ): Promise<void> {
    await chrome.bookmarks.update(id, {
      title: changes.title,
      url: changes.url,
    });
    if (changes.parentId) {
      await chrome.bookmarks.move(id, { parentId: changes.parentId });
    }
    if (reload) {
      await this.reloadBookmarks();
    }
  }

  public async move(
    id: string,
    changes: Partial<Bookmark>,
    reload = true,
  ): Promise<void> {
    await chrome.bookmarks.move(id, {
      parentId: changes.parentId,
      index: changes.index,
    });
    if (reload) {
      await this.reloadBookmarks();
    }
  }

  public async delete(bookmark: Bookmark, reload = true): Promise<void> {
    if (!bookmark) {
      return;
    }
    if (bookmark.type === 'bookmarkFolder') {
      await chrome.bookmarks.removeTree(bookmark.id);
    } else {
      await chrome.bookmarks.remove(bookmark.id);
    }
    if (reload) {
      await this.reloadBookmarks();
    }
  }
}
