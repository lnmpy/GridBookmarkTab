import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { SettingsService } from '@app/services/settings.service';
import { Setting, WallpaperType } from '@app/services/types';

export interface ActiveWallpaper {
  type: WallpaperType;
  background: string; // CSS background value or url('...')
  isImage: boolean;
  title?: string;
  copyright?: string;
}

export interface BingWallpaperData {
  date: string;
  url: string;
  title?: string;
  copyright?: string;
}

@Injectable({
  providedIn: 'root',
})
export class WallpaperService {
  private readonly settingsService = inject(SettingsService);

  private readonly activeWallpaperSubject = new BehaviorSubject<ActiveWallpaper>({
    type: 'none',
    background: '',
    isImage: false,
  });

  public readonly activeWallpaper$: Observable<ActiveWallpaper> =
    this.activeWallpaperSubject.asObservable();

  private bingWallpaperCache: BingWallpaperData | null = null;
  private customWallpaperDataUrl: string | null = null;

  constructor() {
    this.init();
  }

  private async init() {
    // Listen for settings changes
    this.settingsService.onSettingsChange().subscribe((settings) => {
      this.resolveWallpaper(settings);
    });
  }

  /**
   * Resolve and emit active wallpaper according to current settings
   */
  public async resolveWallpaper(settings: Setting) {
    const type = settings.wallpaperType || 'none';

    if (type === 'none') {
      this.activeWallpaperSubject.next({
        type: 'none',
        background: '',
        isImage: false,
      });
      return;
    }

    if (type === 'bing') {
      const bingData = await this.getBingWallpaper();
      if (bingData?.url) {
        this.activeWallpaperSubject.next({
          type: 'bing',
          background: `url("${bingData.url}")`,
          isImage: true,
          title: bingData.title,
          copyright: bingData.copyright,
        });
      }
      return;
    }

    if (type === 'custom') {
      if (!this.customWallpaperDataUrl) {
        this.customWallpaperDataUrl = await this.getCustomWallpaper();
      }
      if (this.customWallpaperDataUrl) {
        this.activeWallpaperSubject.next({
          type: 'custom',
          background: `url("${this.customWallpaperDataUrl}")`,
          isImage: true,
          title: 'Custom Wallpaper',
        });
      } else {
        // Fallback to none if no image uploaded
        this.activeWallpaperSubject.next({
          type: 'none',
          background: '',
          isImage: false,
        });
      }
      return;
    }

    if (type === 'url') {
      const url = settings.wallpaperCustomUrl?.trim();
      if (url) {
        this.activeWallpaperSubject.next({
          type: 'url',
          background: `url("${url}")`,
          isImage: true,
        });
      } else {
        this.activeWallpaperSubject.next({
          type: 'none',
          background: '',
          isImage: false,
        });
      }
      return;
    }
  }

  // ==================== Bing Daily Wallpaper ====================

