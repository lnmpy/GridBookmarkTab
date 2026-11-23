import { Injectable, inject } from "@angular/core";
import { BehaviorSubject } from "rxjs";

import { SettingsService } from "@app/services/settings.service";
import { FaviconService } from "@app/services/favicon.service";
import { Bookmark } from "@app/services/types";

@Injectable({
  providedIn: "root",
})
export class BookmarkService {
  // inject value
  private readonly settingsService: SettingsService = inject(SettingsService);
  private readonly favIconService: FaviconService = inject(FaviconService);

  private static readonly ROOT_CACHE_KEY = "gbk_root_bookmarks_cache";
  private static readonly DOCK_CACHE_KEY = "gbk_dock_bookmarks_cache";
  private static readonly THUMBNAIL_MAX_DIMENSION = 48;
  private static readonly INLINE_ICON_MAX_CHARS = 2048;
  private static readonly CACHE_MAX_CHARS = 1_500_000;

  private readonly thumbnailCache = new Map<string, string>();

  private static hydrateCachedBookmark(node: Bookmark): void {
    const stack = [node];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (!current.favIconUrl) {
        current.favIconUrl =
          current.type === "bookmarkFolder"
            ? "/assets/icons/folder-icon.svg"
            : "/assets/icons/default-icon.svg";
      }
      if (current.children && current.children.length > 0) {
        stack.push(...current.children);
      }
    }
  }

  private static readCachedBookmark(key: string): Bookmark | null {
    try {
      if (typeof localStorage !== "undefined") {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Bookmark;
        BookmarkService.hydrateCachedBookmark(parsed);
        return parsed;
      }
    } catch {
      // Ignore cache parsing errors
    }
    return null;
  }

  private static createThumbnailDataUrl(
    dataUrl: string,
  ): Promise<string | undefined> {
    if (typeof document === "undefined" || typeof Image === "undefined") {
      return Promise.resolve(undefined);
    }

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = BookmarkService.THUMBNAIL_MAX_DIMENSION;
          const width = img.naturalWidth || img.width || maxDim;
          const height = img.naturalHeight || img.height || maxDim;
          const scale = Math.min(maxDim / width, maxDim / height, 1);
          const targetW = Math.max(1, Math.round(width * scale));
          const targetH = Math.max(1, Math.round(height * scale));

          const canvas = document.createElement("canvas");
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(undefined);
            return;
          }

          ctx.drawImage(img, 0, 0, targetW, targetH);
          const webp = canvas.toDataURL("image/webp", 0.75);
          if (
            webp.startsWith("data:image/webp") &&
            webp.length < dataUrl.length
          ) {
            resolve(webp);
            return;
          }
          resolve(undefined);
        } catch {
          resolve(undefined);
        }
      };
      img.onerror = () => resolve(undefined);
      img.src = dataUrl;
    });
  }

  private collectLargeDataUrls(root: Bookmark): string[] {
    const urls = new Set<string>();
    const stack = [root];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (
        node.favIconUrl &&
        node.favIconUrl.startsWith("data:") &&
        node.favIconUrl.length > BookmarkService.INLINE_ICON_MAX_CHARS &&
        !this.thumbnailCache.has(node.favIconUrl)
      ) {
        urls.add(node.favIconUrl);
      }
      if (node.children && node.children.length > 0) {
        stack.push(...node.children);
      }
    }
    return Array.from(urls);
  }

  private async writeCachedBookmark(
    key: string,
    root: Bookmark,
  ): Promise<void> {
    if (typeof localStorage === "undefined") {
      return;
    }

    // Generate 48x48 WebP thumbnails for oversized base64 icons so first-paint
    // shows real site icons without hitting the 5MB localStorage quota.
    const pendingUrls = this.collectLargeDataUrls(root);
    if (pendingUrls.length > 0) {
      await Promise.all(
        pendingUrls.map(async (url) => {
          const thumb = await BookmarkService.createThumbnailDataUrl(url);
          if (thumb) {
            this.thumbnailCache.set(url, thumb);
          }
        }),
      );
    }

    const serializeWithThumbnails = (stripAllDataUrls: boolean): string =>
      JSON.stringify(root, (prop, value) => {
        if (
          prop === "favIconUrl" &&
          typeof value === "string" &&
          value.startsWith("data:")
        ) {
          if (stripAllDataUrls) {
            return undefined;
          }
          if (value.length <= BookmarkService.INLINE_ICON_MAX_CHARS) {
            return value;
          }
          return this.thumbnailCache.get(value);
        }
        return value;
      });

    try {
      let serialized = serializeWithThumbnails(false);
      if (serialized.length > BookmarkService.CACHE_MAX_CHARS) {
        serialized = serializeWithThumbnails(true);
      }
      localStorage.setItem(key, serialized);
    } catch {
      // Fallback: strip data: URIs if localStorage quota is still tight
      try {
        localStorage.setItem(key, serializeWithThumbnails(true));
      } catch {
        // Ignore cache storage errors
      }
    }
  }

  private readonly bookmarksSource = new BehaviorSubject<Bookmark | null>(
    BookmarkService.readCachedBookmark(BookmarkService.ROOT_CACHE_KEY),
  );
  public readonly bookmarks$ = this.bookmarksSource.asObservable();
  private rootFolderId: string = "";

  private readonly dockBookmarksSource = new BehaviorSubject<Bookmark | null>(
    BookmarkService.readCachedBookmark(BookmarkService.DOCK_CACHE_KEY),
  );
  public readonly dockBookmarks$ = this.dockBookmarksSource.asObservable();
  private dockFolderId: string = "";
  private dockEnabled: boolean = true;

  constructor() {
    this.settingsService.onSettingsChange().subscribe(async (settings) => {
      let shouldReloadRoot = false;
      let shouldReloadDock = false;

      if (
        settings?.bookmarkRootFolderId &&
        settings.bookmarkRootFolderId !== this.rootFolderId
      ) {
        this.rootFolderId = settings.bookmarkRootFolderId;
        shouldReloadRoot = true;
      }
      if (
        (settings?.dockFolderId !== undefined &&
          settings.dockFolderId !== this.dockFolderId) ||
        (settings?.dockEnabled !== undefined &&
          settings.dockEnabled !== this.dockEnabled)
      ) {
        this.dockFolderId = settings?.dockFolderId || "";
        this.dockEnabled = settings?.dockEnabled ?? true;
        shouldReloadDock = true;
      }

      if (shouldReloadRoot) {
        await this.reloadBookmarks();
      }
      if (shouldReloadDock) {
        await this.reloadDockBookmarks();
      }
    });

    const persistRootWithDebounce = this.debounce(() => {
      const latest = this.bookmarksSource.value;
      if (latest) {
        void this.writeCachedBookmark(BookmarkService.ROOT_CACHE_KEY, latest);
      }
    }, 500);

    const persistDockWithDebounce = this.debounce(() => {
      const latestDock = this.dockBookmarksSource.value;
      if (latestDock) {
        void this.writeCachedBookmark(
          BookmarkService.DOCK_CACHE_KEY,
          latestDock,
        );
      }
    }, 500);

    this.favIconService.faviconLoaded$.subscribe(({ id, url }) => {
      const current = this.bookmarksSource.value;
      if (current && this.updateFaviconDeep(current, id, url)) {
        // Emit a new root reference so signal/OnPush consumers are notified
        this.bookmarksSource.next({ ...current });
        persistRootWithDebounce();
      }
      const currentDock = this.dockBookmarksSource.value;
      if (currentDock && this.updateFaviconDeep(currentDock, id, url)) {
        this.dockBookmarksSource.next({ ...currentDock });
        persistDockWithDebounce();
      }
    });

    // Listen to Chrome bookmark change events directly
    this.setupBookmarkListeners();
  }

  private setupBookmarkListeners() {
    const reloadWithDebounce = this.debounce(() => {
      console.log("Bookmark changed, reloading...");
      this.reloadBookmarks();
      this.reloadDockBookmarks();
    }, 100);

    // Listen to all bookmark change events
    chrome.bookmarks.onCreated.addListener(() => reloadWithDebounce());
    chrome.bookmarks.onRemoved.addListener(() => reloadWithDebounce());
    chrome.bookmarks.onChanged.addListener(() => reloadWithDebounce());
    chrome.bookmarks.onMoved.addListener(() => reloadWithDebounce());
    chrome.bookmarks.onChildrenReordered?.addListener(() =>
      reloadWithDebounce(),
    );
  }

  private debounce<T extends (...args: unknown[]) => void>(
    fn: T,
    delay: number,
  ): T {
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
    fetchFavicons: boolean = true,
  ): Promise<Bookmark[]> {
    const bookmarks: Bookmark[] = [];

    for (const node of bookmarkTreeNodes) {
      const bookmark: Bookmark = {
        id: node.id,
        parentId: node.parentId,
        index: node.index,
        title: node.title,
        dateAdded: node.dateAdded,
        type: node.url ? "bookmark" : "bookmarkFolder",
        url: node.url,
        favIconUrl: node.url
          ? "/assets/icons/default-icon.svg"
          : "/assets/icons/folder-icon.svg",
      };

      if (node.children) {
        bookmark.children = await this.iterateBookmarkNodesAsync(
          node.children,
          fetchFavicons,
        );
        bookmark.dateGroupModified = node.dateGroupModified;
      } else {
        // Try to get cached favicon first (synchronous, no flickering)
        const cachedFavicon = this.favIconService.getCachedFavicon(bookmark);
        if (cachedFavicon) {
          bookmark.favIconUrl = cachedFavicon;
        }
        if (fetchFavicons) {
          // Load favicon asynchronously without blocking bookmark loading;
          // cached low-res icons are upgraded in the background
          this.favIconService.loadBookmarkFavIconUrl(bookmark).catch(() => {});
        }
      }
      bookmarks.push(bookmark);
    }
    return bookmarks;
  }

  private updateFaviconDeep(
    root: Bookmark,
    targetId: string,
    url: string,
  ): boolean {
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

  public getFoldersFromNode(
    node: Bookmark,
    depth = 0,
    includeSelf = true,
  ): Bookmark[] {
    let result: Bookmark[] = [];
    if (!node) return result;

    if (node.type === "bookmarkFolder") {
      if (includeSelf) {
        result.push({
          id: node.id,
          title: node.title || "Root",
          type: "bookmarkFolder",
          depth,
        });
      }
      if (node.children) {
        const nextDepth = includeSelf ? depth + 1 : depth;
        for (const child of node.children) {
          if (child.type === "bookmarkFolder") {
            result = result.concat(
              this.getFoldersFromNode(child, nextDepth, true),
            );
          }
        }
      }
    }
    return result;
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
            title: bc.title || "Root",
            type: "bookmarkFolder",
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

  public async getFullBookmarkTree(): Promise<Bookmark> {
    if (!this.faviconInitialized) {
      await this.favIconService.initService();
      this.faviconInitialized = true;
    }
    const fullTreeNodes = await chrome.bookmarks.getTree();
    const bookmarks = await this.iterateBookmarkNodesAsync(
      fullTreeNodes || [],
      false,
    );
    return bookmarks[0] || ({} as Bookmark);
  }

  private faviconInitialized = false;

  public async reloadBookmarks() {
    // Initialize FaviconService only on first load
    if (!this.faviconInitialized) {
      await this.favIconService.initService();
      this.faviconInitialized = true;
    }
    const bookmarkTreeNodes = await chrome.bookmarks.getSubTree(
      this.rootFolderId,
    );
    const bookmarks = await this.iterateBookmarkNodesAsync(bookmarkTreeNodes);
    const root = bookmarks[0] || null;
    if (root) {
      void this.writeCachedBookmark(BookmarkService.ROOT_CACHE_KEY, root);
    }
    this.bookmarksSource.next(root);
  }

  public async reloadDockBookmarks() {
    if (!this.dockEnabled) {
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.removeItem(BookmarkService.DOCK_CACHE_KEY);
        }
      } catch {
        // Ignore storage errors
      }
      this.dockBookmarksSource.next(null);
      return;
    }

    if (!this.faviconInitialized) {
      await this.favIconService.initService();
      this.faviconInitialized = true;
    }

    let targetFolderId = this.dockFolderId;

    // If no dockFolderId is configured, try to auto-detect a folder named "Dock" (case-insensitive)
    if (!targetFolderId) {
      const allFolders = await this.getAllBookmarkFolders();
      const dockCandidate = allFolders.find(
        (f) => f.title?.trim().toLowerCase() === "dock",
      );
      if (dockCandidate) {
        targetFolderId = dockCandidate.id;
      }
    }

    if (!targetFolderId) {
      this.dockBookmarksSource.next(null);
      return;
    }

    try {
      const bookmarkTreeNodes =
        await chrome.bookmarks.getSubTree(targetFolderId);
      const bookmarks = await this.iterateBookmarkNodesAsync(bookmarkTreeNodes);
      const dock = bookmarks[0] || null;
      if (dock) {
        void this.writeCachedBookmark(BookmarkService.DOCK_CACHE_KEY, dock);
      }
      this.dockBookmarksSource.next(dock);
    } catch {
      this.dockBookmarksSource.next(null);
    }
  }

  public async create(
    bookmark: Bookmark,
    reload = true,
  ): Promise<chrome.bookmarks.BookmarkTreeNode> {
    const created = await chrome.bookmarks.create({
      title: bookmark.title,
      url: bookmark.url,
      parentId: bookmark.parentId,
    });
    if (reload) {
      await this.reloadBookmarks();
      await this.reloadDockBookmarks();
    }
    return created;
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
      await this.reloadDockBookmarks();
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
      await this.reloadDockBookmarks();
    }
  }

  public async delete(bookmark: Bookmark, reload = true): Promise<void> {
    if (!bookmark) {
      return;
    }
    if (bookmark.type === "bookmarkFolder") {
      await chrome.bookmarks.removeTree(bookmark.id);
    } else {
      await chrome.bookmarks.remove(bookmark.id);
    }
    if (reload) {
      await this.reloadBookmarks();
      await this.reloadDockBookmarks();
    }
  }
}
