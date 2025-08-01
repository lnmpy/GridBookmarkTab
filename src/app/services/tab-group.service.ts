import { Injectable } from '@angular/core';

export interface Tab {
  id?: number;
  title?: string;
  url?: string;
  favIconUrl?: string;

  index: number; // index of the window
  windowId: number;
  groupId: number;
  openerTabId?: number; // parentTabId
  pinned: boolean;
  active: boolean; // current active tab
}

export interface TabGroup {
  id: number;
  title: string | undefined;
  collapsed: boolean;
  color: `${chrome.tabGroups.Color}`;
  windowId: number;
  tabs?: Tab[];
}

@Injectable({
  providedIn: 'root',
})
export class TabGroupService {
  private tabGroups: Map<number, TabGroup> = new Map();

  public async getTabGroups(): Promise<TabGroup[]> {
    this.tabGroups = await this.initWithCurrentActiveTabs();
    return Array.from(this.tabGroups.values());
  }

  public async create(
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

  private async initWithCurrentActiveTabs(): Promise<Map<number, TabGroup>> {
    const tabGroups: Map<number, TabGroup> = new Map();

    const chromeTabs = await chrome.tabs.query({});
    for (const chromeTab of chromeTabs) {
      if (chromeTab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) continue;
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

      if (!tabGroups.has(currentTab.groupId)) {
        const chromeTabGroup = await chrome.tabGroups.get(currentTab.groupId);
        tabGroups.set(chromeTab.groupId, {
          id: chromeTabGroup.id,
          title: chromeTabGroup.title,
          color: chromeTabGroup.color,
          collapsed: chromeTabGroup.collapsed,
          windowId: chromeTabGroup.windowId,
          tabs: [currentTab],
        });
      } else {
        tabGroups.get(currentTab.groupId)!.tabs!.push(currentTab);
      }
    }
    return tabGroups;
  }

  public async update(
    groupId: number,
    title: string,
    color: chrome.tabGroups.Color,
  ) {
    await chrome.tabGroups.update(groupId, { title, color });
    if (chrome.runtime.lastError) {
      throw chrome.runtime.lastError;
    }
  }

  public async delete(groupId: number, tabId: number) {
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
