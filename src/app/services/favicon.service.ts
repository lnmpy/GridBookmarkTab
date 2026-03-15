import { Injectable } from '@angular/core';
import { Bookmark } from '@app/services/types';

interface FaviconCache {
  base64Url: string;
  // Timestamp when request failed, used to determine if expired (10 minutes)
  failedAt?: number;
}

@Injectable({
  providedIn: 'root',
})
export class FaviconService {
  private static readonly storageKey = 'customIconSettings';
  // Failed cache TTL: 10 minutes
  private static readonly FAILED_CACHE_TTL = 10 * 60 * 1000;

  private customeIconSettings: Map<string, string> = new Map();

  // Memory cache to store loaded favicons for quick access (avoid flickering on reload)
  private faviconMemoryCache = new Map<string, string>();

  // Chrome's default globe favicon base64 - used to filter out "not found" results
  private chromeDefaultFaviconBase64: string | null = null;

  // Concurrency control for favicon fetching
  private static readonly MAX_CONCURRENT_FETCHES = 3;
  private static readonly FETCH_DELAY_MS = 50;
  private static readonly MIN_ICON_SIZE = 512;
  private activeExternalFetches = 0;
  private externalFetchQueue: (() => void)[] = [];

  public async initService() {
    // Pre-fetch Chrome's default favicon so we can filter it out later.
    await this.loadChromeDefaultFavicon();

    const allStorage = await chrome.storage.local.get(null);
    if (chrome.runtime.lastError) {
      throw chrome.runtime.lastError;
    }

    if (allStorage[FaviconService.storageKey]) {
      // Parse JSON string to object, then convert to Map
      const settingsObject = JSON.parse(allStorage[FaviconService.storageKey] as string);
      this.customeIconSettings = new Map(Object.entries(settingsObject));
    }

    const keysToRemove: string[] = [];
    for (const [key, value] of Object.entries(allStorage)) {
      if (!key.startsWith('favicon:')) continue;
      
      const cache = value as FaviconCache;
      if (cache.base64Url) {
        if (this.chromeDefaultFaviconBase64 && cache.base64Url === this.chromeDefaultFaviconBase64) {
          keysToRemove.push(key);
        } else {
          const domain = key.substring('favicon:'.length);
          this.faviconMemoryCache.set(domain, cache.base64Url);
        }
      }
    }

    if (keysToRemove.length > 0) {
      try {
        await chrome.storage.local.remove(keysToRemove);
        console.log(`Cleaned up ${keysToRemove.length} cached Chrome default favicons`);
      } catch (e) {
        console.debug('Failed to cleanup default favicons:', e);
      }
    }
  }

