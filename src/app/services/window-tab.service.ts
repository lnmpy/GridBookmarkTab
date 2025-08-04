import { Injectable } from '@angular/core';

export interface Tab {
  id?: number;
  title?: string;
  url?: string;
  favIconUrl?: string;

  index: number;
  windowId: number;
  groupId: number;
  openerTabId?: number;
  pinned: boolean;
  active: boolean;
}

export interface TabGroup {
  id: number;
  title: string | undefined;
  collapsed: boolean;
  color: `${chrome.tabGroups.Color}`;
  windowId: number;
  tabs?: Tab[];
}

export interface Window {
  id?: number;
  title?: string;
  tabsCount: number;
  focused: boolean;
  incognito: boolean;
  tabs: Tab[];
  tabGroups: TabGroup[];
}

@Injectable({
  providedIn: 'root',
})
export class WindowTabService {
  windows: Window[] = [];

  public async getWindows(): Promise<Window[]> {
    const chromeWindows = await chrome.windows.getAll();
    this.windows = await Promise.all(
      chromeWindows.map(async (chromeWindow) =>
        this.getWindow(chromeWindow.id!),
      ),
    );
    return this.windows;
  }

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
    };
    const tabGroupsMap: Map<number, TabGroup> = new Map();
    const chromeTabs = await chrome.tabs.query({ windowId });
    for (const chromeTab of chromeTabs) {
      const currentTab: Tab = {
        id: chromeTab.id,
        url: chromeTab.url,
        title: chromeTab.title,
        favIconUrl: chromeTab.favIconUrl,
        index: chromeTab.index,
        windowId: chromeTab.windowId,
        groupId: chromeTab.groupId,
        active: chromeTab.active,
        pinned: chromeTab.pinned,
        openerTabId: chromeTab.openerTabId,
      };
      window.tabsCount++;
      if (
        currentTab.active &&
        currentTab.title &&
        currentTab.url !== 'chrome://newtab/'
      ) {
        window.title = currentTab.title;
      }

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
          });
        }
      }
    }
    window.tabGroups!.push(...tabGroupsMap.values());
    return window;
  }

  public async create(
    windowId: number,
    tabIds: number[],
    title: string,
    color: chrome.tabGroups.Color,
  ): Promise<number> {
    const groupId = await chrome.tabs.group({
      tabIds: tabIds as [number, ...number[]],
    });
    if (chrome.runtime.lastError) {
      throw chrome.runtime.lastError;
    }
    await chrome.tabGroups.update(groupId, { title, color });
    if (chrome.runtime.lastError) {
      throw chrome.runtime.lastError;
    }
    return groupId;
  }

  public async delete(windowId: number, groupId: number, tabId: number) {
    if (windowId !== null) {
      await chrome.windows.remove(windowId);
      if (chrome.runtime.lastError) {
        throw chrome.runtime.lastError;
      }
      console.log(`delete group ${groupId} tabId: ${tabId}`);
      return;
    }
    if (tabId !== null) {
      await chrome.tabs.ungroup(tabId);
      if (chrome.runtime.lastError) {
        throw chrome.runtime.lastError;
      }
      console.log(`delete group ${groupId} tabId: ${tabId}`);
      return;
    }
    const tabs = await chrome.tabs.query({ groupId });
    const tabIds = tabs.map((t) => t.id!).filter(Boolean);
    await chrome.tabs.ungroup(tabIds as [number, ...number[]]);
    if (chrome.runtime.lastError) {
      return;
    }

    console.log(`delete group ${groupId} tabIds: ${tabIds}`);
  }
}
