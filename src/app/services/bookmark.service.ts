import { Injectable, inject } from '@angular/core';

import { FaviconService } from '@app/services/favicon.service';
import { Bookmark } from '@app/services/types';

@Injectable({
  providedIn: 'root',
})
export class BookmarkService {
  // inject value
  private favIconService: FaviconService = inject(FaviconService);

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

  public async getAll(): Promise<Bookmark[]> {
    await this.favIconService.initService();
    const bookmarkTreeNodes = await chrome.bookmarks.getTree();
    if (chrome.runtime.lastError) {
      throw chrome.runtime.lastError;
    }
    return this.iterateBookmarkNodes(bookmarkTreeNodes);
  }

  public async get(id: string): Promise<Bookmark> {
    await this.favIconService.initService(); // TODO 确保仅被执行一次吧
    const bookmarkTreeNodes = await chrome.bookmarks.getSubTree(id);
    if (chrome.runtime.lastError) {
      throw chrome.runtime.lastError;
    }
    return this.iterateBookmarkNodes(bookmarkTreeNodes)[0];
  }

  async create(bookmark: Bookmark): Promise<Bookmark> {
    const result = await chrome.bookmarks.create({
      title: bookmark.title,
      url: bookmark.url,
      parentId: bookmark.parentId,
    });

    if (chrome.runtime.lastError) {
      throw chrome.runtime.lastError;
    }
    return await this.get(result.id);
  }

  async update(id: string, changes: Partial<Bookmark>): Promise<void> {
    await chrome.bookmarks.update(id, {
      title: changes.title,
      url: changes.url,
    });

    if (chrome.runtime.lastError) {
      throw chrome.runtime.lastError;
    }
  }

  public async delete(bookmark: Bookmark) {
    if (!bookmark) {
      return;
    }
    await chrome.bookmarks.remove(bookmark.id);
    if (chrome.runtime.lastError) {
      throw chrome.runtime.lastError;
    }
  }
}
