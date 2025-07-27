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

  public async initService(): Promise<void> {
    this.settings = await new Promise((resolve, reject) => {
      chrome.storage.sync
        .get<Setting>(['rootFolderId', 'columns'])
        .then((result: Setting) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }

          resolve(result);
        });
    });
  }

  public getSettings(): Setting {
    this.settings.rootFolderId = '297';
    return this.settings;
  }

  public setSettings(settings: Setting): void {
    chrome.storage.sync.set(settings);
    this.settings = settings;
  }
}
