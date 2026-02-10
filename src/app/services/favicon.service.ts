import { Injectable } from '@angular/core';
import { Bookmark } from '@app/services/types';

interface FaviconCache {
  base64Url: string;
  // 请求失败时的时间戳，用于判断是否过期（10分钟）
  failedAt?: number;
}

@Injectable({
  providedIn: 'root',
})
export class FaviconService {
  private static readonly storageKey = 'customIconSettings';
  // 失败缓存的有效期：10分钟
  private static readonly FAILED_CACHE_TTL = 10 * 60 * 1000;

  private customeIconSettings: Map<string, string> = new Map();

  // Memory cache to store loaded favicons for quick access (avoid flickering on reload)
  private faviconMemoryCache = new Map<string, string>();

  // Chrome's default globe favicon base64 - used to filter out "not found" results
  private chromeDefaultFaviconBase64: string | null = null;

  public async initService() {
    const result = await chrome.storage.local.get(FaviconService.storageKey);
    if (chrome.runtime.lastError) {
      throw chrome.runtime.lastError;
    }
    if (result[FaviconService.storageKey]) {
      // Parse JSON string to object, then convert to Map
      const settingsObject = JSON.parse(result[FaviconService.storageKey]);
      this.customeIconSettings = new Map(Object.entries(settingsObject));
    }

    // Pre-fetch Chrome's default favicon so we can filter it out later.
    // Use a URL that Chrome definitely has no favicon for.
    await this.loadChromeDefaultFavicon();

    // Clean up any previously cached Chrome default favicons from published versions
    if (this.chromeDefaultFaviconBase64) {
      await this.cleanupDefaultFavicons();
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

  /**
   * Scan all cached favicons and remove entries that match Chrome's default globe icon.
   * This fixes already-published versions that incorrectly cached the default icon.
   */
  private async cleanupDefaultFavicons() {
    try {
      const allStorage = await chrome.storage.local.get(null);
      const keysToRemove: string[] = [];

      for (const [key, value] of Object.entries(allStorage)) {
        if (!key.startsWith('favicon:')) continue;
        const cache = value as FaviconCache;
        if (cache.base64Url && cache.base64Url === this.chromeDefaultFaviconBase64) {
          keysToRemove.push(key);
        }
      }

      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
        console.log(`Cleaned up ${keysToRemove.length} cached Chrome default favicons`);
      }
    } catch (e) {
      console.debug('Failed to cleanup default favicons:', e);
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
   * 加载书签的 favicon URL
   * 获取优先级：
   * 1. 本地缓存 (chrome.storage.local)
   * 2. 本地配置（自定义图标）
   * 3. api.lnmpy.com API
   * 4. Chrome runtime _favicon API
   * 5. 网站的 icon (直接 fetch /favicon.ico 等)
   *
   * 缓存策略：
   * - 请求成功：永久保存
   * - 请求失败：缓存 10 分钟
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

    // 1. 检查本地配置（自定义图标）
    if (this.customeIconSettings.has(bookmark.id)) {
      bookmark.favIconUrl = this.customeIconSettings.get(bookmark.id);
      return;
    }

    if (bookmark.url == null || !bookmark.url.startsWith('http')) {
      return;
    }

    const domain = new URL(bookmark.url).host;

    // 2. 检查内存缓存（快速返回，避免闪烁）
    if (this.faviconMemoryCache.has(domain)) {
      bookmark.favIconUrl = this.faviconMemoryCache.get(domain)!;
      return;
    }

    // 3. 检查本地存储缓存
    const cachedResult = await this.getFromLocalCache(domain);
    if (cachedResult.found && cachedResult.favicon) {
      bookmark.favIconUrl = cachedResult.favicon;
      this.faviconMemoryCache.set(domain, cachedResult.favicon);
      return;
    }

    // 如果缓存标记为失败且未过期，跳过后续请求
    if (cachedResult.failedAndNotExpired) {
      return;
    }

    // 4. 尝试通过 api.lnmpy.com API 获取
    let favicon = await this.fetchFromLnmpyApi(domain);
    if (favicon) {
      bookmark.favIconUrl = favicon;
      this.faviconMemoryCache.set(domain, favicon);
      await this.saveToLocalCache(domain, favicon, false);
      return;
    }

    // 5. 尝试 Chrome runtime _favicon API
    favicon = await this.fetchFromChromeFaviconApi(bookmark.url);
    if (favicon) {
      bookmark.favIconUrl = favicon;
      this.faviconMemoryCache.set(domain, favicon);
      await this.saveToLocalCache(domain, favicon, false);
      return;
    }

    // 6. 尝试直接从网站获取 favicon
    favicon = await this.fetchFromWebsite(domain);
    if (favicon) {
      bookmark.favIconUrl = favicon;
      this.faviconMemoryCache.set(domain, favicon);
      await this.saveToLocalCache(domain, favicon, false);
      return;
    }

    // 所有方式都失败，标记为失败（10分钟后过期）
    await this.saveToLocalCache(domain, '', true);
  }

  // ==================== 缓存相关方法 ====================

  /**
   * 从本地存储缓存获取 favicon
   * 返回值：
   * - found: 是否找到有效的 favicon
   * - favicon: favicon 的 base64 URL
   * - failedAndNotExpired: 是否标记为失败且未过期
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

      const cache: FaviconCache | undefined = result[cacheKey];
      if (!cache) {
        return { found: false, failedAndNotExpired: false };
      }

      // 如果有有效的 favicon
      if (cache.base64Url) {
        return {
          found: true,
          favicon: cache.base64Url,
          failedAndNotExpired: false,
        };
      }

      // 如果标记为失败，检查是否过期
      if (cache.failedAt) {
        const now = Date.now();
        const isExpired =
          now - cache.failedAt > FaviconService.FAILED_CACHE_TTL;
        if (!isExpired) {
          // 失败且未过期，跳过后续请求
          return { found: false, failedAndNotExpired: true };
        }
        // 失败已过期，需要重新请求
        return { found: false, failedAndNotExpired: false };
      }

      return { found: false, failedAndNotExpired: false };
    } catch (error) {
      console.warn('Failed to get from cache:', error);
      return { found: false, failedAndNotExpired: false };
    }
  }

  /**
   * 保存 favicon 到本地存储缓存
   * @param domain 域名
   * @param base64Url favicon 的 base64 URL，失败时为空字符串
   * @param failed 是否请求失败
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

  // ==================== Favicon 获取方法 ====================

  /**
   * 方法 1: 通过 api.lnmpy.com API 获取
   */
  private async fetchFromLnmpyApi(domain: string): Promise<string | undefined> {
    // 尝试从完整域名开始，逐级向上尝试父域名
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
   * 方法 2: 使用 Chrome 内置的 _favicon API 获取
   * 参考: https://developer.chrome.com/docs/extensions/how-to/ui/favicons
   */
  private async fetchFromChromeFaviconApi(
    pageUrl: string,
  ): Promise<string | undefined> {
    try {
      const faviconUrl = new URL(chrome.runtime.getURL('/_favicon/'));
      faviconUrl.searchParams.set('pageUrl', pageUrl);
      faviconUrl.searchParams.set('size', '128');

      // 尝试 fetch 这个 URL 并转换为 base64
      const response = await fetch(faviconUrl.toString());
      if (!response.ok) {
        return undefined;
      }

      const blob = await response.blob();
      // 检查是否是有效的图片（Chrome 可能返回空白图片）
      if (blob.size < 100) {
        // 太小的图片可能是占位符
        return undefined;
      }

      const base64Url = await this.blobToBase64(blob);
      if (base64Url && base64Url.startsWith('data:image/')) {
        // 过滤掉 Chrome 的默认地球图标（表示没有找到真实 favicon）
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
   * 方法 3: 直接从网站获取 favicon
   * 按优先级尝试: /favicon.ico, /favicon.png, /apple-touch-icon.png
   */
  private async fetchFromWebsite(domain: string): Promise<string | undefined> {
    const protocol = 'https://';
    const faviconPaths = [
      '/favicon.ico',
      '/favicon.png',
      '/apple-touch-icon.png',
      '/apple-touch-icon-precomposed.png',
    ];

    for (const path of faviconPaths) {
      try {
        const faviconUrl = `${protocol}${domain}${path}`;
        const response = await fetch(faviconUrl, {
          mode: 'cors',
          credentials: 'omit',
        });

        if (!response.ok) {
          continue;
        }

        const contentType = response.headers.get('content-type');
        // 确保返回的是图片类型
        if (!contentType || !contentType.startsWith('image/')) {
          continue;
        }

        const blob = await response.blob();
        // 确保 blob 有内容
        if (blob.size === 0) {
          continue;
        }

        const base64Url = await this.blobToBase64(blob);
        if (base64Url && base64Url.startsWith('data:image/')) {
          return base64Url;
        }
      } catch (error) {
        // 继续尝试下一个路径
        console.debug(`Failed to fetch ${domain}${path}:`, error);
      }
    }

    // 尝试解析页面 HTML 获取 favicon link
    return await this.fetchFromHtmlParsing(domain);
  }

  /**
   * 解析页面 HTML 获取 favicon link
   */
  private async fetchFromHtmlParsing(
    domain: string,
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

      return await this.urlToBase64(faviconUrl);
    } catch (error) {
      console.debug('HTML parsing failed:', error);
    }
    return undefined;
  }

  // ==================== 工具方法 ====================

  /**
   * 将 Blob 转换为 Base64 URL
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
   * 将 URL 转换为 Base64
   */
  private async urlToBase64(url: string): Promise<string | undefined> {
    try {
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) {
        return undefined;
      }
      const blob = await response.blob();
      const result = await this.blobToBase64(blob);
      return result || undefined;
    } catch (error) {
      console.debug('urlToBase64 failed:', error);
      return undefined;
    }
  }

  // Make urlToBase64 public for modal component
  public async urlToBase64Public(url: string): Promise<string | null> {
    const result = await this.urlToBase64(url);
    return result || null;
  }

  // ==================== 自定义图标管理 ====================

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
