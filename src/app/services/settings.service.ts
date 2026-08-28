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
    dockMagnification: true,
    wallpaperType: 'none',
    wallpaperCustomUrl: '',
    wallpaperDim: 10,
    wallpaperBlur: 0,
  };

  public settingsSource: BehaviorSubject<Setting> =
    new BehaviorSubject<Setting>(this.defaultSettings);

  private readonly ngZone = inject(NgZone);

  constructor() {
    this.reloadSettings();
  }

  async reloadSettings() {
    const chromeSettings = await chrome.storage.sync.get<Setting>(
      this.defaultSettings,
    );
    this.ngZone.run(() => {
      this.settingsSource.next({
        ...this.defaultSettings,
        ...chromeSettings,
      });
    });
  }

  // Expose read-only Observable
  onSettingsChange(): Observable<Setting> {
    return this.settingsSource.asObservable();
  }

  async storeSettings(settings: Setting) {
    await chrome.storage.sync.set(settings);
    await this.reloadSettings();
  }

  async previewSettings(settings: Setting) {
    this.settingsSource.next(settings);
  }
}
