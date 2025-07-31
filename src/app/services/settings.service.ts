import { Injectable } from '@angular/core';

export interface Setting {
  rootFolderId: string;
  columns: number;
}

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  private settings: Setting = {
    rootFolderId: '0',
    columns: 7,
  };

  public async initService() {
    this.settings = await chrome.storage.sync.get<Setting>([
      'rootFolderId',
      'columns',
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