  /**
   * Fetch Chrome's default favicon (the globe icon returned for unknown pages)
   * so we can compare and reject it in fetchFromChromeFaviconApi.
   */
  private async loadChromeDefaultFavicon() {
    try {
      const faviconUrl = new URL(chrome.runtime.getURL('/_favicon/'));
      faviconUrl.searchParams.set('pageUrl', 'chrome://version/');
      faviconUrl.searchParams.set('size', '128');
      const response = await fetch(faviconUrl.toString());
      if (response.ok) {
        const blob = await response.blob();
        const base64 = await this.blobToBase64(blob);
        if (base64) {
          this.chromeDefaultFaviconBase64 = base64;
        }
      }
    } catch (e) {
      console.debug('Failed to load Chrome default favicon:', e);
    }
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

  /**
   * Load bookmark favicon URL
   * Priority order:
   * 1. Custom icon
   * 2. Memory cache
   * 3. Local cache (chrome.storage.local)
   * 4. Website icon (direct fetch /favicon.ico, etc.)
   * 5. api.lnmpy.com API
   * 6. Chrome runtime _favicon API
   *
   * Cache strategy:
   * - Success: Save permanently
   * - Failure: Cache for 10 minutes
   */
  public async loadBookmarkFavIconUrl(bookmark: Bookmark) {
    if (bookmark == null || bookmark.id == null) {
      return;
    }
    if (bookmark.type == 'bookmarkFolder') {
      if (this.customeIconSettings.has(bookmark.id)) {
        bookmark.favIconUrl = this.customeIconSettings.get(bookmark.id);
      }
      return;
    }

    if (bookmark.type != 'bookmark') {
      return;
    }

    // 1. Check local settings (custom icon)
    if (this.customeIconSettings.has(bookmark.id)) {
      bookmark.favIconUrl = this.customeIconSettings.get(bookmark.id);
      return;
    }

    const url = bookmark.url;
    if (url == null || !url.startsWith('http')) {
      return;
    }

    const domain = new URL(url).host;

    // 2. Check memory cache (fast return, avoid flickering)
    if (this.faviconMemoryCache.has(domain)) {
      bookmark.favIconUrl = this.faviconMemoryCache.get(domain)!;
      return;
    }

    // 3. Check local storage cache
    const cachedResult = await this.getFromLocalCache(domain);
    if (cachedResult.found && cachedResult.favicon) {
      bookmark.favIconUrl = cachedResult.favicon;
      this.faviconMemoryCache.set(domain, cachedResult.favicon);
      return;
    }

    // If cache is marked as failed and not expired, skip subsequent requests
    if (cachedResult.failedAndNotExpired) {
      return;
    }

    // 4. Try fetching directly from website
    let favicon = await this.enqueueExternalFetch(() =>
      this.fetchFromWebsite(domain),
    );
    if (favicon) {
      bookmark.favIconUrl = favicon;
      this.faviconMemoryCache.set(domain, favicon);
      await this.saveToLocalCache(domain, favicon, false);
      return;
    }

    // 5. Try fetching via api.lnmpy.com API, higher quality images
    favicon = await this.enqueueExternalFetch(() =>
      this.fetchFromLnmpyApi(domain),
    );
    if (favicon) {
      bookmark.favIconUrl = favicon;
      this.faviconMemoryCache.set(domain, favicon);
      await this.saveToLocalCache(domain, favicon, false);
      return;
    }

    // 6. Try Chrome runtime _favicon API
    favicon = await this.enqueueExternalFetch(() =>
      this.fetchFromChromeFaviconApi(url),
    );
    if (favicon) {
      bookmark.favIconUrl = favicon;
      this.faviconMemoryCache.set(domain, favicon);
      await this.saveToLocalCache(domain, favicon, false);
      return;
    }

    // All methods failed, mark as failed (expires after 10 minutes)
    await this.saveToLocalCache(domain, '', true);
  }

  /**
   * Enqueue an external fetch task with concurrency limit and QPS throttling
   */
  private async enqueueExternalFetch<T>(task: () => Promise<T>): Promise<T> {
    if (this.activeExternalFetches >= FaviconService.MAX_CONCURRENT_FETCHES) {
      await new Promise<void>((resolve) =>
        this.externalFetchQueue.push(resolve),
      );
    }

    this.activeExternalFetches++;
    try {
      return await task();
    } finally {
      this.activeExternalFetches--;
      if (this.externalFetchQueue.length > 0) {
        const next = this.externalFetchQueue.shift();
        if (next) {
          // Add a small delay to stagger requests and reduce spike
          setTimeout(() => next(), FaviconService.FETCH_DELAY_MS);
        }
      }
    }
  }

  // ==================== Cache-related methods ====================

  /**
   * Get favicon from local storage cache
   * Return values:
   * - found: Whether a valid favicon was found
   * - favicon: The base64 URL of the favicon
   * - failedAndNotExpired: Whether marked as failed and not expired
   */
  private async getFromLocalCache(domain: string): Promise<{
    found: boolean;
    favicon?: string;
    failedAndNotExpired: boolean;
  }> {
    const cacheKey = `favicon:${domain}`;
    try {
      const result = await chrome.storage.local.get(cacheKey);
      if (chrome.runtime.lastError) {
        console.warn('Failed to get from cache:', chrome.runtime.lastError);
        return { found: false, failedAndNotExpired: false };
      }

      const cache: FaviconCache | undefined = result[cacheKey] as FaviconCache | undefined;
      if (!cache) {
        return { found: false, failedAndNotExpired: false };
      }

      // If there's a valid favicon
      if (cache.base64Url) {
        return {
          found: true,
          favicon: cache.base64Url,
          failedAndNotExpired: false,
        };
      }

      // If marked as failed, check if expired
      if (cache.failedAt) {
        const now = Date.now();
        const isExpired =
          now - cache.failedAt > FaviconService.FAILED_CACHE_TTL;
        if (!isExpired) {
          // Failed and not expired, skip subsequent requests
          return { found: false, failedAndNotExpired: true };
        }
        // Failed and expired, need to retry
        return { found: false, failedAndNotExpired: false };
      }

      return { found: false, failedAndNotExpired: false };
    } catch (error) {
      console.warn('Failed to get from cache:', error);
      return { found: false, failedAndNotExpired: false };
    }
  }

  /**
   * Save favicon to local storage cache
   * @param domain Domain name
   * @param base64Url Base64 URL of favicon, empty string on failure
   * @param failed Whether the request failed
   */
  private async saveToLocalCache(
    domain: string,
    base64Url: string,
    failed: boolean,
  ): Promise<void> {
    const cacheKey = `favicon:${domain}`;
    try {
      const cacheData: FaviconCache = {
        base64Url,
      };
      if (failed) {
        cacheData.failedAt = Date.now();
      }
      await chrome.storage.local.set({
        [cacheKey]: cacheData,
      });
    } catch (error) {
      console.warn('Failed to save to cache:', error);
    }
  }

  // ==================== Favicon fetching methods ====================

  /**
   * Method 1: Fetch via api.lnmpy.com API
   */
  private async fetchFromLnmpyApi(domain: string): Promise<string | undefined> {
    // Try starting from full domain, progressively trying parent domains
    const parts = domain.split('.');
    for (let i = 0; i <= parts.length - 2; i++) {
      const trialDomain = parts.slice(i).join('.');
      try {
        const response = await fetch(
          `https://api.lnmpy.com/google_base64_favicon?domain=${trialDomain}`,
        );
        const base64Url = await response.text();
        if (base64Url.startsWith('data:image/')) {
          return base64Url;
        }
      } catch (error) {
        console.debug(`API fetch failed for ${trialDomain}:`, error);
      }
    }
    return undefined;
  }

  /**
   * Method 2: Fetch using Chrome's built-in _favicon API
   * Reference: https://developer.chrome.com/docs/extensions/how-to/ui/favicons
   */
  private async fetchFromChromeFaviconApi(
    pageUrl: string,
  ): Promise<string | undefined> {
    try {
      const faviconUrl = new URL(chrome.runtime.getURL('/_favicon/'));
      faviconUrl.searchParams.set('pageUrl', pageUrl);
      faviconUrl.searchParams.set('size', '128');

      // Try fetching this URL and convert to base64
      const response = await fetch(faviconUrl.toString());
      if (!response.ok) {
        return undefined;
      }

      const blob = await response.blob();
      // Check if it's a valid image (Chrome may return blank image)
      if (blob.size < 100) {
        // Too small images might be placeholders
        return undefined;
      }

      const base64Url = await this.blobToBase64(blob);
      if (base64Url && base64Url.startsWith('data:image/')) {
        // Filter out Chrome's default globe icon (indicates no real favicon found)
        if (this.chromeDefaultFaviconBase64 && base64Url === this.chromeDefaultFaviconBase64) {
          return undefined;
        }
        return base64Url;
      }
    } catch (error) {
      console.debug('Chrome favicon API failed:', error);
    }
    return undefined;
  }

  /**
   * Method 3: Fetch favicon directly from website
   * Try in priority order: common favicon paths
   */
  private async fetchFromWebsite(domain: string): Promise<string | undefined> {
    const protocol = 'https://';
    const faviconPaths = [
      '/favicon.ico',
      '/favicon.png',
      '/favicon.svg',
      '/icon.png',
      '/logo.png',
    ];

    for (const path of faviconPaths) {
      const faviconUrl = `${protocol}${domain}${path}`;
      try {
        const response = await fetch(faviconUrl, {
          mode: 'cors',
          credentials: 'omit',
        });

        if (!response.ok) {
          continue;
        }

        const contentType = response.headers.get('content-type');
        // Ensure the response is an image type
        if (!contentType || !contentType.startsWith('image/')) {
          continue;
        }

        const isSvg =
          contentType === 'image/svg+xml' || path.toLowerCase().endsWith('.svg');

        // Check content-length header to filter out small files early
        if (!isSvg) {
          const contentLength = response.headers.get('content-length');
          if (contentLength && parseInt(contentLength) < FaviconService.MIN_ICON_SIZE) {
            continue;
          }
        }

        const blob = await response.blob();
        // Ensure blob has content and is not too small (filter out low-quality binary icons)
        if (blob.size === 0 || (!isSvg && blob.size < FaviconService.MIN_ICON_SIZE)) {
          continue;
        }

        const base64Url = await this.blobToBase64(blob);
        if (base64Url && base64Url.startsWith('data:image/')) {
          return base64Url;
        }
      } catch (error) {
        // Continue trying next path
        console.debug(`Failed to fetch ${faviconUrl}:`, error);
      }
    }

    // Try parsing page HTML to get favicon link
    return await this.fetchFromHtmlParsing(domain, FaviconService.MIN_ICON_SIZE);
  }

  /**
   * Parse page HTML to get favicon link
   */
  private async fetchFromHtmlParsing(
    domain: string,
    minSize: number = 0,
  ): Promise<string | undefined> {
    try {
      const pageUrl = `https://${domain}`;
      const response = await fetch(pageUrl, {
        credentials: 'omit',
        headers: {
          Accept: 'text/html',
        },
      });

      if (!response.ok) {
        return undefined;
      }

      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const iconLink = doc
        .querySelector("link[rel*='icon']")
        ?.getAttribute('href');

      if (!iconLink) {
        return undefined;
      }

      let faviconUrl = '';
      if (iconLink.startsWith('http')) {
        faviconUrl = iconLink;
      } else if (iconLink.startsWith('//')) {
        faviconUrl = 'https:' + iconLink;
      } else {
        faviconUrl = new URL(iconLink, `https://${domain}`).toString();
      }
      return await this.urlToBase64(faviconUrl, minSize);
    } catch (error) {
      console.debug('HTML parsing failed:', error);
    }
    return undefined;
  }

  // ==================== Utility methods ====================

  /**
   * Convert Blob to Base64 URL
   */
  private async blobToBase64(blob: Blob): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
    });
  }

  /**
   * Convert URL to Base64
   */
  private async urlToBase64(
    url: string,
    minSize: number = 0,
  ): Promise<string | undefined> {
    try {
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) {
        return undefined;
      }
      const blob = await response.blob();

      if (blob.size === 0) {
        return undefined;
      }

      // Check for size restriction if provided
      // SVG images are exempt from the size limit
      const isSvg =
        blob.type === 'image/svg+xml' || url.toLowerCase().endsWith('.svg');
      if (!isSvg && minSize > 0 && blob.size < minSize) {
        return undefined;
      }

      const result = await this.blobToBase64(blob);
      return result || undefined;
    } catch (error) {
      console.debug('urlToBase64 failed:', error);
      return undefined;
    }
  }

  // Make urlToBase64 public for modal component
  public async urlToBase64Public(url: string): Promise<string | null> {
    const result = await this.urlToBase64(url, 0); // No size restriction for manual entry
    return result || null;
  }

  // ==================== Custom icon management ====================

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
