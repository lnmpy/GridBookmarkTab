import { Injectable, computed, signal } from '@angular/core';

export type ToolId =
  | 'calculator'
  | 'pomodoro'
  | 'qrCode'
  | 'colorPicker';

export interface ToolDefinition {
  id: ToolId;
  nameKey: string;
}

export interface ToolboxConfig {
  order: ToolId[];
  hiddenIds: ToolId[];
  pinnedIds: ToolId[];
}

export const DEFAULT_TOOL_ORDER: ToolId[] = [
  'calculator',
  'pomodoro',
  'qrCode',
  'colorPicker',
];

export const TOOL_CATALOG: Record<ToolId, ToolDefinition> = {
  calculator: { id: 'calculator', nameKey: 'toolCalculator' },
  pomodoro: { id: 'pomodoro', nameKey: 'toolPomodoro' },
  qrCode: { id: 'qrCode', nameKey: 'toolQrCode' },
  colorPicker: { id: 'colorPicker', nameKey: 'toolColorPicker' },
};

const CONFIG_STORAGE_KEY = 'gbk_toolbox_config_v1';
const TOOL_DATA_PREFIX = 'gbk_tool_data_';

@Injectable({
  providedIn: 'root',
})
export class ToolboxService {
  private readonly configSignal = signal<ToolboxConfig>(this.loadInitialConfig());

  readonly toolOrder = computed(() => this.configSignal().order);
  readonly hiddenToolIds = computed(() => this.configSignal().hiddenIds);
  readonly pinnedToolIds = computed(() => this.configSignal().pinnedIds);

  readonly allToolsOrdered = computed<ToolDefinition[]>(() =>
    this.toolOrder()
      .map((id) => TOOL_CATALOG[id])
      .filter((t): t is ToolDefinition => !!t),
  );

  readonly visibleTools = computed<ToolDefinition[]>(() => {
    const hidden = new Set(this.hiddenToolIds());
    return this.allToolsOrdered().filter((tool) => !hidden.has(tool.id));
  });

  readonly pinnedTools = computed<ToolDefinition[]>(() =>
    this.pinnedToolIds()
      .map((id) => TOOL_CATALOG[id])
      .filter((t): t is ToolDefinition => !!t),
  );

  constructor() {
    void this.syncFromChromeStorage();
  }

  private normalizeConfig(raw?: Partial<ToolboxConfig> | null): ToolboxConfig {
    const validIds = new Set<ToolId>(DEFAULT_TOOL_ORDER);
    const seen = new Set<ToolId>();
    const order: ToolId[] = [];

    for (const id of raw?.order ?? []) {
      if (validIds.has(id) && !seen.has(id)) {
        seen.add(id);
        order.push(id);
      }
    }
    for (const id of DEFAULT_TOOL_ORDER) {
      if (!seen.has(id)) {
        order.push(id);
      }
    }

    const hiddenIds = (raw?.hiddenIds ?? []).filter((id) => validIds.has(id));
    const pinnedIds = (raw?.pinnedIds ?? []).filter((id) => validIds.has(id));

    return { order, hiddenIds, pinnedIds };
  }

  private loadInitialConfig(): ToolboxConfig {
    try {
      if (typeof localStorage !== 'undefined') {
        const cached = localStorage.getItem(CONFIG_STORAGE_KEY);
        if (cached) {
          return this.normalizeConfig(JSON.parse(cached));
        }
      }
    } catch {
      // Ignore localStorage read errors
    }
    return this.normalizeConfig();
  }

