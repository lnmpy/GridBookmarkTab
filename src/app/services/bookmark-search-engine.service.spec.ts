import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';
import { BookmarkSearchEngineService } from './bookmark-search-engine.service';
import { BookmarkService } from './bookmark.service';
import { SettingsService } from './settings.service';
import { Bookmark, Setting } from './types';

describe('BookmarkSearchEngineService', () => {
  let service: BookmarkSearchEngineService;
  let mockBookmarkService: jasmine.SpyObj<BookmarkService>;
  let mockSettingsService: any;

  const mockRootTree: Bookmark = {
    id: 'root-1',
    title: 'Root Folder',
    type: 'bookmarkFolder',
    children: [
      {
        id: 'bm-1',
        title: 'Google Search',
        url: 'https://google.com',
        type: 'bookmark',
      },
      {
        id: 'bm-2',
        title: 'GitHub Repository',
        url: 'https://github.com',
        type: 'bookmark',
      },
      {
        id: 'folder-a',
        title: 'Folder A',
        type: 'bookmarkFolder',
        children: [
          {
            id: 'bm-3',
            title: 'YouTube Media',
            url: 'https://youtube.com',
            type: 'bookmark',
          },
        ],
      },
      {
        id: 'folder-b',
        title: 'Folder B',
        type: 'bookmarkFolder',
        children: [
          {
            id: 'bm-4',
            title: 'GitLab DevOps',
            url: 'https://gitlab.com',
            type: 'bookmark',
          },
        ],
      },
    ],
  };

  const mockFullTree: Bookmark = {
    id: '0',
    title: 'Chrome Root',
    type: 'bookmarkFolder',
    children: [
      mockRootTree,
      {
        id: 'folder-c',
        title: 'Folder C (Other Bookmarks)',
        type: 'bookmarkFolder',
        children: [
          {
            id: 'bm-5',
            title: 'Stack Overflow Developer Community',
            url: 'https://stackoverflow.com',
            type: 'bookmark',
          },
        ],
      },
    ],
  };

  const defaultSetting: Setting = {
    bookmarkRootFolderId: 'root-1',
    theme: 'light',
    language: 'zh_CN',
    bookmarkDisplayColumn: 7,
    bookmarkSize: 80,
    bookmarkOpenInNewTab: true,
    searchShortcut: { modifiers: [], key: ' ' },
    searchScope: 'root',
    searchFolderWhitelist: [],
  };

  beforeEach(() => {
    mockBookmarkService = jasmine.createSpyObj('BookmarkService', [
      'getAllBookmarkFolders',
      'getFoldersFromNode',
      'getFullBookmarkTree',
    ], {
      bookmarks$: of(mockRootTree),
    });
    mockBookmarkService.getAllBookmarkFolders.and.resolveTo([
      { id: 'root-1', title: 'Root Folder', type: 'bookmarkFolder', depth: 0 },
      { id: 'folder-a', title: 'Folder A', type: 'bookmarkFolder', depth: 1 },
      { id: 'folder-b', title: 'Folder B', type: 'bookmarkFolder', depth: 1 },
      { id: 'folder-c', title: 'Folder C', type: 'bookmarkFolder', depth: 1 },
    ]);
    mockBookmarkService.getFoldersFromNode.and.returnValue([
      { id: 'root-1', title: 'Root Folder', type: 'bookmarkFolder', depth: 0 },
      { id: 'folder-a', title: 'Folder A', type: 'bookmarkFolder', depth: 1 },
      { id: 'folder-b', title: 'Folder B', type: 'bookmarkFolder', depth: 1 },
      { id: 'folder-c', title: 'Folder C', type: 'bookmarkFolder', depth: 1 },
    ]);
    mockBookmarkService.getFullBookmarkTree.and.resolveTo(mockFullTree);

    mockSettingsService = {
      settingsSource: new BehaviorSubject<Setting>(defaultSetting),
      onSettingsChange: () => of(defaultSetting),
    };

    TestBed.configureTestingModule({
      providers: [
        BookmarkSearchEngineService,
        { provide: BookmarkService, useValue: mockBookmarkService },
        { provide: SettingsService, useValue: mockSettingsService },
      ],
    });

    service = TestBed.inject(BookmarkSearchEngineService);
  });

  it('should be created and index root scope initially', () => {
    expect(service).toBeTruthy();
    const scopeBookmarks = service.getScopeBookmarks();
    expect(scopeBookmarks.length).toBe(4);
    const titles = scopeBookmarks.map((b) => b.title);
    expect(titles).toEqual(['Google Search', 'GitHub Repository', 'YouTube Media', 'GitLab DevOps']);
  });

  describe('fuzzyMatch and scoring algorithm', () => {
    it('should return score 0 for empty query or empty text', () => {
      expect(service.fuzzyMatch('', 'Google').score).toBe(0);
      expect(service.fuzzyMatch('test', '').score).toBe(0);
    });

    it('should return 0 when query character is not present in text', () => {
      const match = service.fuzzyMatch('xyz', 'Google');
      expect(match.score).toBe(0);
      expect(match.matchedIndices.length).toBe(0);
    });

    it('should match characters in sequential order and award prefix bonus', () => {
      const match = service.fuzzyMatch('goog', 'google search');
      expect(match.score).toBeGreaterThan(50);
      expect(match.matchedIndices).toEqual([0, 1, 2, 3]);
    });

    it('should reward consecutive matches and word boundary matches', () => {
      const boundaryMatch = service.fuzzyMatch('search', 'google search');
      expect(boundaryMatch.matchedIndices).toEqual([7, 8, 9, 10, 11, 12]);
      expect(boundaryMatch.score).toBeGreaterThan(30);
    });
  });

  describe('createHighlightSegments', () => {
    it('should return entire text as non-match when no indices matched', () => {
      const segments = service.createHighlightSegments('Google', []);
      expect(segments).toEqual([{ text: 'Google', isMatch: false }]);
    });

    it('should return single matching segment for full match', () => {
      const segments = service.createHighlightSegments('Git', [0, 1, 2]);
      expect(segments).toEqual([{ text: 'Git', isMatch: true }]);
    });

    it('should split text into exact alternating matched and non-matched segments', () => {
      // 'GitHub' matching 'it' at index 1, 2
      const segments = service.createHighlightSegments('GitHub', [1, 2]);
      expect(segments).toEqual([
        { text: 'G', isMatch: false },
        { text: 'it', isMatch: true },
        { text: 'Hub', isMatch: false },
      ]);
    });
  });

  describe('Search Scope & Filtering', () => {
    it('should index default root scope', async () => {
      await service.init();
      service.setScope('default');

      const scopeBookmarks = service.getScopeBookmarks();
      expect(scopeBookmarks.length).toBe(4);
      const titles = scopeBookmarks.map((b) => b.title);
      expect(titles).toEqual(['Google Search', 'GitHub Repository', 'YouTube Media', 'GitLab DevOps']);
    });

    it('should filter by custom whitelist folder IDs', async () => {
      await service.init();
      service.setScope('custom', new Set(['folder-a']));

      const scopeBookmarks = service.getScopeBookmarks();
      expect(scopeBookmarks.length).toBe(1);
      expect(scopeBookmarks[0].title).toBe('YouTube Media');
    });

    it('should support multiple custom whitelist folders', async () => {
      await service.init();
      service.setScope('custom', ['folder-a', 'folder-b']);

      const scopeBookmarks = service.getScopeBookmarks();
      expect(scopeBookmarks.length).toBe(2);
      expect(scopeBookmarks.map((b) => b.title)).toEqual(['YouTube Media', 'GitLab DevOps']);
    });
  });

  describe('search execution & ranking', () => {
    it('should return empty results for empty query', () => {
      expect(service.search('')).toEqual([]);
      expect(service.search('   ')).toEqual([]);
    });

    it('should rank exact and title matches higher due to 2x title weight', () => {
      const results = service.search('git');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].bookmark.title).toMatch(/Git/);
      expect(results[0].titleSegments.length).toBeGreaterThan(0);
    });

    it('should attach ancestral path to search results', () => {
      const results = service.search('youtube');
      expect(results.length).toBe(1);
      expect(results[0].path).toEqual(['Root Folder', 'Folder A', 'YouTube Media']);
    });
  });
});
