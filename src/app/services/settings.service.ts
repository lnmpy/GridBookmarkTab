import { Injectable, NgZone, inject } from '@angular/core';
import { Setting } from '@app/services/types';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  private readonly defaultSettings: Setting = {
    bookmarkRootFolderId: '1',
    theme: 'light',
    language: 'auto', // 'auto' means use browser language
    bookmarkDisplayColumn: 7,
    bookmarkSize: 80,
    bookmarkOpenInNewTab: true,
    searchShortcut: { modifiers: [], key: ' ' },
    searchScope: 'root',
    searchFolderWhitelist: [],
    dockEnabled: true,
    dockFolderId: '',
    dockIconSize: 52,
    wallpaperType: 'none',
    wallpaperCustomUrl: '',
    wallpaperDim: 10,
    wallpaperBlur: 0,
  };

  private static readonly CACHE_KEY = 'gbk_settings_cache';

  public settingsSource: BehaviorSubject<Setting>;

  private readonly ngZone = inject(NgZone);

  constructor() {
    this.settingsSource = new BehaviorSubject<Setting>(
      this.getInitialSettings(),
    );
    this.reloadSettings();
  }

  private getInitialSettings(): Setting {
    try {
      if (typeof localStorage !== 'undefined') {
        const cached = localStorage.getItem(SettingsService.CACHE_KEY);
        if (cached) {
          return {
            ...this.defaultSettings,
            ...JSON.parse(cached),
          };
        }
      }
    } catch {
      // Ignore cache retrieval errors
    }
    return this.defaultSettings;
  }

  async reloadSettings() {
    const chromeSettings = await chrome.storage.sync.get<Setting>(
      this.defaultSettings,
    );
    const merged = {
      ...this.defaultSettings,
      ...chromeSettings,
    };
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SettingsService.CACHE_KEY, JSON.stringify(merged));
      }
    } catch {
      // Ignore storage errors
    }
    this.ngZone.run(() => {
      this.settingsSource.next(merged);
    });
  }

  // Expose read-only Observable
  onSettingsChange(): Observable<Setting> {
    return this.settingsSource.asObservable();
  }

  async storeSettings(settings: Setting) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SettingsService.CACHE_KEY, JSON.stringify(settings));
      }
    } catch {
      // Ignore storage errors
    }
    await chrome.storage.sync.set(settings);
    await this.reloadSettings();
  }
}
