// This file is required by karma.conf.js and loads recursively all the .spec and framework files

import 'zone.js/testing';
import { getTestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';

// First, initialize the Angular testing environment.
getTestBed().initTestEnvironment(
  BrowserTestingModule,
  platformBrowserTesting(),
);

// Mock chrome extension APIs globally for unit testing environment
function createChromeMock() {
  const mockEvent = () => ({
    addListener: jasmine.createSpy('addListener'),
    removeListener: jasmine.createSpy('removeListener'),
    hasListener: jasmine.createSpy('hasListener').and.returnValue(false),
  });

  return {
    runtime: {
      getURL: jasmine.createSpy('chrome.runtime.getURL').and.callFake((path: string) => `chrome-extension://dummy-id${path}`),
      lastError: null,
      id: 'dummy-extension-id',
      sendMessage: jasmine.createSpy('chrome.runtime.sendMessage').and.returnValue(Promise.resolve()),
      onMessage: mockEvent(),
    },
    storage: {
      local: {
        get: jasmine.createSpy('chrome.storage.local.get').and.returnValue(Promise.resolve({})),
        set: jasmine.createSpy('chrome.storage.local.set').and.returnValue(Promise.resolve()),
        remove: jasmine.createSpy('chrome.storage.local.remove').and.returnValue(Promise.resolve()),
        clear: jasmine.createSpy('chrome.storage.local.clear').and.returnValue(Promise.resolve()),
      },
      sync: {
        get: jasmine.createSpy('chrome.storage.sync.get').and.returnValue(Promise.resolve({})),
        set: jasmine.createSpy('chrome.storage.sync.set').and.returnValue(Promise.resolve()),
        remove: jasmine.createSpy('chrome.storage.sync.remove').and.returnValue(Promise.resolve()),
        clear: jasmine.createSpy('chrome.storage.sync.clear').and.returnValue(Promise.resolve()),
      },
    },
    bookmarks: {
      getTree: jasmine.createSpy('chrome.bookmarks.getTree').and.returnValue(Promise.resolve([])),
      getSubTree: jasmine.createSpy('chrome.bookmarks.getSubTree').and.returnValue(Promise.resolve([])),
      get: jasmine.createSpy('chrome.bookmarks.get').and.returnValue(Promise.resolve([])),
      create: jasmine.createSpy('chrome.bookmarks.create').and.returnValue(Promise.resolve({ id: 'new-id' })),
      update: jasmine.createSpy('chrome.bookmarks.update').and.returnValue(Promise.resolve({})),
      move: jasmine.createSpy('chrome.bookmarks.move').and.returnValue(Promise.resolve({})),
      remove: jasmine.createSpy('chrome.bookmarks.remove').and.returnValue(Promise.resolve()),
      removeTree: jasmine.createSpy('chrome.bookmarks.removeTree').and.returnValue(Promise.resolve()),
      search: jasmine.createSpy('chrome.bookmarks.search').and.returnValue(Promise.resolve([])),
      onCreated: mockEvent(),
      onRemoved: mockEvent(),
      onChanged: mockEvent(),
      onMoved: mockEvent(),
      onChildrenReordered: mockEvent(),
    },
    tabs: {
      query: jasmine.createSpy('chrome.tabs.query').and.returnValue(Promise.resolve([])),
      create: jasmine.createSpy('chrome.tabs.create').and.returnValue(Promise.resolve({})),
      update: jasmine.createSpy('chrome.tabs.update').and.returnValue(Promise.resolve({})),
      remove: jasmine.createSpy('chrome.tabs.remove').and.returnValue(Promise.resolve()),
      group: jasmine.createSpy('chrome.tabs.group').and.returnValue(Promise.resolve(1)),
      ungroup: jasmine.createSpy('chrome.tabs.ungroup').and.returnValue(Promise.resolve()),
      move: jasmine.createSpy('chrome.tabs.move').and.returnValue(Promise.resolve({})),
      onCreated: mockEvent(),
      onRemoved: mockEvent(),
      onUpdated: mockEvent(),
      onMoved: mockEvent(),
      onActivated: mockEvent(),
    },
    tabGroups: {
      query: jasmine.createSpy('chrome.tabGroups.query').and.returnValue(Promise.resolve([])),
      get: jasmine.createSpy('chrome.tabGroups.get').and.returnValue(Promise.resolve({})),
      update: jasmine.createSpy('chrome.tabGroups.update').and.returnValue(Promise.resolve({})),
      move: jasmine.createSpy('chrome.tabGroups.move').and.returnValue(Promise.resolve({})),
    },
    windows: {
      getAll: jasmine.createSpy('chrome.windows.getAll').and.returnValue(Promise.resolve([])),
      getCurrent: jasmine.createSpy('chrome.windows.getCurrent').and.returnValue(Promise.resolve({})),
      create: jasmine.createSpy('chrome.windows.create').and.returnValue(Promise.resolve({})),
      remove: jasmine.createSpy('chrome.windows.remove').and.returnValue(Promise.resolve()),
      onCreated: mockEvent(),
      onRemoved: mockEvent(),
      onFocusChanged: mockEvent(),
    },
    i18n: {
      getUILanguage: jasmine.createSpy('chrome.i18n.getUILanguage').and.returnValue('zh-CN'),
      getMessage: jasmine.createSpy('chrome.i18n.getMessage').and.callFake((key: string) => key),
    },
  };
}

(globalThis as any).chrome = createChromeMock();

