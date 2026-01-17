import { Injectable } from '@angular/core';

import { Window, TabGroup, Tab } from '@app/services/types';

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
  private async getWindow(windowId: number): Promise<Window> {
    const chromeWindow = await chrome.windows.get(windowId);
    const window: Window = {
      id: chromeWindow.id,
      title: 'Untitled',
      tabsCount: 0,
      focused: chromeWindow.focused,
      incognito: chromeWindow.incognito,
      tabs: [],
      tabGroups: [],
      type: 'window',
    };
    const tabGroupsMap: Map<number, TabGroup> = new Map();
    const chromeTabs = await chrome.tabs.query({ windowId });
    for (const chromeTab of chromeTabs) {
      const currentTab: Tab = {
        id: chromeTab.id!,
        index: chromeTab.index,
        url: chromeTab.url,
        title: chromeTab.title,
        favIconUrl: chromeTab.favIconUrl,
        windowId: chromeTab.windowId,
        groupId: chromeTab.groupId,
        active: chromeTab.active,
        pinned: chromeTab.pinned,
        openerTabId: chromeTab.openerTabId,
        type: 'tab',
      };
      window.tabsCount++;

      if (currentTab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
        window.tabs!.push(currentTab);
      } else {
        if (tabGroupsMap.has(currentTab.groupId)) {
          tabGroupsMap.get(currentTab.groupId)!.tabs!.push(currentTab);
        } else {
          const chromeTabGroup = await chrome.tabGroups.get(currentTab.groupId);
          tabGroupsMap.set(chromeTab.groupId, {
            id: chromeTabGroup.id,
            title: chromeTabGroup.title,
            color: chromeTabGroup.color,
            collapsed: chromeTabGroup.collapsed,
            windowId: chromeTabGroup.windowId,
            tabs: [currentTab],
            type: 'tabGroup',
          });
        }
      }

      if (currentTab.active) {
        if (currentTab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
          const tabGroup = tabGroupsMap.get(currentTab.groupId);
          if (tabGroup) {
            window.title = tabGroup.title;
          }
        } else {
          if (currentTab.title && currentTab.url !== 'chrome://newtab/') {
            window.title = currentTab.title;
          }
        }
      }
    }
    window.tabGroups!.push(...tabGroupsMap.values());
    return window;
  }

  public async createWindow(
    url: string | string[] | undefined,
    incognito: boolean = false,
    createData?: {
      width?: number;
      height?: number;
      left?: number;
      top?: number;
    },
  ): Promise<Window | undefined> {
    const window = await chrome.windows.create({
      url,
      incognito,
      ...createData,
    });
    if (window?.id) {
      return this.getWindow(window.id);
    }
    return undefined;
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
