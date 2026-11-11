// Global setup for Vitest: the Angular unit-test builder initializes TestBed itself
import { vi } from 'vitest';

// Mock chrome extension APIs globally for unit testing environment
function createChromeMock() {
  const mockEvent = () => ({
    addListener: vi.fn(),
    removeListener: vi.fn(),
    hasListener: vi.fn().mockReturnValue(false),
  });

  return {
    runtime: {
      getURL: vi.fn().mockImplementation((path: string) => `chrome-extension://dummy-id${path}`),
      lastError: null,
      id: 'dummy-extension-id',
      sendMessage: vi.fn().mockReturnValue(Promise.resolve()),
      openOptionsPage: vi.fn().mockReturnValue(Promise.resolve()),
      onMessage: mockEvent(),
    },
    storage: {
      local: {
        get: vi.fn().mockReturnValue(Promise.resolve({})),
        set: vi.fn().mockReturnValue(Promise.resolve()),
        remove: vi.fn().mockReturnValue(Promise.resolve()),
        clear: vi.fn().mockReturnValue(Promise.resolve()),
      },
      sync: {
        get: vi.fn().mockReturnValue(Promise.resolve({})),
        set: vi.fn().mockReturnValue(Promise.resolve()),
        remove: vi.fn().mockReturnValue(Promise.resolve()),
        clear: vi.fn().mockReturnValue(Promise.resolve()),
      },
    },
    bookmarks: {
      getTree: vi.fn().mockReturnValue(Promise.resolve([])),
      getSubTree: vi.fn().mockReturnValue(Promise.resolve([])),
      get: vi.fn().mockReturnValue(Promise.resolve([])),
      create: vi.fn().mockReturnValue(Promise.resolve({ id: 'new-id' })),
      update: vi.fn().mockReturnValue(Promise.resolve({})),
      move: vi.fn().mockReturnValue(Promise.resolve({})),
      remove: vi.fn().mockReturnValue(Promise.resolve()),
      removeTree: vi.fn().mockReturnValue(Promise.resolve()),
      search: vi.fn().mockReturnValue(Promise.resolve([])),
      onCreated: mockEvent(),
      onRemoved: mockEvent(),
      onChanged: mockEvent(),
      onMoved: mockEvent(),
      onChildrenReordered: mockEvent(),
    },
    tabs: {
      query: vi.fn().mockReturnValue(Promise.resolve([])),
      create: vi.fn().mockReturnValue(Promise.resolve({})),
      update: vi.fn().mockReturnValue(Promise.resolve({})),
      remove: vi.fn().mockReturnValue(Promise.resolve()),
      group: vi.fn().mockReturnValue(Promise.resolve(1)),
      ungroup: vi.fn().mockReturnValue(Promise.resolve()),
      move: vi.fn().mockReturnValue(Promise.resolve({})),
      onCreated: mockEvent(),
      onRemoved: mockEvent(),
      onUpdated: mockEvent(),
      onMoved: mockEvent(),
      onActivated: mockEvent(),
    },
    tabGroups: {
      query: vi.fn().mockReturnValue(Promise.resolve([])),
      get: vi.fn().mockReturnValue(Promise.resolve({})),
      update: vi.fn().mockReturnValue(Promise.resolve({})),
      move: vi.fn().mockReturnValue(Promise.resolve({})),
    },
    windows: {
      getAll: vi.fn().mockReturnValue(Promise.resolve([])),
      getCurrent: vi.fn().mockReturnValue(Promise.resolve({})),
      create: vi.fn().mockReturnValue(Promise.resolve({})),
      remove: vi.fn().mockReturnValue(Promise.resolve()),
      onCreated: mockEvent(),
      onRemoved: mockEvent(),
      onFocusChanged: mockEvent(),
    },
    i18n: {
      getUILanguage: vi.fn().mockReturnValue('zh-CN'),
      getMessage: vi.fn().mockImplementation((key: string) => key),
    },
  };
}

(globalThis as unknown as { chrome: unknown }).chrome = createChromeMock();

