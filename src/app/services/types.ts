export type BookmarkType = 'bookmark' | 'bookmarkFolder';

export interface Bookmark {
  id: string;
  parentId?: string;
  index?: number;
  url?: string;
  title: string;
  dateAdded?: number;
  dateGroupModified?: number;
  children?: Bookmark[];
  type: BookmarkType;
  favIconUrl?: string;

  deleted?: boolean;
}

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
  closed?: boolean;
}

export interface TabGroup {
  id: number;
  title: string | undefined;
  collapsed: boolean;
  color: `${chrome.tabGroups.Color}`;
  windowId: number;
  tabs?: Tab[];
  closed?: boolean;
}

export interface Window {
  id?: number;
  title?: string;
  tabsCount: number;
  focused: boolean;
  incognito: boolean;
  tabs: Tab[];
  tabGroups: TabGroup[];
  closed?: boolean;
}

export interface Setting {
  rootFolderId: string;
  columns: number;
  openBookmarkInCurrentTab: boolean;
  showActiveWindows: boolean;
}
export interface Toast {
  id: number;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  duration?: number; // milliseconds
}
