import { Injectable } from '@angular/core';
import { Bookmark } from '@app/services/types';

@Injectable({
  providedIn: 'root',
})
export class FaviconService {
  private static readonly storageKey = 'customIconSettings';
  private customeIconSettings: Map<string, string> = new Map();

  private domainIconCache = new Map<string, Promise<Response>>();
  // Memory cache to store loaded favicons for quick access (avoid flickering on reload)
  private faviconMemoryCache = new Map<string, string>();

  public async initService() {
    const result = await chrome.storage.local.get(FaviconService.storageKey);
    if (chrome.runtime.lastError) {
      throw chrome.runtime.lastError;
    }
    if (!result[FaviconService.storageKey]) {
      return;
    }

    // Parse JSON string to object, then convert to Map
    const settingsObject = JSON.parse(result[FaviconService.storageKey]);
    this.customeIconSettings = new Map(Object.entries(settingsObject));
  }

  // Synchronously get cached favicon (for immediate display without flickering)
  public getCachedFavicon(bookmark: Bookmark): string | undefined {
    if (bookmark == null || bookmark.id == null) {
      return undefined;
    }
    // Check custom icon first
    if (this.customeIconSettings.has(bookmark.id)) {
      return this.customeIconSettings.get(bookmark.id);
    }
    // Check memory cache for domain favicon
    if (bookmark.url && bookmark.url.startsWith('http')) {
      try {
        const cacheKey = new URL(bookmark.url).host;
        if (this.faviconMemoryCache.has(cacheKey)) {
          return this.faviconMemoryCache.get(cacheKey);
        }
      } catch {
        // Invalid URL, ignore
      }
    }
    return undefined;
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
        // Check memory cache first to avoid flickering on reload
        const cacheKey = new URL(bookmark.url).host;
        if (this.faviconMemoryCache.has(cacheKey)) {
          bookmark.favIconUrl = this.faviconMemoryCache.get(cacheKey)!;
          return;
        }
        let favIconUrl = await this.loadBookmarkFaviconWithDomain(bookmark.url);
        if (favIconUrl) {
          bookmark.favIconUrl = favIconUrl;
          this.faviconMemoryCache.set(cacheKey, favIconUrl);
          return;
        }
        favIconUrl = await this.loadBookmarkFaviconWithUrl(bookmark.url);
        if (favIconUrl) {
          bookmark.favIconUrl = favIconUrl;
          this.faviconMemoryCache.set(cacheKey, favIconUrl);
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
      const faviconCacheKey = `favicon:domain:${trialDomain}`;
      const storageResult = await chrome.storage.local.get(faviconCacheKey);
      if (chrome.runtime.lastError) {
        throw chrome.runtime.lastError;
      }
      const faviconCache = storageResult[faviconCacheKey];
      if (faviconCache) {
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
          },
        });
        return base64Url;
      } else {
        chrome.storage.local.set({
          [faviconCacheKey]: {
            base64Url: '',
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
    const faviconCacheKey = `favicon:url:${domain}`;
    const storageResult = await chrome.storage.local.get(faviconCacheKey);
    if (chrome.runtime.lastError) {
      throw chrome.runtime.lastError;
    }
    const faviconCache = storageResult[faviconCacheKey];
    if (faviconCache) {
      return faviconCache.base64Url;
    }

    const response = await fetch(url, { credentials: 'include' });
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const iconLink = doc
      .querySelector("link[rel*='icon']")
      ?.getAttribute('href');

    if (!iconLink) {
      chrome.storage.local.set({
        [faviconCacheKey]: {
          base64Url: '',
        },
      });
      return;
    }
    let faviconUrl = '';
    if (iconLink?.startsWith('http')) {
      faviconUrl = iconLink;
    } else {
      faviconUrl = new URL(iconLink, new URL(url)).toString();
    }
    const base64Url = await this.urlToBase64(faviconUrl);
    if (base64Url) {
      chrome.storage.local.set({
        [faviconCacheKey]: {
          base64Url,
        },
      });
      return base64Url;
    }
    chrome.storage.local.set({
      [faviconCacheKey]: {
        base64Url: faviconUrl,
      },
    });
    return faviconUrl;
  }

  private async urlToBase64(url: string): Promise<string | null> {
    try {
      const response = await fetch(url, { mode: 'cors' });
      const blob = await response.blob();
      const result = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
      });
      return result as string;
    } catch (error) {
      console.error('Error:', error);
      return null;
    }
  }

  // Make urlToBase64 public for modal component
  public async urlToBase64Public(url: string): Promise<string | null> {
    return this.urlToBase64(url);
  }

  // Save custom icon to storage and update in-memory map
  public async saveCustomIcon(
    bookmarkId: string,
    base64Url: string,
  ): Promise<void> {
    this.customeIconSettings.set(bookmarkId, base64Url);

    // Save to Chrome storage
    const settingsObject = Object.fromEntries(this.customeIconSettings);
    await chrome.storage.local.set({
      [FaviconService.storageKey]: JSON.stringify(settingsObject),
    });

    if (chrome.runtime.lastError) {
      throw chrome.runtime.lastError;
    }
  }

  // Remove custom icon
  public async removeCustomIcon(bookmarkId: string): Promise<void> {
    this.customeIconSettings.delete(bookmarkId);

    const settingsObject = Object.fromEntries(this.customeIconSettings);
    await chrome.storage.local.set({
      [FaviconService.storageKey]: JSON.stringify(settingsObject),
    });
  }
}
