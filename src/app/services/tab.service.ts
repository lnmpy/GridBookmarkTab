import { Injectable } from '@angular/core';

import { Window } from '@app/services/types';

export interface TabActionProperties {
  windowId?: number;
  groupId?: number;
  index?: number;
  active?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class TabService {
  public async createWindow(
    url: string | string[] | undefined,
    incognito: boolean = false,
    createData?: {
      width?: number;
      height?: number;
      left?: number;
      top?: number;
    },
  ): Promise<chrome.windows.Window | undefined> {
    return chrome.windows.create({
      url,
      incognito,
      ...createData,
    });
  }

  public async focusWindow(window: Window): Promise<void> {
    await chrome.windows.update(window.id!, {
      focused: true,
    });
  }

  public async createTabGroup(
    tabIds: number[],
    title: string,
    windowId: number | undefined = undefined,
  ): Promise<number> {
    const groupId = await chrome.tabs.group({
      tabIds: tabIds as [number, ...number[]],
      createProperties: {
        windowId,
      },
    });
    await chrome.tabGroups.update(groupId, { title });
    return groupId;
  }

  public async updateCurrentTab(url: string): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.tabs?.update) {
      await chrome.tabs.update({ url });
    } else {
      window.location.href = url;
    }
  }

  public async createTab(
    urls: string[],
    moveProperties: TabActionProperties = {},
  ): Promise<number[]> {
    const windowId =
      moveProperties.windowId || chrome.windows.WINDOW_ID_CURRENT;
    const groupId =
      moveProperties.groupId || chrome.tabGroups.TAB_GROUP_ID_NONE;
    const active = moveProperties.active || false;
    const chromeTabs = await Promise.all(
      urls.map(async (url) =>
        chrome.tabs.create({
          windowId,
          url,
          active,
        }),
      ),
    );
    if (groupId != chrome.tabGroups.TAB_GROUP_ID_NONE) {
      await chrome.tabs.group({
        tabIds: chromeTabs.map((t) => t.id!) as [number, ...number[]],
        groupId,
      });
    }
    if (active) {
      if (windowId !== chrome.windows.WINDOW_ID_CURRENT) {
        await chrome.windows.update(windowId, {
          focused: true,
        });
      }
      await chrome.tabs.update(chromeTabs[0]!.id, { active: true });
    }
    return chromeTabs.map((t) => t.id!);
  }
}
