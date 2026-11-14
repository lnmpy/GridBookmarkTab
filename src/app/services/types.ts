export type Type =
  | "bookmark"
  | "bookmarkFolder"
  | "tab"
  | "tabGroup"
  | "window";

export const AVAILABLE_THEMES = [
  "light",
  "dark",
] as const;

export type Theme = (typeof AVAILABLE_THEMES)[number];

// Glass effect presets; label is an i18n key
export const GLASS_PRESETS = [
  { label: "glassPresetThin", blur: 12, opacity: 80 },
  { label: "glassPresetStandard", blur: 20, opacity: 65 },
  { label: "glassPresetClear", blur: 32, opacity: 45 },
] as const;

export type GlassPreset = (typeof GLASS_PRESETS)[number];

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

export type SearchScope = "default" | "custom" | "root" | "all";

export type WallpaperType = "none" | "bing" | "custom" | "url";

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
  keyboardNavigation?: boolean; // arrows / hjkl to move, Enter to open
  searchShortcut: {
    modifiers: string[];
    key: string;
  };
  searchScope?: SearchScope;
  searchFolderWhitelist?: string[];
  dockEnabled?: boolean;
  dockFolderId?: string;
  dockIconSize?: number;

  // Wallpaper Settings
  wallpaperType?: WallpaperType;
  wallpaperCustomUrl?: string;
  wallpaperDim?: number; // 0 - 80, default 10
  wallpaperBlur?: number; // 0 - 20, default 0

  // Glass Effect Settings
  glassEnabled?: boolean;
  glassBlur?: number; // 0 - 40 px, default 20
  glassOpacity?: number; // 40 - 95 %, default 65
}
export interface Toast {
  id: number;
  message: string;
  type?: "info" | "success" | "warning" | "error";
  duration?: number; // milliseconds
  action?: ToastAction;
}

export interface ToastAction {
  label: string;
  run: () => void;
}

