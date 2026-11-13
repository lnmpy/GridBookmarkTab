import { Injectable } from '@angular/core';
import { Bookmark } from '@app/services/types';
import { Subject } from 'rxjs';

interface FaviconCache {
  base64Url: string;
  // Timestamp when request failed, used to determine if expired (10 minutes)
  failedAt?: number;
  // Decoded pixel size of the icon (SVG counts as SVG_ICON_SIZE); missing on legacy entries
  size?: number;
  // Timestamp after which a low-res icon is looked up again
  recheckAt?: number;
}

interface FaviconMeta {
  size?: number;
  recheckAt?: number;
}

interface IconCandidate {
  url: string;
  // Size declared by the page (sizes attribute, manifest) or guessed from the link type
  hintSize: number;
}

interface IconResult {
  base64Url: string;
  size: number;
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

  // Size and freshness of cached favicons, used to decide whether to look for a sharper one
  private faviconMeta = new Map<string, FaviconMeta>();

  // In-memory cache for failed domains to avoid duplicate requests in same session
  private failedDomainsMemoryCache = new Map<string, number>();

  // In-flight fetch deduplication to prevent stampede requests for the same domain
  private inFlightFetches = new Map<string, Promise<string | undefined>>();

  // Chrome's default globe favicon base64 - used to filter out "not found" results
  private chromeDefaultFaviconBase64: string | null = null;

  // Event stream for when a new external icon is loaded
  public readonly faviconLoaded$ = new Subject<{ id: string, url: string }>();

  // Track bookmarks that have already attempted to update their icon in the current session
  private iconUpdateAttempts = new Set<string>();

  // Concurrency control for favicon fetching
  private static readonly MAX_CONCURRENT_FETCHES = 3;
  private static readonly FETCH_DELAY_MS = 50;
  // Icons at least this many pixels wide are considered sharp enough to stop searching
  private static readonly TARGET_ICON_SIZE = 128;
  // Nominal size assigned to vector icons
  private static readonly SVG_ICON_SIZE = 512;
  // Maximum number of icon candidates downloaded per domain
  private static readonly MAX_ICON_CANDIDATES = 6;
  // Network requests to websites and APIs are aborted after this delay, so an unreachable
  // host (e.g. an intranet site off VPN) cannot hold a fetch slot and stall the whole queue
  private static readonly FETCH_TIMEOUT_MS = 8000;
  // Effective size given to icons from Chrome's _favicon API: Chrome mostly stores 16/32px
  // favicons and upscales them to the requested size, so the decoded size is meaningless
  private static readonly CHROME_ICON_SIZE = 32;
  // Low-res icons are looked up again after 7 days plus a random jitter of up to 3 days,
  // so that icons cached together are not all refreshed at the same time
  private static readonly LOW_RES_RECHECK_TTL = 7 * 24 * 60 * 60 * 1000;
  private static readonly LOW_RES_RECHECK_JITTER = 3 * 24 * 60 * 60 * 1000;
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

    const now = Date.now();
    const keysToRemove: string[] = [];
    for (const [key, value] of Object.entries(allStorage)) {
      if (!key.startsWith('favicon:')) continue;
      
      const cache = value as FaviconCache;
      const domain = key.substring('favicon:'.length);
      if (cache.base64Url) {
        if (this.chromeDefaultFaviconBase64 && cache.base64Url === this.chromeDefaultFaviconBase64) {
          keysToRemove.push(key);
        } else {
          this.faviconMemoryCache.set(domain, cache.base64Url);
          this.faviconMeta.set(domain, { size: cache.size, recheckAt: cache.recheckAt });
        }
      } else if (cache.failedAt) {
        if (now - cache.failedAt <= FaviconService.FAILED_CACHE_TTL) {
          this.failedDomainsMemoryCache.set(domain, cache.failedAt);
        } else {
          keysToRemove.push(key);
        }
      }
    }

