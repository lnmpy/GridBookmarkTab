import { Injectable } from '@angular/core';
import { Bookmark } from '@app/services/types';

@Injectable({
  providedIn: 'root',
})
export class FaviconService {
  private static readonly storageKey = 'customIconSettings';
  private customeIconSettings: Map<string, string> = new Map();

  private domainIconCache = new Map<string, Promise<Response>>();

  public async initService() {
    const result = await chrome.storage.local.get(FaviconService.storageKey);
    if (chrome.runtime.lastError) {
      throw chrome.runtime.lastError;
    }
    if (!result[FaviconService.storageKey]) {
      return;
    }
    this.customeIconSettings = JSON.parse(result[FaviconService.storageKey]);
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
        throw chrome.runtime.lastError;
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
      throw chrome.runtime.lastError;
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

    if (!iconLink) {
      chrome.storage.local.set({
        [faviconCacheKey]: {
          base64Url: '',
          expiresAt: Date.now() + 86400000 * 7,
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
    console.log('faviconUrl', faviconUrl);
    console.log('base64Url', base64Url);
    if (base64Url) {
      chrome.storage.local.set({
        [faviconCacheKey]: {
          base64Url,
          expiresAt: Date.now() + 86400000 * 360,
        },
      });
      return base64Url;
    }
    chrome.storage.local.set({
      [faviconCacheKey]: {
        base64Url: faviconUrl,
        expiresAt: Date.now() + 86400000 * 360,
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
}
