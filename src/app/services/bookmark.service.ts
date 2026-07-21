import { Injectable, inject, NgZone } from '@angular/core';
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
  private readonly ngZone: NgZone = inject(NgZone);

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

    this.favIconService.faviconLoaded$.subscribe(({ id, url }) => {
      if (this.updateFaviconDeep(this.bookmarksSource.value, id, url)) {
        this.ngZone.run(() => {
          this.bookmarksSource.next(this.bookmarksSource.value);
        });
      }
    });

    // Listen to Chrome bookmark change events directly
    this.setupBookmarkListeners();
  }

  private setupBookmarkListeners() {
    const reloadWithDebounce = this.debounce(() => {
      console.log('Bookmark changed, reloading...');
      // Use ngZone.run to ensure Angular change detection is triggered
      this.ngZone.run(() => {
        this.reloadBookmarks();
      });
    }, 100);

    // Listen to all bookmark change events
    chrome.bookmarks.onCreated.addListener(() => reloadWithDebounce());
    chrome.bookmarks.onRemoved.addListener(() => reloadWithDebounce());
    chrome.bookmarks.onChanged.addListener(() => reloadWithDebounce());
    chrome.bookmarks.onMoved.addListener(() => reloadWithDebounce());
    chrome.bookmarks.onChildrenReordered?.addListener(() => reloadWithDebounce());
  }

  private debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    return ((...args: unknown[]) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => fn(...args), delay);
    }) as T;
  }

  private async iterateBookmarkNodesAsync(
    bookmarkTreeNodes: chrome.bookmarks.BookmarkTreeNode[],
  ): Promise<Bookmark[]> {
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
        bookmark.children = await this.iterateBookmarkNodesAsync(node.children);
        bookmark.dateGroupModified = node.dateGroupModified;
      } else {
        // Try to get cached favicon first (synchronous, no flickering)
        const cachedFavicon = this.favIconService.getCachedFavicon(bookmark);
        if (cachedFavicon) {
          bookmark.favIconUrl = cachedFavicon;
        } else {
          // Load favicon asynchronously without blocking bookmark loading
          this.favIconService.loadBookmarkFavIconUrl(bookmark).catch(() => { });
        }
      }
      bookmarks.push(bookmark);
    }
    return bookmarks;
  }

  private updateFaviconDeep(root: Bookmark, targetId: string, url: string): boolean {
    if (!root) return false;

    // Create a stack instead of standard recursion for efficiency on deep trees
    const stack = [root];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node.id === targetId) {
        node.favIconUrl = url;
        return true;
      }
      if (node.children && node.children.length > 0) {
        stack.push(...node.children);
      }
    }
    return false;
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

  private faviconInitialized = false;

  private async reloadBookmarks() {
    // Initialize FaviconService only on first load
    if (!this.faviconInitialized) {
      await this.favIconService.initService();
      this.faviconInitialized = true;
    }
    const bookmarkTreeNodes = await chrome.bookmarks.getSubTree(
      this.rootFolderId,
    );
    const bookmarks = await this.iterateBookmarkNodesAsync(bookmarkTreeNodes);
    this.ngZone.run(() => {
      this.bookmarksSource.next(bookmarks[0]);
    });
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
