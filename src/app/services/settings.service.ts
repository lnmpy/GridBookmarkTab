import { Injectable } from '@angular/core';
import { Setting } from '@app/services/types';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  public readonly settingsSource = new BehaviorSubject<Setting>({
    rootFolderId: '1',
    columns: 7,
    openBookmarkInCurrentTab: true,
    showActiveWindows: true,
  });

  public readonly settings$ = this.settingsSource.asObservable();

  constructor() {
    this.reloadSettings();
  }

  async reloadSettings() {
    const chromeSettings = await chrome.storage.sync.get<Setting>(
      this.settingsSource.value,
    );
    this.settingsSource.next({
      ...this.settingsSource.value,
      ...chromeSettings,
    });
  }

  async storeSettings(settings: Setting) {
    await chrome.storage.sync.set(settings);
    await this.reloadSettings();
  }

  async previewSettings(settings: Setting) {
    this.settingsSource.next(settings);
  }
}
