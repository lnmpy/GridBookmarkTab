import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, of } from 'rxjs';

import { BookmarkSearchModalComponent } from './bookmark-search-modal.component';
import { ModalService } from '@app/services/modal.service';
import { BookmarkService } from '@app/services/bookmark.service';
import { SettingsService } from '@app/services/settings.service';
import { I18nService } from '@app/services/i18n.service';
import { Bookmark, Setting } from '@app/services/types';

describe('BookmarkSearchModalComponent', () => {
  let component: BookmarkSearchModalComponent;
  let fixture: ComponentFixture<BookmarkSearchModalComponent>;
  let mockModalService: jasmine.SpyObj<ModalService>;
  let mockBookmarkService: jasmine.SpyObj<BookmarkService>;
  let mockSettingsService: any;
  let mockI18nService: jasmine.SpyObj<I18nService>;

  const mockBookmarks: Bookmark = {
    id: 'root',
    title: 'Root',
    type: 'bookmarkFolder',
    children: [
      {
        id: '1',
        title: 'Google',
        url: 'https://google.com',
        type: 'bookmark',
        favIconUrl: 'https://google.com/favicon.ico',
      },
      {
        id: '2',
        title: 'GitHub',
        url: 'https://github.com',
        type: 'bookmark',
        favIconUrl: 'https://github.com/favicon.ico',
      },
      {
        id: '3',
        title: 'Folder A',
        type: 'bookmarkFolder',
        children: [
          {
            id: '4',
            title: 'YouTube',
            url: 'https://youtube.com',
            type: 'bookmark',
            favIconUrl: 'https://youtube.com/favicon.ico',
          },
        ],
      },
      {
        id: '5',
        title: 'Folder B',
        type: 'bookmarkFolder',
        children: [
          {
            id: '6',
            title: 'GitLab',
            url: 'https://gitlab.com',
            type: 'bookmark',
            favIconUrl: 'https://gitlab.com/favicon.ico',
          },
        ],
      },
    ],
  };

  const defaultSetting: Setting = {
    bookmarkRootFolderId: 'root',
    theme: 'light',
    language: 'zh_CN',
    bookmarkDisplayColumn: 7,
    bookmarkSize: 80,
    bookmarkOpenInNewTab: true,
    searchShortcut: { modifiers: [], key: ' ' },
    searchScope: 'root',
    searchFolderWhitelist: [],
  };

  beforeEach(async () => {
    mockModalService = jasmine.createSpyObj('ModalService', ['close']);
    mockBookmarkService = jasmine.createSpyObj('BookmarkService', [
      'getAllBookmarkFolders',
      'getFoldersFromNode',
    ], {
      bookmarks$: of(mockBookmarks),
    });
    mockBookmarkService.getAllBookmarkFolders.and.resolveTo([
      { id: 'root', title: 'Root', type: 'bookmarkFolder', depth: 0 },
      { id: '3', title: 'Folder A', type: 'bookmarkFolder', depth: 1 },
      { id: '5', title: 'Folder B', type: 'bookmarkFolder', depth: 1 },
    ]);
    mockBookmarkService.getFoldersFromNode.and.returnValue([
      { id: 'root', title: 'Root', type: 'bookmarkFolder', depth: 0 },
      { id: '3', title: 'Folder A', type: 'bookmarkFolder', depth: 1 },
      { id: '5', title: 'Folder B', type: 'bookmarkFolder', depth: 1 },
    ]);

    mockSettingsService = {
      settingsSource: new BehaviorSubject<Setting>(defaultSetting),
      onSettingsChange: () => of(defaultSetting),
    };

    mockI18nService = jasmine.createSpyObj('I18nService', ['t', 'getMessage']);
    mockI18nService.t.and.callFake((key: string) => key);
    mockI18nService.getMessage.and.callFake((key: string) => key);

    await TestBed.configureTestingModule({
      imports: [BookmarkSearchModalComponent, FormsModule],
      providers: [
        { provide: ModalService, useValue: mockModalService },
        { provide: BookmarkService, useValue: mockBookmarkService },
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: I18nService, useValue: mockI18nService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BookmarkSearchModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should flatten bookmarks on init with root scope', () => {
    expect(component.allBookmarks.length).toBe(4);
    expect(component.allBookmarks[0].title).toBe('Google');
    expect(component.allBookmarks[1].title).toBe('GitHub');
    expect(component.allBookmarks[2].title).toBe('YouTube');
    expect(component.allBookmarks[3].title).toBe('GitLab');
  });

  it('should filter bookmarks by custom whitelist folders', () => {
    component.setSearchScope('custom');
    component.selectedFolderIds = new Set(['3']); // Only Folder A
    component.refreshScopeBookmarks();

    expect(component.allBookmarks.length).toBe(1);
    expect(component.allBookmarks[0].title).toBe('YouTube');
  });

  it('should support multiple folders in whitelist', () => {
    component.setSearchScope('custom');
    component.selectedFolderIds = new Set(['3', '5']); // Folder A and Folder B
    component.refreshScopeBookmarks();

    expect(component.allBookmarks.length).toBe(2);
    expect(component.allBookmarks.map((b) => b.title)).toEqual(['YouTube', 'GitLab']);
  });

  it('should toggle folder selection correctly', () => {
    component.setSearchScope('custom');
    component.selectedFolderIds = new Set(['3']);

    component.toggleFolderSelection('5');
    expect(component.selectedFolderIds.has('5')).toBeTrue();

    component.toggleFolderSelection('3');
    expect(component.selectedFolderIds.has('3')).toBeFalse();
  });

  it('should select all folders and clear selection', () => {
    component.availableFolders = [
      { id: 'root', title: 'Root', type: 'bookmarkFolder' },
      { id: '3', title: 'Folder A', type: 'bookmarkFolder' },
      { id: '5', title: 'Folder B', type: 'bookmarkFolder' },
    ];

    component.selectAllFolders();
    expect(component.selectedFolderIds.size).toBe(3);

    component.clearFolderSelection();
    expect(component.selectedFolderIds.size).toBe(0);
  });

  it('should search bookmarks with exact match', () => {
    component.searchQuery = 'Google';
    component.onSearchChange();

    expect(component.searchResults.length).toBeGreaterThan(0);
    expect(component.searchResults[0].bookmark.title).toBe('Google');
  });

  it('should search bookmarks with fuzzy match', () => {
    component.searchQuery = 'git';
    component.onSearchChange();

    expect(component.searchResults.length).toBeGreaterThan(0);
    const titles = component.searchResults.map((r) => r.bookmark.title);
    expect(titles).toContain('GitHub');
  });

  it('should clear results when search query is empty', () => {
    component.searchQuery = 'Google';
    component.onSearchChange();
    expect(component.searchResults.length).toBeGreaterThan(0);

    component.searchQuery = '';
    component.onSearchChange();
    expect(component.searchResults.length).toBe(0);
  });

  it('should handle arrow down key', () => {
    component.searchQuery = 'o';
    component.onSearchChange();

    expect(component.selectedIndex).toBe(0);

    const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
    component.onArrowDown(event);

    expect(component.selectedIndex).toBe(1);
  });

  it('should handle arrow up key', () => {
    component.searchQuery = 'o';
    component.onSearchChange();
    component.selectedIndex = 1;

    const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
    component.onArrowUp(event);

    expect(component.selectedIndex).toBe(0);
  });

  it('should emit confirm event on Enter key', () => {
    spyOn(component.confirm, 'emit');
    component.searchQuery = 'Google';
    component.onSearchChange();

    const event = new KeyboardEvent('keydown', { key: 'Enter' });
    component.onEnterKey(event);

    expect(component.confirm.emit).toHaveBeenCalledWith(
      component.searchResults[0].bookmark
    );
    expect(mockModalService.close).toHaveBeenCalled();
  });

  it('should close modal on Escape key when folder selector is closed', () => {
    component.isFolderSelectorOpen = false;
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    component.onEscapeKey(event);

    expect(mockModalService.close).toHaveBeenCalled();
  });

  it('should close folder selector first on Escape key when selector is open', () => {
    component.isFolderSelectorOpen = true;
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    component.onEscapeKey(event);

    expect(component.isFolderSelectorOpen).toBeFalse();
    expect(mockModalService.close).not.toHaveBeenCalled();
  });

  it('should select result on click', () => {
    spyOn(component.confirm, 'emit');
    component.searchQuery = 'Google';
    component.onSearchChange();

    component.onSelectResult(component.searchResults[0]);

    expect(component.confirm.emit).toHaveBeenCalledWith(
      component.searchResults[0].bookmark
    );
    expect(mockModalService.close).toHaveBeenCalled();
  });

  it('should get path string correctly', () => {
    const path = ['Root', 'Folder', 'YouTube'];
    const result = component.getPathString(path);

    expect(result).toBe('Folder');
  });
});
