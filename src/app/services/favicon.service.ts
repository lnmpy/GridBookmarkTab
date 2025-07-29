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

  private domainIconCache = new Map<string, Promise<Response>>();

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
      if (this.customeIconSettings.has(bookmark.id)) {
        bookmark.favIconUrl = this.customeIconSettings.get(bookmark.id);
      }
    } else if (bookmark.type == 'bookmark') {
      if (this.customeIconSettings.has(bookmark.id)) {
        bookmark.favIconUrl = this.customeIconSettings.get(bookmark.id);
      } else if (bookmark.url != null && bookmark.url.startsWith('http')) {
        let favIconUrl = await this.loadBookmarkFaviconWithDomain(bookmark.url);
        if (favIconUrl) {
          bookmark.favIconUrl = favIconUrl;
          return;
        }
        favIconUrl = await this.loadBookmarkFaviconWithUrl(bookmark.url);
        if (favIconUrl) {
          bookmark.favIconUrl = favIconUrl;
          return;
        }
      }
    }
  }

  private async loadBookmarkFaviconWithDomain(
    url: string,
  ): Promise<string | undefined> {
    const domain = new URL(url).host;
    const parts = domain.split('.');
    for (let i = 0; i <= parts.length - 2; i++) {
      const trialDomain = parts.slice(i).join('.');
      const faviconCacheKey = `gbktab-favicon-domain-v1-${trialDomain}`;
      const storageResult = await chrome.storage.local.get(faviconCacheKey);
      if (chrome.runtime.lastError) {
        return;
      }
      const faviconCache = storageResult[faviconCacheKey];
      if (faviconCache && faviconCache.expiresAt > Date.now()) {
        return faviconCache.base64Url;
      }

      let resp: Promise<Response>;
      if (this.domainIconCache.has(trialDomain)) {
        resp = this.domainIconCache.get(trialDomain)!;
      } else {
        resp = fetch(
          `https://api.lnmpy.com/google_base64_favicon?domain=${trialDomain}`,
        );
        this.domainIconCache.set(trialDomain, resp);
      }
      const base64Url = await (await resp).text();
      if (base64Url.startsWith('data:image/')) {
        chrome.storage.local.set({
          [faviconCacheKey]: {
            base64Url,
            expiresAt: Date.now() + 86400000 * 360,
          },
        });
        return base64Url;
      } else {
        chrome.storage.local.set({
          [faviconCacheKey]: {
            base64Url: '',
            expiresAt: Date.now() + 86400000 * 7,
          },
        });
      }
    }
    return;
  }

  private async loadBookmarkFaviconWithUrl(
    url: string,
  ): Promise<string | undefined> {
    const domain = new URL(url).host;
    const faviconCacheKey = `gbktab-favicon-url-v1-${domain}`;
    const storageResult = await chrome.storage.local.get(faviconCacheKey);
    if (chrome.runtime.lastError) {
      return;
    }
    const faviconCache = storageResult[faviconCacheKey];
    if (faviconCache && faviconCache.expiresAt > Date.now()) {
      return faviconCache.base64Url;
    }

    const response = await fetch(url, { credentials: 'include' });
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const iconLink = doc
      .querySelector("link[rel*='icon']")
      ?.getAttribute('href');

    let faviconUrl = '';
    if (!iconLink) {
      chrome.storage.local.set({
        [faviconCacheKey]: {
          base64Url: '',
          expiresAt: Date.now() + 86400000 * 7,
        },
      });
      return;
    } else if (iconLink?.startsWith('http')) {
      faviconUrl = iconLink;
    } else {
      faviconUrl = new URL(iconLink, new URL(url)).toString();
    }
    chrome.storage.local.set({
      [faviconCacheKey]: {
        base64Url: faviconUrl,
        expiresAt: Date.now() + 86400000 * 360,
      },
    });
    return faviconUrl;
  }
}