  /**
   * Fetch Bing Daily Wallpaper with local date caching
   */
  public async getBingWallpaper(): Promise<BingWallpaperData | null> {
    const today = new Date().toISOString().split('T')[0];

    // Check memory cache first
    if (this.bingWallpaperCache && this.bingWallpaperCache.date === today) {
      return this.bingWallpaperCache;
    }

    // Check chrome.storage.local
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const stored = await chrome.storage.local.get('bing_wallpaper_cache');
        const cache = stored['bing_wallpaper_cache'] as BingWallpaperData | undefined;
        if (cache && cache.date === today && cache.url) {
          this.bingWallpaperCache = cache;
          return cache;
        }
      }
    } catch (e) {
      console.debug('Failed to read bing cache from storage', e);
    }

    // Fetch from Bing API
    try {
      let data: BingWallpaperData | null = null;

      // Method 1: Official Bing HPImageArchive
      try {
        const resp = await fetch(
          'https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN'
        );
        if (resp.ok) {
          const json = await resp.json();
          if (json.images && json.images.length > 0) {
            const img = json.images[0];
            const fullUrl = img.url.startsWith('http')
              ? img.url
              : `https://www.bing.com${img.url}`;
            data = {
              date: today,
              url: fullUrl,
              title: img.title || 'Bing Daily Wallpaper',
              copyright: img.copyright,
            };
          }
        }
      } catch (err) {
        console.debug('Direct Bing fetch failed, trying proxy...', err);
      }

      // Method 2: Fallback Biturl
      if (!data) {
        const resp = await fetch(
          'https://bing.biturl.top/?resolution=1920&format=json&index=0&mkt=zh-CN'
        );
        if (resp.ok) {
          const json = await resp.json();
          if (json.url) {
            data = {
              date: today,
              url: json.url,
              copyright: json.copyright,
            };
          }
        }
      }

      if (data) {
        this.bingWallpaperCache = data;
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          await chrome.storage.local.set({ bing_wallpaper_cache: data });
        }
        return data;
      }
    } catch (e) {
      console.warn('Failed to fetch Bing wallpaper:', e);
    }

    return this.bingWallpaperCache;
  }

  // ==================== IndexedDB Custom Wallpaper Storage ====================

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('GBKTabDB', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('wallpapers')) {
          db.createObjectStore('wallpapers');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save user uploaded wallpaper file to IndexedDB with automatic client-side resizing
   */
  public async saveCustomWallpaper(file: File | Blob): Promise<string> {
    const resizedDataUrl = await this.resizeImage(file, 2560, 1440, 0.88);
    const db = await this.openDatabase();

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('wallpapers', 'readwrite');
      const store = tx.objectStore('wallpapers');
      const req = store.put(resizedDataUrl, 'custom_wallpaper');
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    this.customWallpaperDataUrl = resizedDataUrl;

    // Update active wallpaper
    const currentSettings = this.settingsService.settingsSource.value;
    if (currentSettings.wallpaperType === 'custom') {
      this.activeWallpaperSubject.next({
        type: 'custom',
        background: `url("${resizedDataUrl}")`,
        isImage: true,
        title: 'Custom Wallpaper',
      });
    }

    return resizedDataUrl;
  }

  /**
   * Get user custom wallpaper data URL from IndexedDB
   */
  public async getCustomWallpaper(): Promise<string | null> {
    if (this.customWallpaperDataUrl) {
      return this.customWallpaperDataUrl;
    }
    try {
      const db = await this.openDatabase();
      return await new Promise<string | null>((resolve, reject) => {
        const tx = db.transaction('wallpapers', 'readonly');
        const store = tx.objectStore('wallpapers');
        const req = store.get('custom_wallpaper');
        req.onsuccess = () => {
          this.customWallpaperDataUrl = req.result || null;
          resolve(this.customWallpaperDataUrl);
        };
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('Failed to load custom wallpaper from IndexedDB:', e);
      return null;
    }
  }

  /**
   * Remove custom wallpaper from IndexedDB
   */
  public async clearCustomWallpaper(): Promise<void> {
    this.customWallpaperDataUrl = null;
    try {
      const db = await this.openDatabase();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('wallpapers', 'readwrite');
        const store = tx.objectStore('wallpapers');
        const req = store.delete('custom_wallpaper');
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('Failed to delete custom wallpaper from IndexedDB:', e);
    }
  }

  /**
   * Resize image to reasonable max dimensions to prevent memory overflow and lag
   */
  private resizeImage(
    file: File | Blob,
    maxWidth: number,
    maxHeight: number,
    quality: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(e.target?.result as string);
            return;
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          // Use WebP if possible, fallback to JPEG
          try {
            const webpUrl = canvas.toDataURL('image/webp', quality);
            if (webpUrl.startsWith('data:image/webp')) {
              resolve(webpUrl);
              return;
            }
          } catch {
            // fallback
          }

          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}
