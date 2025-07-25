import { Injectable } from '@angular/core';

type TabGroupInfo = {
  group: chrome.tabGroups.TabGroup;
  tabs: chrome.tabs.Tab[];
};

@Injectable({
  providedIn: 'root',
})
export class TabGroupManager {
  async getCurrentWindowId(): Promise<number> {
    const win = await chrome.windows.getCurrent();
    return win.id!;
  }

  async listAllGroups(): Promise<TabGroupInfo[]> {
    const groups = await chrome.tabGroups.query({});

    const result: TabGroupInfo[] = [];

    for (const group of groups) {
      const tabs = await chrome.tabs.query({ groupId: group.id });
      result.push({ group, tabs });
    }

    return result;
  }

  async createTabGroup(
    tabUrls: string[],
    title?: string,
    color?: chrome.tabGroups.Color,
  ): Promise<TabGroupInfo> {
    // 1. 创建 tabs
    const createdTabs = await Promise.all(
      tabUrls.map((url) => chrome.tabs.create({ url, active: false })),
    );

    const tabIds: number[] | undefined = createdTabs.map((t) => t.id!);
    if (tabIds.length === 0) {
      throw new Error('创建 tab 失败');
    }

    // 2. 将 tabs 分组
    const groupOptions: chrome.tabs.GroupOptions = {
      tabIds: tabIds as [number, ...number[]],
    };
    const groupId = await chrome.tabs.group(groupOptions);

    // 3. 设置分组属性
    await chrome.tabGroups.update(groupId, {
      title: title ?? '新分组',
      color: color ?? 'blue',
    });

    return {
      group: await chrome.tabGroups.get(groupId),
      tabs: createdTabs,
    };
  }

  async updateGroup(
    groupId: number,
    title?: string,
    color?: chrome.tabGroups.Color,
  ): Promise<void> {
    await chrome.tabGroups.update(groupId, {
      ...(title ? { title } : {}),
      ...(color ? { color } : {}),
    });
  }

  async moveTabToGroup(tabId: number, targetGroupId: number): Promise<void> {
    await chrome.tabs.group({ groupId: targetGroupId, tabIds: [tabId] });
  }

  async removeTab(tabId: number): Promise<void> {
    await chrome.tabs.remove(tabId);
  }

  async closeGroup(groupId: number): Promise<void> {
    const tabs = await chrome.tabs.query({ groupId });
    const tabIds = tabs.map((tab) => tab.id!).filter(Boolean);
    await chrome.tabs.remove(tabIds);
  }
}
