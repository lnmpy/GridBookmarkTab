export type Type =
  | "bookmark"
  | "bookmarkFolder"
  | "tab"
  | "tabGroup"
  | "window";

export type TabGroupColor = `${chrome.tabGroups.Color}`;

export const AVAILABLE_THEMES = [
  "light",
  "dark",
] as const;

export type Theme = (typeof AVAILABLE_THEMES)[number];

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

export type SearchScope = "root" | "all" | "custom";

export interface HighlightSegment {
  text: string;
  isMatch: boolean;
}

export interface SearchResult {
  bookmark: Bookmark;
  score: number;
  path: string[];
  titleSegments: HighlightSegment[];
  urlSegments: HighlightSegment[];
}

export interface SearchScopeOptions {
  scope: SearchScope;
  whitelistFolderIds?: Set<string> | string[];
}

export interface Setting {
  theme: string;
  language: string; // 'auto' | 'en' | 'zh_CN' etc.

  bookmarkRootFolderId: string;
  bookmarkDisplayColumn: number;
  bookmarkSize: number;
  bookmarkOpenInNewTab: boolean;
  searchShortcut: {
    modifiers: string[];
    key: string;
  };
  searchScope?: SearchScope;
  searchFolderWhitelist?: string[];
}
export interface Toast {
  id: number;
  message: string;
  type?: "info" | "success" | "warning" | "error";
  duration?: number; // milliseconds
}
