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

  public async delete(
    window?: Window,
    tabGroup?: TabGroup,
    tab?: Tab,
  ): Promise<void> {
    if (tab) {
      await chrome.tabs.remove(tab.id!);
    } else if (tabGroup) {
      const tabs = await chrome.tabs.query({ groupId: tabGroup.id });
      const tabIds = tabs.map((t) => t.id!).filter(Boolean);
      await chrome.tabs.ungroup(tabIds as [number, ...number[]]);
    } else if (window) {
      await chrome.windows.remove(window.id!);
    }
    this.reloadWindows();
  }
}
