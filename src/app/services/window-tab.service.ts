import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

import { Window, TabGroup, Tab } from '@app/services/types';

@Injectable({
  providedIn: 'root',
})
export class WindowTabService {
  private readonly windowsSource = new BehaviorSubject<Window[]>([]);
  public readonly windows$ = this.windowsSource.asObservable();

  constructor() {
    this.reloadWindows();
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

  private async reloadWindows(): Promise<void> {
    const chromeWindows = await chrome.windows.getAll();
    const windows = await Promise.all(
      chromeWindows.map(async (chromeWindow) =>
        this.getWindow(chromeWindow.id!),
      ),
    );
    this.windowsSource.next(windows);
  }

  public async deleteWindow(window: Window): Promise<void> {
    await chrome.windows.remove(window.id!);
    this.reloadWindows();
  }

  public async createTabGroup(
    tabIds: number[],
    title: string,
  ): Promise<number> {
    const groupId = await chrome.tabs.group({
      tabIds: tabIds as [number, ...number[]],
    });
    await chrome.tabGroups.update(groupId, { title });
    this.reloadWindows();
    return groupId;
  }

  public async focusTabGroup(tabGroup: TabGroup): Promise<void> {
    await chrome.windows
      .update(tabGroup.tabs![0].windowId, {
        focused: true,
      })
      .then(() => {
        chrome.tabs.update(tabGroup.tabs![0]!.id, { active: true });
      });
  }

  public async deleteTabGroup(tabGroup: TabGroup): Promise<void> {
    const tabs = await chrome.tabs.query({ groupId: tabGroup.id });
    const tabIds = tabs.map((t) => t.id!).filter(Boolean);
    await chrome.tabs.ungroup(tabIds as [number, ...number[]]);
    this.reloadWindows();
  }

  public async createTab(
    urls: string[],
    windowId: number = chrome.windows.WINDOW_ID_CURRENT,
    groupId: number = chrome.tabGroups.TAB_GROUP_ID_NONE,
    active: boolean = false,
  ): Promise<number[]> {
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
    await chrome.windows.update(windowId, {
      focused: true,
    });
    this.reloadWindows();
    return chromeTabs.map((t) => t.id!);
  }

  public async focusTab(tab: Tab): Promise<void> {
    await chrome.windows
      .update(tab.windowId, {
        focused: true,
      })
      .then(() => {
        chrome.tabs.update(tab.id, { active: true });
      });
  }

  public async moveTab(tabIds: number[], windowId: number): Promise<void> {
    await chrome.tabs.move(tabIds, {
      windowId,
      index: -1,
    });
    this.reloadWindows();
  }

  public async groupTab(
    tabIds: [number, ...number[]],
    groupId: number,
  ): Promise<void> {
    await chrome.tabs.group({
      tabIds,
      groupId,
    });
    this.reloadWindows();
  }

  public async deleteTab(tabIds: [number, ...number[]]): Promise<void> {
    await chrome.tabs.remove(tabIds);
    this.reloadWindows();
  }
}