  private async syncFromChromeStorage(): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const result = await chrome.storage.local.get(CONFIG_STORAGE_KEY);
        const stored = result?.[CONFIG_STORAGE_KEY] as Partial<ToolboxConfig> | undefined;
        if (stored) {
          const normalized = this.normalizeConfig(stored);
          this.configSignal.set(normalized);
          this.saveLocalCache(CONFIG_STORAGE_KEY, normalized);
        }
      }
    } catch {
      // Ignore chrome storage errors in test/non-extension environments
    }
  }

  private saveLocalCache(key: string, value: unknown): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(value));
      }
    } catch {
      // Ignore storage quota errors
    }
  }

  private async persistConfig(next: ToolboxConfig): Promise<void> {
    this.configSignal.set(next);
    this.saveLocalCache(CONFIG_STORAGE_KEY, next);
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await chrome.storage.local.set({ [CONFIG_STORAGE_KEY]: next });
      }
    } catch {
      // Ignore chrome storage errors
    }
  }

  isPinned(id: ToolId): boolean {
    return this.pinnedToolIds().includes(id);
  }

  isVisible(id: ToolId): boolean {
    return !this.hiddenToolIds().includes(id);
  }

  getToolDefinition(id: ToolId): ToolDefinition {
    return TOOL_CATALOG[id];
  }

  async togglePinToMenu(id: ToolId): Promise<boolean> {
    const current = this.configSignal();
    const exists = current.pinnedIds.includes(id);
    const pinnedIds = exists
      ? current.pinnedIds.filter((item) => item !== id)
      : [...current.pinnedIds, id];
    await this.persistConfig({ ...current, pinnedIds });
    return !exists;
  }

  async toggleToolVisibility(id: ToolId): Promise<void> {
    const current = this.configSignal();
    const isHidden = current.hiddenIds.includes(id);
    const hiddenIds = isHidden
      ? current.hiddenIds.filter((item) => item !== id)
      : [...current.hiddenIds, id];
    await this.persistConfig({ ...current, hiddenIds });
  }

  async reorderVisibleTools(previousIndex: number, currentIndex: number): Promise<void> {
    const visible = this.visibleTools();
    if (
      previousIndex === currentIndex ||
      previousIndex < 0 ||
      currentIndex < 0 ||
      previousIndex >= visible.length ||
      currentIndex >= visible.length
    ) {
      return;
    }

    const movedId = visible[previousIndex].id;
    const targetId = visible[currentIndex].id;
    const order = [...this.configSignal().order];
    const fromFullIdx = order.indexOf(movedId);
    const toFullIdx = order.indexOf(targetId);
    if (fromFullIdx === -1 || toFullIdx === -1) return;

    order.splice(fromFullIdx, 1);
    order.splice(toFullIdx, 0, movedId);

    await this.persistConfig({ ...this.configSignal(), order });
  }

  async resetDefaults(): Promise<void> {
    await this.persistConfig(this.normalizeConfig());
  }

  loadToolData<T>(key: string, fallback: T): T {
    const storageKey = `${TOOL_DATA_PREFIX}${key}`;
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          return JSON.parse(raw) as T;
        }
      }
    } catch {
      // Ignore parse errors
    }
    return fallback;
  }

  async loadToolDataAsync<T>(key: string, fallback: T): Promise<T> {
    const storageKey = `${TOOL_DATA_PREFIX}${key}`;
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const result = await chrome.storage.local.get(storageKey);
        if (result && result[storageKey] !== undefined) {
          this.saveLocalCache(storageKey, result[storageKey]);
          return result[storageKey] as T;
        }
      }
    } catch {
      // Ignore chrome storage errors
    }
    return this.loadToolData(key, fallback);
  }

  async saveToolData<T>(key: string, data: T): Promise<void> {
    const storageKey = `${TOOL_DATA_PREFIX}${key}`;
    this.saveLocalCache(storageKey, data);
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await chrome.storage.local.set({ [storageKey]: data });
      }
    } catch {
      // Ignore chrome storage errors
    }
  }

  getCalculatorDefaultContent(): string {
    return this.loadToolData<string>('calculator_default_content', '');
  }

  async getCalculatorDefaultContentAsync(): Promise<string> {
    return this.loadToolDataAsync<string>('calculator_default_content', '');
  }

  async setCalculatorDefaultContent(content: string): Promise<void> {
    await this.saveToolData<string>('calculator_default_content', content);
  }
}
