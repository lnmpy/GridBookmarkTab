export type Type =
  | 'bookmark'
  | 'bookmarkFolder'
  | 'tab'
  | 'tabGroup'
  | 'window';

export type TabGroupColor = `${chrome.tabGroups.Color}`;

export interface Bookmark {
  id: string;
  parentId?: string;
  index?: number;
  url?: string;
  title: string;
  dateAdded?: number;
  dateGroupModified?: number;
  children?: Bookmark[];
  type: Type;
  favIconUrl?: string;
  depth?: number;
}

export interface Tab {
  id: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
  index: number;
  windowId: number;
  groupId: number;
  openerTabId?: number;
  pinned: boolean;
  active: boolean;
  type: Type;
}

export interface TabGroup {
  id: number;
  title: string | undefined;
  collapsed: boolean;
  color: `${chrome.tabGroups.Color}`;
  windowId: number;
  tabs?: Tab[];
  type: Type;
}

export interface Window {
  id?: number;
  title?: string;
  tabsCount: number;
  focused: boolean;
  incognito: boolean;
  tabs: Tab[];
  tabGroups: TabGroup[];
  type: Type;
}

export interface Setting {
  theme: string;

  bookmarkRootFolderId: string;
  bookmarkDisplayColumn: number;
  bookmarkDisplayGap: number;
  bookmarkDisplayRowHeight: number;
  bookmarkOpenInNewTab: boolean;

  activeTabsDisplay: boolean;
}
export interface Toast {
  id: number;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  duration?: number; // milliseconds
}
