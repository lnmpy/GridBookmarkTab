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

  public async loadBookmarkFavIconUrl(bookmark: Bookmark) {
    if (bookmark == null || bookmark.id == null) {
      return;
    }
    if (bookmark.type == 'bookmarkFolder') {
    } else if (bookmark.type == 'bookmark') {
      if (this.customeIconSettings.has(bookmark.id)) {
        bookmark.favIconUrl = this.customeIconSettings.get(bookmark.id);
      } else if (bookmark.url != null) {
        const domain = new URL(bookmark.url).origin;
        const favIconUrl = await this.loadBookmarkFaviconWithDomain(domain);
        if (favIconUrl) {
          bookmark.favIconUrl = favIconUrl;
        }
      }
    }
  }

  private async loadBookmarkFaviconWithDomain(
    domain: string,
  ): Promise<string | undefined> {
    const parts = domain.split('.');
    for (let i = 0; i <= parts.length - 2; i++) {
      const trialDomain = parts.slice(i).join('.');

      const faviconCacheKey = `gbktab-favicon-v9-${domain}`;
      const storageResult = await chrome.storage.local.get(faviconCacheKey);
      if (chrome.runtime.lastError) {
        return;
      }
      const faviconCacheUrl = storageResult[faviconCacheKey];
      if (faviconCacheUrl) {
        return faviconCacheUrl;
      }

      const resp = await fetch(
        `https://api.lnmpy.com/google_base64_favicon?domain=${trialDomain}`,
      );
      const base64Url = await resp.text();
      if (base64Url.startsWith('data:image/')) {
        console.debug('base64Url', base64Url, 'trialDomain', trialDomain);
        chrome.storage.local.set({
          [faviconCacheKey]: base64Url,
        });
        return base64Url;
      }
    }
    return;
  }
}
