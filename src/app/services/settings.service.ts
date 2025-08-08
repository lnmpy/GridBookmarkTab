import { Injectable } from '@angular/core';
import { Setting } from '@app/services/types';

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  private settings: Setting = {
    rootFolderId: '0',
    columns: 7,
    openBookmarkInCurrentTab: true,
    showActiveWindows: true,
  };

  public async initService() {
    this.settings = await chrome.storage.sync.get<Setting>([
      'rootFolderId',
      'columns',
      'openBookmarkInCurrentTab',
      'showActiveWindows',
    ]);

    if (chrome.runtime.lastError) {
      throw chrome.runtime.lastError;
    }
  }

  public getSettings(): Setting {
    this.settings.rootFolderId = '297';
    return this.settings;
  }

  public async setSettings(settings: Setting) {
    await chrome.storage.sync.set(settings);
    this.settings = settings;
  }
}
