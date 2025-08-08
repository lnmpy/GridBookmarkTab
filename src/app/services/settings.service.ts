import { Injectable } from '@angular/core';
import { Setting } from '@app/services/types';

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  private settings: Setting = {
    rootFolderId: '1',
    columns: 7,
    openBookmarkInCurrentTab: true,
    showActiveWindows: true,
  };

  public async initService() {
    const stored = await chrome.storage.sync.get<Setting>(this.settings);
    this.settings = { ...this.settings, ...stored };
    if (chrome.runtime.lastError) {
      throw chrome.runtime.lastError;
    }
  }

  public getSettings(): Setting {
    return this.settings;
  }

  public async setSettings(settings: Setting) {
    await chrome.storage.sync.set(settings);
    this.settings = settings;
  }
}
