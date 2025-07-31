import { Injectable, inject } from '@angular/core';

import { FavIconService } from '@app/services/favicon.service';

export type BookmarkType = 'bookmark' | 'bookmarkFolder';

export interface Bookmark {
  id: string;
  parentId?: string;
  index?: number;
  url?: string;
  title: string;
  dateAdded?: number;
  dateGroupModified?: number;
  children?: Bookmark[];
  type: BookmarkType;
  favIconUrl?: string;

  deleted?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class BookmarkService {
  // inject value
  private favIconService: FavIconService = inject(FavIconService);

  private bookmarks: Bookmark[] = [];

  public async initService() {
    await this.favIconService.initService();
    const bookmarkTreeNodes = await chrome.bookmarks.getTree();
    if (chrome.runtime.lastError) {
      throw chrome.runtime.lastError;
    }
    this.bookmarks = this.buildBookmarkList(bookmarkTreeNodes);
  }

  private buildBookmarkList(
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
        bookmark.children = this.buildBookmarkList(node.children);
        bookmark.dateGroupModified = node.dateGroupModified;
      } else {
        this.favIconService.loadBookmarkFavIconUrl(bookmark);
      }
      bookmarks.push(bookmark);
    }
    return bookmarks;
  }

  public getBookmarks(): Bookmark[] {
    return this.bookmarks;
  }

  public async deleteBookmark(bookmark: Bookmark) {
    if (!bookmark) {
      return;
    }
    await chrome.bookmarks.remove(bookmark.id);
    if (chrome.runtime.lastError) {
      throw chrome.runtime.lastError;
    }
    bookmark.deleted = true;
  }

  // TODO CRUD bookmarks
}
