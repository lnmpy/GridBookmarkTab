import { Injectable } from '@angular/core';
import { Setting } from '@app/services/types';
import { BehaviorSubject, Observable, skip } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  private readonly defaultSettings: Setting = {
    bookmarkRootFolderId: '1',
    theme: 'lofi',
    bookmarkDisplayColumn: 7,
    bookmarkDisplayGap: 4,
    bookmarkDisplayRowHeight: 5,
    activeTabsDisplay: true,
    bookmarkOpenInNewTab: true,
  };

  public settingsSource: BehaviorSubject<Setting> =
    new BehaviorSubject<Setting>(this.defaultSettings);

  constructor() {
    this.reloadSettings();
  }

  async reloadSettings() {
    const chromeSettings = await chrome.storage.sync.get<Setting>(
      this.defaultSettings,
    );
    this.settingsSource.next({
      ...this.defaultSettings,
      ...chromeSettings,
    });
  }

  // 暴露只读 Observable
  onSettingsChange(): Observable<Setting> {
    return this.settingsSource.asObservable().pipe(skip(1));
  }

  async storeSettings(settings: Setting) {
    await chrome.storage.sync.set(settings);
    await this.reloadSettings();
  }

  async previewSettings(settings: Setting) {
    this.settingsSource.next(settings);
  }
}
