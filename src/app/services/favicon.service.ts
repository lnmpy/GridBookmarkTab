import { Injectable } from '@angular/core';

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
export class FavIconService {
  private static readonly storageKey = 'customIconSettings';
  private customeIconSettings: Map<string, string> = new Map();

  constructor() {}

  public async initService(): Promise<void> {
    this.customeIconSettings = await new Promise<Map<string, string>>(
      (resolve, reject) => {
        chrome.storage.local.get(FavIconService.storageKey, (result) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          if (result[FavIconService.storageKey]) {
            resolve(JSON.parse(result[FavIconService.storageKey]));
          } else {
            resolve(new Map());
          }
        });
      },
    );
  }

  public async loadBookmarkFavIconUrl(
    bookmark: Bookmark,
  ): Promise<string | undefined> {
    if (bookmark == null || bookmark.id == null) {
      return;
    }
    if (bookmark.type == 'bookmarkFolder') {
      return;
    } else if (bookmark.type == 'bookmark') {
      if (this.customeIconSettings.has(bookmark.id)) {
        return this.customeIconSettings.get(bookmark.id);
      }
      if (bookmark.url != null) {
        const domain = new URL(bookmark.url).origin;
        return await this.loadBookmarkFaviconWithDomain(domain);
      }
    }
    return;
  }

  private async loadBookmarkFaviconWithDomain(
    domain: string,
  ): Promise<string | undefined> {
    const parts = domain.split('.');
    for (let i = 0; i <= parts.length - 2; i++) {
      const trialDomain = parts.slice(i).join('.');

      const faviconCacheKey = `gbktab-favicon-v5-${domain}`;
      const storageResult = await chrome.storage.local.get(faviconCacheKey);
      if (chrome.runtime.lastError) {
        return;
      }
      const faviconCacheUrl = storageResult[faviconCacheKey];
      if (faviconCacheUrl) {
        return faviconCacheUrl;
      }

      const url = `https://www.google.com/s2/favicons?sz=96&domain=${trialDomain}`;
      const isValid = await this.testFavicon(url, 32);
      if (isValid) {
        chrome.storage.local.set({
          [faviconCacheKey]: url,
        });
        return url;
      }
    }
    return;
  }

  private async testFavicon(url: string, iconSize: number): Promise<boolean> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = function () {
        if (img.width >= iconSize && img.naturalWidth >= iconSize) {
          console.log('favicon all success', url);
          resolve(true);
        } else {
          console.log('favicon not valid', url);
          resolve(false);
        }
      };
      img.onerror = function () {
        resolve(false);
      };
      img.src = url;
    });
  }
}
