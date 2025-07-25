import { Injectable } from '@angular/core';

import { FavIconService } from './favicon.service';

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
}

@Injectable({
  providedIn: 'root',
})
export class BookmarkService {
  private bookmarks: Bookmark[] = [];

  constructor(private favIconService: FavIconService) {}

  public async initService(): Promise<void> {
    await this.favIconService.initService();
    this.bookmarks = await new Promise((resolve, reject) => {
      chrome.bookmarks.getTree().then((bookmarkTreeNodes) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        const allBookmarks = this.buildBookmarkList(bookmarkTreeNodes);
        resolve(allBookmarks);
      });
    });
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

  // TODO CRUD bookmarks
}