    if (keysToRemove.length > 0) {
      try {
        await chrome.storage.local.remove(keysToRemove);
        console.log(`Cleaned up ${keysToRemove.length} expired or default favicons`);
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
    // Chrome _favicon API is only accessible when running inside Chrome Extension context (chrome-extension://)
    if (typeof window !== 'undefined' && !window.location.protocol.startsWith('chrome-extension')) {
      return;
    }
    try {
      const faviconUrl = new URL(chrome.runtime.getURL('/_favicon/'));
      // A page Chrome cannot know, so the default icon is returned
      // (chrome:// pages may have their own icons)
      faviconUrl.searchParams.set('pageUrl', 'https://invalid.invalid/');
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
   * 3. Failed domain memory cache
   * 4. Local cache (chrome.storage.local)
   * 5. Website icons (manifest, apple-touch-icon, link[rel=icon], favicon.ico), largest wins
   * 6. api.lnmpy.com API
   * 7. Chrome runtime _favicon API (counted as 32px, so it only replaces smaller icons)
   *
   * Cache strategy:
   * - Success: Save permanently, with the measured size
   * - Low-res or legacy (unmeasured) icons are shown immediately, then looked up again
   *   in the background (low-res every 7 days plus a random jitter)
   * - Failure: Cache for 10 minutes
   */
  public async loadBookmarkFavIconUrl(bookmark: Bookmark) {
    if (bookmark == null || bookmark.id == null) {
      return;
    }

    // Limit each bookmark to updating its icon only once per session
    if (this.iconUpdateAttempts.has(bookmark.id)) {
      return;
    }
    this.iconUpdateAttempts.add(bookmark.id);

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

    let domain: string;
    try {
      domain = new URL(url).host;
    } catch {
      return;
    }

    // 2. Check memory cache (fast return, avoid flickering)
    let existing: IconResult | undefined;
    if (this.faviconMemoryCache.has(domain)) {
      const cached = this.faviconMemoryCache.get(domain)!;
      this.applyFavicon(bookmark, cached);
      if (!this.needsUpgrade(domain)) {
        return;
      }
      existing = { base64Url: cached, size: this.faviconMeta.get(domain)?.size ?? -1 };
    } else {
      // 3. Check failed domain memory cache
      const failedAt = this.failedDomainsMemoryCache.get(domain);
      if (failedAt && Date.now() - failedAt <= FaviconService.FAILED_CACHE_TTL) {
        return;
      }

      // 4. Check local storage cache
      const cachedResult = await this.getFromLocalCache(domain);
      if (cachedResult.found && cachedResult.favicon) {
        this.faviconMemoryCache.set(domain, cachedResult.favicon);
        this.faviconMeta.set(domain, cachedResult.meta ?? {});
        this.applyFavicon(bookmark, cachedResult.favicon);
        if (!this.needsUpgrade(domain)) {
          return;
        }
        existing = { base64Url: cachedResult.favicon, size: cachedResult.meta?.size ?? -1 };
      } else if (cachedResult.failedAndNotExpired) {
        // If cache is marked as failed and not expired, skip subsequent requests
        return;
      }
    }

    // 5. In-flight request deduplication: if domain is already being fetched, wait for that promise
    if (this.inFlightFetches.has(domain)) {
      const existingFavicon = await this.inFlightFetches.get(domain);
      if (existingFavicon) {
        this.applyFavicon(bookmark, existingFavicon);
      }
      return;
    }

    const fetchPromise = this.lookupFavicon(domain, url, existing);
    this.inFlightFetches.set(domain, fetchPromise);

    try {
      const favicon = await fetchPromise;
      if (favicon) {
        this.applyFavicon(bookmark, favicon);
      }
    } finally {
      this.inFlightFetches.delete(domain);
    }
  }

  /**
   * Set the bookmark icon and notify listeners when it actually changed,
   * so already rendered trees pick up upgraded icons.
   */
  private applyFavicon(bookmark: Bookmark, favicon: string) {
    if (bookmark.favIconUrl === favicon) {
      return;
    }
    bookmark.favIconUrl = favicon;
    this.faviconLoaded$.next({ id: bookmark.id, url: favicon });
  }

  /**
   * Whether a cached favicon should be looked up again for a sharper version:
   * legacy entries without a measured size, or low-res icons whose recheck time has come.
   */
  private needsUpgrade(domain: string): boolean {
    const meta = this.faviconMeta.get(domain);
    if (meta?.size == null) {
      return true;
    }
    if (meta.size >= FaviconService.TARGET_ICON_SIZE) {
      return false;
    }
    return !meta.recheckAt || Date.now() >= meta.recheckAt;
  }

  private static nextRecheckAt(): number {
    return (
      Date.now() +
      FaviconService.LOW_RES_RECHECK_TTL +
      Math.floor(Math.random() * FaviconService.LOW_RES_RECHECK_JITTER)
    );
  }

  /**
   * Fetch the best favicon for a domain, keep the sharper of it and the existing one,
   * then update caches. Returns the favicon to display, if any.
   */
  private async lookupFavicon(
    domain: string,
    url: string,
    existing?: IconResult,
  ): Promise<string | undefined> {
    if (existing && existing.size < 0) {
      // Legacy cache entry: measure it so it can compete with fresh candidates
      existing.size = await this.measureBlob(dataUrlToBlob(existing.base64Url));
    }

    const fetched = await this.fetchFaviconForDomain(domain, url);
    const best = fetched && (!existing || fetched.size > existing.size) ? fetched : existing;
    if (!best) {
      this.failedDomainsMemoryCache.set(domain, Date.now());
      await this.saveToLocalCache(domain, '', true);
      return undefined;
    }

    this.faviconMemoryCache.set(domain, best.base64Url);
    const recheckAt = FaviconService.nextRecheckAt();
    this.faviconMeta.set(domain, { size: best.size, recheckAt });
    this.failedDomainsMemoryCache.delete(domain);
    await this.saveToLocalCache(domain, best.base64Url, false, best.size, recheckAt);
    return best.base64Url;
  }

  /**
   * Internal method to fetch favicon across all external sources,
   * returning the largest icon found (stops early once it is sharp enough)
   */
  private async fetchFaviconForDomain(domain: string, url: string): Promise<IconResult | undefined> {
    let best: IconResult | undefined;
    const consider = (icon: IconResult | undefined): boolean => {
      if (icon && (!best || icon.size > best.size)) {
        best = icon;
      }
      return !!best && best.size >= FaviconService.TARGET_ICON_SIZE;
    };

    // 1. Icons declared by the website (manifest, apple-touch-icon, link[rel=icon], favicon.ico)
    if (consider(await this.enqueueExternalFetch(() => this.fetchFromWebsite(domain, url)))) {
      return best;
    }

    // 2. api.lnmpy.com API, usually higher quality images
    if (consider(await this.enqueueExternalFetch(() => this.fetchFromLnmpyApi(domain)))) {
      return best;
    }

    // 3. Chrome runtime _favicon API: the icon Chrome saw when visiting the page, which also
    // covers sites unreachable from here (login walls, http-only or intranet hosts).
    // Its size is capped at CHROME_ICON_SIZE, so it only replaces smaller icons
    consider(await this.enqueueExternalFetch(() => this.fetchFromChromeFaviconApi(url)));

    return best;
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
    meta?: FaviconMeta;
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
          meta: { size: cache.size, recheckAt: cache.recheckAt },
          failedAndNotExpired: false,
        };
      }

      // If marked as failed, check if expired
      if (cache.failedAt) {
        const now = Date.now();
        const isExpired =
          now - cache.failedAt > FaviconService.FAILED_CACHE_TTL;
        if (!isExpired) {
          this.failedDomainsMemoryCache.set(domain, cache.failedAt);
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
   * @param size Decoded pixel size of the favicon
   * @param recheckAt Timestamp after which a low-res favicon is looked up again
   */
  private async saveToLocalCache(
    domain: string,
    base64Url: string,
    failed: boolean,
    size?: number,
    recheckAt?: number,
  ): Promise<void> {
    const cacheKey = `favicon:${domain}`;
    try {
      const cacheData: FaviconCache = {
        base64Url,
      };
      if (failed) {
        cacheData.failedAt = Date.now();
        this.failedDomainsMemoryCache.set(domain, cacheData.failedAt);
      } else {
        cacheData.size = size;
        cacheData.recheckAt = recheckAt;
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
  private async fetchFromLnmpyApi(domain: string): Promise<IconResult | undefined> {
    // Try starting from full domain, progressively trying parent domains (max 2 trials)
    const parts = domain.split('.');
    const maxTrials = Math.min(parts.length - 1, 2);
    for (let i = 0; i < maxTrials; i++) {
      const trialDomain = parts.slice(i).join('.');
      try {
        const response = await this.fetchExternal(
          `https://api.lnmpy.com/google_base64_favicon?domain=${trialDomain}`,
        );
        if (!response.ok) {
          // If response is 404 or other error, do not treat it as image
          continue;
        }
        const base64Url = await response.text();
        if (base64Url.startsWith('data:image/')) {
          const size = await this.measureBlob(dataUrlToBlob(base64Url));
          if (size > 0) {
            return { base64Url, size };
          }
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
  ): Promise<IconResult | undefined> {
    if (typeof window !== 'undefined' && !window.location.protocol.startsWith('chrome-extension')) {
      return undefined;
    }
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
      const size = await this.measureBlob(blob);
      if (size <= 0) {
        return undefined;
      }

      const base64Url = await this.blobToBase64(blob);
      if (base64Url && base64Url.startsWith('data:image/')) {
        // Filter out Chrome's default globe icon (indicates no real favicon found)
        if (this.chromeDefaultFaviconBase64 && base64Url === this.chromeDefaultFaviconBase64) {
          return undefined;
        }
        return { base64Url, size: Math.min(size, FaviconService.CHROME_ICON_SIZE) };
      }
    } catch (error) {
      console.debug('Chrome favicon API failed:', error);
    }
    return undefined;
  }

  /**
   * Method 3: Fetch the icons declared by the website and keep the largest one.
   * Candidates are tried from the largest declared size down, stopping once one is sharp enough.
   */
  private async fetchFromWebsite(domain: string, pageUrl: string): Promise<IconResult | undefined> {
    const candidates = await this.collectIconCandidates(domain, pageUrl);
    candidates.sort((a, b) => b.hintSize - a.hintSize);

    let best: IconResult | undefined;
    for (const candidate of candidates.slice(0, FaviconService.MAX_ICON_CANDIDATES)) {
      const icon = await this.fetchIcon(candidate.url);
      if (icon && (!best || icon.size > best.size)) {
        best = icon;
      }
      if (best && best.size >= FaviconService.TARGET_ICON_SIZE) {
        break;
      }
    }
    return best;
  }

  /**
   * Collect icon URLs from the home page: <link rel="icon">, apple-touch-icon and the
   * Web App Manifest, plus the conventional /apple-touch-icon.png and /favicon.ico paths.
   * The home page is requested over https first, then over http for http bookmarks.
   */
  private async collectIconCandidates(domain: string, pageUrl: string): Promise<IconCandidate[]> {
    const origins = [`https://${domain}/`];
    if (pageUrl.startsWith('http:')) {
      origins.push(`http://${domain}/`);
    }

    const candidates: IconCandidate[] = [];
    let reachedOrigin: string | undefined;
    for (const origin of origins) {
      const declared = await this.fetchHomePageIcons(origin);
      if (declared) {
        candidates.push(...declared);
        reachedOrigin = origin;
        break;
      }
    }

    // Without a reachable home page, the conventional paths are tried on every origin
    for (const origin of reachedOrigin ? [reachedOrigin] : origins) {
      candidates.push(
        { url: `${origin}apple-touch-icon.png`, hintSize: 180 },
        { url: `${origin}favicon.ico`, hintSize: 16 },
      );
    }

    const seen = new Set<string>();
    return candidates.filter((c) => !seen.has(c.url) && seen.add(c.url));
  }

  /**
   * Read the icons declared by a home page, undefined if the page cannot be loaded
   */
  private async fetchHomePageIcons(origin: string): Promise<IconCandidate[] | undefined> {
    try {
      const response = await this.fetchExternal(origin, {
        credentials: 'omit',
        headers: {
          Accept: 'text/html',
        },
      });
      if (!response.ok) {
        return undefined;
      }
      const candidates: IconCandidate[] = [];
      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      const pageUrl = response.url || origin;
      const baseHref = doc.querySelector('base[href]')?.getAttribute('href');
      const baseUrl = (baseHref && resolveUrl(baseHref, pageUrl)) || pageUrl;

      let manifestUrl: string | undefined;
      for (const link of Array.from(doc.querySelectorAll('link[rel][href]'))) {
        const rels = link.getAttribute('rel')!.toLowerCase().split(/\s+/);
        const href = resolveUrl(link.getAttribute('href')!, baseUrl);
        if (!href) {
          continue;
        }
        const sizes = parseIconSizes(link.getAttribute('sizes'));
        if (rels.includes('apple-touch-icon') || rels.includes('apple-touch-icon-precomposed')) {
          candidates.push({ url: href, hintSize: sizes || 180 });
        } else if (rels.includes('icon')) {
          const isSvg = !!link.getAttribute('type')?.includes('svg') || isSvgUrl(href);
          candidates.push({ url: href, hintSize: isSvg ? FaviconService.SVG_ICON_SIZE : sizes || 32 });
        } else if (rels.includes('manifest')) {
          manifestUrl = href;
        }
      }

      if (manifestUrl) {
        candidates.push(...(await this.fetchManifestIcons(manifestUrl)));
      }
      return candidates;
    } catch (error) {
      console.debug(`Failed to parse home page ${origin}:`, error);
      return undefined;
    }
  }

  /**
   * Read the icons listed in a Web App Manifest, skipping maskable-only and monochrome ones
   */
  private async fetchManifestIcons(manifestUrl: string): Promise<IconCandidate[]> {
    try {
      const response = await this.fetchExternal(manifestUrl, { credentials: 'omit' });
      if (!response.ok) {
        return [];
      }
      const manifest = (await response.json()) as {
        icons?: { src?: string; sizes?: string; type?: string; purpose?: string }[];
      };
      const candidates: IconCandidate[] = [];
      for (const icon of manifest.icons ?? []) {
        if (!icon.src) {
          continue;
        }
        if (icon.purpose && !icon.purpose.split(/\s+/).includes('any')) {
          continue;
        }
        const url = resolveUrl(icon.src, response.url || manifestUrl);
        if (!url) {
          continue;
        }
        const isSvg = !!icon.type?.includes('svg') || isSvgUrl(url);
        candidates.push({
          url,
          hintSize: isSvg ? FaviconService.SVG_ICON_SIZE : parseIconSizes(icon.sizes ?? null) || 64,
        });
      }
      return candidates;
    } catch (error) {
      console.debug(`Failed to read manifest ${manifestUrl}:`, error);
      return [];
    }
  }

  /**
   * Download an icon and measure its real pixel size
   */
  private async fetchIcon(url: string): Promise<IconResult | undefined> {
    try {
      const response = await this.fetchExternal(url, { credentials: 'omit' });
      if (!response.ok) {
        return undefined;
      }
      let blob = await response.blob();
      if (blob.size === 0) {
        return undefined;
      }

      // Some servers send icons as application/octet-stream; fix the type so the data URL renders
      if (!blob.type.startsWith('image/')) {
        if (blob.type.startsWith('text/html')) {
          return undefined;
        }
        blob = new Blob([blob], { type: isSvgUrl(url) ? 'image/svg+xml' : 'image/x-icon' });
      }

      const size = await this.measureBlob(blob);
      if (size <= 0) {
        return undefined;
      }

      const base64Url = await this.blobToBase64(blob);
      if (base64Url && base64Url.startsWith('data:image/')) {
        return { base64Url, size };
      }
    } catch (error) {
      console.debug(`Failed to fetch icon ${url}:`, error);
    }
    return undefined;
  }

  /**
   * Decode an image blob and return its largest dimension in pixels, 0 if it is not a usable image.
   * For multi-size ICO files Chrome decodes the largest entry.
   */
  private async measureBlob(blob: Blob): Promise<number> {
    if (blob.type.includes('svg')) {
      const text = await blob.text();
      return text.includes('<svg') ? FaviconService.SVG_ICON_SIZE : 0;
    }
    if (typeof createImageBitmap === 'undefined') {
      return 0;
    }
    try {
      const bitmap = await createImageBitmap(blob);
      const size = Math.max(bitmap.width, bitmap.height);
      bitmap.close();
      return size;
    } catch {
      return 0;
    }
  }

  // ==================== Utility methods ====================

  /**
   * fetch with a timeout, for requests to websites and favicon APIs
   */
  private fetchExternal(url: string, init: RequestInit = {}): Promise<Response> {
    return fetch(url, { ...init, signal: AbortSignal.timeout(FaviconService.FETCH_TIMEOUT_MS) });
  }

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
      if (url.startsWith('data:image/')) {
        return url;
      }

      if (isSvgCode(url)) {
        return svgToDataUrl(url);
      }

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
        blob.type.includes('svg') ||
        url.toLowerCase().includes('.svg') ||
        url.startsWith('data:image/svg+xml');
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
    if (url.startsWith('data:image/')) {
      return url;
    }
    if (isSvgCode(url)) {
      return svgToDataUrl(url);
    }
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

  // ==================== Cache Statistics & Management ====================

  /**
   * Get cached favicons count and custom icons count
   */
  public async getFaviconCacheStats(): Promise<{ cachedIconsCount: number; customIconsCount: number }> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const allStorage = await chrome.storage.local.get(null);
        let cachedIconsCount = 0;
        for (const key of Object.keys(allStorage)) {
          if (key.startsWith('favicon:')) {
            cachedIconsCount++;
          }
        }
        return {
          cachedIconsCount,
          customIconsCount: this.customeIconSettings.size,
        };
      }
    } catch (e) {
      console.debug('Failed to read storage for favicon stats:', e);
    }
    return {
      cachedIconsCount: this.faviconMemoryCache.size,
      customIconsCount: this.customeIconSettings.size,
    };
  }

  /**
   * Clear all cached website favicons from local storage and memory
   */
  public async clearFaviconCache(): Promise<number> {
    let removedCount = 0;
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const allStorage = await chrome.storage.local.get(null);
        const keysToRemove: string[] = [];
        for (const key of Object.keys(allStorage)) {
          if (key.startsWith('favicon:')) {
            keysToRemove.push(key);
          }
        }
        if (keysToRemove.length > 0) {
          await chrome.storage.local.remove(keysToRemove);
          removedCount = keysToRemove.length;
        }
      }
      this.faviconMemoryCache.clear();
      this.failedDomainsMemoryCache.clear();
      this.inFlightFetches.clear();
      this.iconUpdateAttempts.clear();
    } catch (e) {
      console.error('Failed to clear favicon cache:', e);
    }
    return removedCount;
  }
}

/**
 * Check if a string is raw SVG XML code
 */
export function isSvgCode(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  return (
    trimmed.startsWith('<svg') ||
    trimmed.startsWith('<?xml') ||
    (/^<[a-z0-9:-]+\s+/i.test(trimmed) && trimmed.includes('<svg'))
  );
}

/**
 * Convert SVG code or UTF8 Data URI to base64 Data URI
 */
export function svgToDataUrl(svgContent: string): string {
  const trimmed = svgContent.trim();
  if (trimmed.startsWith('data:image/')) {
    if (trimmed.startsWith('data:image/svg+xml;utf8,')) {
      const rawSvg = decodeURIComponent(trimmed.slice('data:image/svg+xml;utf8,'.length));
      return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(rawSvg)))}`;
    }
    return trimmed;
  }
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(trimmed)))}`;
}

/**
 * Resolve a possibly relative URL, returning undefined for invalid or non-http(s) results
 */
function resolveUrl(href: string, base: string): string | undefined {
  try {
    const url = new URL(href.trim(), base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Largest dimension from a sizes attribute such as "16x16 32x32" ("any" means vector)
 */
function parseIconSizes(sizes: string | null): number {
  if (!sizes) return 0;
  let max = 0;
  for (const token of sizes.toLowerCase().split(/\s+/)) {
    if (token === 'any') return 512;
    const match = /^(\d+)x(\d+)$/.exec(token);
    if (match) {
      max = Math.max(max, parseInt(match[1]), parseInt(match[2]));
    }
  }
  return max;
}

function isSvgUrl(url: string): boolean {
  return /\.svg(?:[?#]|$)/i.test(url);
}

/**
 * Convert a base64 (or URL-encoded) data URL to a Blob without going through fetch
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const commaIndex = dataUrl.indexOf(',');
  const header = dataUrl.slice(5, commaIndex);
  const data = dataUrl.slice(commaIndex + 1);
  const type = header.split(';')[0];
  if (!header.endsWith(';base64')) {
    return new Blob([decodeURIComponent(data)], { type });
  }
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type });
}
