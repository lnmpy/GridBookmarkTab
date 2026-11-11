import type { MockedObject } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, of } from 'rxjs';

import { BookmarkSearchBoxComponent } from './bookmark-search-box.component';
import { SettingsService } from '@app/services/settings.service';
import { I18nService } from '@app/services/i18n.service';
import { BookmarkSearchEngineService } from '@app/services/bookmark-search-engine.service';
import { TabService } from '@app/services/tab.service';
import { Setting, SearchResult } from '@app/services/types';

describe('BookmarkSearchBoxComponent', () => {
  let component: BookmarkSearchBoxComponent;
  let fixture: ComponentFixture<BookmarkSearchBoxComponent>;
  let mockSearchEngine: MockedObject<BookmarkSearchEngineService>;
  let mockSettingsService: any;
  let mockI18nService: MockedObject<I18nService>;
  let mockTabService: MockedObject<TabService>;

  const mockSearchResult: SearchResult = {
    bookmark: {
      id: '1',
      title: 'Google',
      url: 'https://google.com',
      type: 'bookmark',
      favIconUrl: 'https://google.com/favicon.ico',
    },
    score: 100,
    path: ['Root', 'Google'],
    titleSegments: [{ text: 'Google', isMatch: true }],
    urlSegments: [{ text: 'https://google.com', isMatch: false }],
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
    mockSearchEngine = {
      init: vi.fn().mockName('BookmarkSearchEngineService.init'),
      setScope: vi.fn().mockName('BookmarkSearchEngineService.setScope'),
      getAvailableFolders: vi
        .fn()
        .mockName('BookmarkSearchEngineService.getAvailableFolders'),
      search: vi.fn().mockName('BookmarkSearchEngineService.search'),
    } as unknown as MockedObject<BookmarkSearchEngineService>;
    mockSearchEngine.init.mockResolvedValue();
    mockSearchEngine.getAvailableFolders.mockReturnValue([
      { id: 'root', title: 'Root', type: 'bookmarkFolder', depth: 0 },
      { id: '3', title: 'Folder A', type: 'bookmarkFolder', depth: 1 },
    ]);
    mockSearchEngine.search.mockReturnValue([mockSearchResult]);

    mockSettingsService = {
      settingsSource: new BehaviorSubject<Setting>(defaultSetting),
      onSettingsChange: () => of(defaultSetting),
    };

    mockI18nService = {
      t: vi.fn().mockName('I18nService.t'),
      getMessage: vi.fn().mockName('I18nService.getMessage'),
    } as unknown as MockedObject<I18nService>;
    mockI18nService.t.mockImplementation((key: string) => key);
    mockI18nService.getMessage.mockImplementation((key: string) => key);

    mockTabService = {
      createTab: vi.fn().mockName('TabService.createTab'),
      updateCurrentTab: vi.fn().mockName('TabService.updateCurrentTab'),
    } as unknown as MockedObject<TabService>;

    await TestBed.configureTestingModule({
      imports: [BookmarkSearchBoxComponent, FormsModule],
      providers: [
        { provide: BookmarkSearchEngineService, useValue: mockSearchEngine },
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: I18nService, useValue: mockI18nService },
        { provide: TabService, useValue: mockTabService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BookmarkSearchBoxComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and initialize search engine', () => {
    expect(component).toBeTruthy();
    expect(mockSearchEngine.init).toHaveBeenCalled();
  });

  it('should search and open dropdown on search change', () => {
    component.searchQuery.set('google');
    component.onSearchChange();

    expect(component.isOpen()).toBe(true);
    expect(component.isDropdownVisible).toBe(true);
    expect(component.searchResults().length).toBe(1);
  });

  it('should clear search and reset dropdown', () => {
    component.searchQuery.set('test');
    component.searchResults.set([mockSearchResult]);
    component.clearSearch();

    expect(component.searchQuery()).toBe('');
    expect(component.searchResults().length).toBe(0);
  });

  it('should close dropdown on escape key', () => {
    component.isOpen.set(true);
    component.searchQuery.set('test');
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    component.onEscapeKey(event);

    expect(component.isOpen()).toBe(false);
  });

  it('should select result and create tab', () => {
    vi.spyOn(component.selectBookmark, 'emit');
    component.onSelectResult(mockSearchResult, true);

    expect(component.selectBookmark.emit).toHaveBeenCalledWith({
      bookmark: mockSearchResult.bookmark,
      openInNewTab: true,
    });
    expect(mockTabService.createTab).toHaveBeenCalled();
    expect(component.isOpen()).toBe(false);
  });

  it('should select result and update current tab when openInNewTab is false', () => {
    mockSettingsService.settingsSource.next({
      ...defaultSetting,
      bookmarkOpenInNewTab: false,
    });
    vi.spyOn(component.selectBookmark, 'emit');
    component.onSelectResult(mockSearchResult, false);

    expect(component.selectBookmark.emit).toHaveBeenCalledWith({
      bookmark: mockSearchResult.bookmark,
      openInNewTab: false,
    });
    expect(mockTabService.updateCurrentTab).toHaveBeenCalledWith(
      mockSearchResult.bookmark.url!,
    );
    expect(component.isOpen()).toBe(false);
  });

  it('should switch between default and custom scopes', () => {
    component.setSearchScope('custom');
    expect(component.searchScope()).toBe('custom');
    expect(component.isCustomScope).toBe(true);
    expect(mockSearchEngine.setScope).toHaveBeenCalledWith(
      'custom',
      expect.any(Set),
    );

    component.setSearchScope('default');
    expect(component.searchScope()).toBe('default');
    expect(component.isCustomScope).toBe(false);
    expect(mockSearchEngine.setScope).toHaveBeenCalledWith(
      'default',
      expect.any(Set),
    );
  });

  it('should toggle scope with toggleScope method', () => {
    component.searchScope.set('default');
    component.toggleScope();
    expect(component.isCustomScope).toBe(true);

    component.toggleScope();
    expect(component.isCustomScope).toBe(false);
  });
});
