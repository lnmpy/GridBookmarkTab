import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, of } from 'rxjs';

import { BookmarkSearchBoxComponent } from './bookmark-search-box.component';
import { SettingsService } from '@app/services/settings.service';
import { I18nService } from '@app/services/i18n.service';
import { BookmarkSearchEngineService } from '@app/services/bookmark-search-engine.service';
import { TabService } from '@app/services/tab.service';
import { Bookmark, Setting, SearchResult } from '@app/services/types';

describe('BookmarkSearchBoxComponent', () => {
  let component: BookmarkSearchBoxComponent;
  let fixture: ComponentFixture<BookmarkSearchBoxComponent>;
  let mockSearchEngine: jasmine.SpyObj<BookmarkSearchEngineService>;
  let mockSettingsService: any;
  let mockI18nService: jasmine.SpyObj<I18nService>;
  let mockTabService: jasmine.SpyObj<TabService>;

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
    mockSearchEngine = jasmine.createSpyObj('BookmarkSearchEngineService', [
      'init',
      'setScope',
      'getAvailableFolders',
      'search',
    ]);
    mockSearchEngine.init.and.resolveTo();
    mockSearchEngine.getAvailableFolders.and.returnValue([
      { id: 'root', title: 'Root', type: 'bookmarkFolder', depth: 0 },
      { id: '3', title: 'Folder A', type: 'bookmarkFolder', depth: 1 },
    ]);
    mockSearchEngine.search.and.returnValue([mockSearchResult]);

    mockSettingsService = {
      settingsSource: new BehaviorSubject<Setting>(defaultSetting),
      onSettingsChange: () => of(defaultSetting),
    };

    mockI18nService = jasmine.createSpyObj('I18nService', ['t', 'getMessage']);
    mockI18nService.t.and.callFake((key: string) => key);
    mockI18nService.getMessage.and.callFake((key: string) => key);

    mockTabService = jasmine.createSpyObj('TabService', ['createTab']);

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
    component.searchQuery = 'google';
    component.onSearchChange();

    expect(component.isOpen).toBeTrue();
    expect(component.isDropdownVisible).toBeTrue();
    expect(component.searchResults.length).toBe(1);
  });

  it('should clear search and reset dropdown', () => {
    component.searchQuery = 'test';
    component.searchResults = [mockSearchResult];
    component.clearSearch();

    expect(component.searchQuery).toBe('');
    expect(component.searchResults.length).toBe(0);
  });

  it('should close dropdown on escape key', () => {
    component.isOpen = true;
    component.searchQuery = 'test';
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    component.onEscapeKey(event);

    expect(component.isOpen).toBeFalse();
  });

  it('should select result and create tab', () => {
    spyOn(component.selectBookmark, 'emit');
    component.onSelectResult(mockSearchResult, true);

    expect(component.selectBookmark.emit).toHaveBeenCalledWith({
      bookmark: mockSearchResult.bookmark,
      openInNewTab: true,
    });
    expect(mockTabService.createTab).toHaveBeenCalled();
    expect(component.isOpen).toBeFalse();
  });

  it('should switch between default and custom scopes', () => {
    component.setSearchScope('custom');
    expect(component.searchScope).toBe('custom');
    expect(component.isCustomScope).toBeTrue();
    expect(mockSearchEngine.setScope).toHaveBeenCalledWith('custom', jasmine.any(Set));

    component.setSearchScope('default');
    expect(component.searchScope).toBe('default');
    expect(component.isCustomScope).toBeFalse();
    expect(mockSearchEngine.setScope).toHaveBeenCalledWith('default', jasmine.any(Set));
  });

  it('should handle onToggleScope event', () => {
    const mockInput = document.createElement('input');
    mockInput.type = 'checkbox';
    mockInput.checked = true;
    const mockEvent = { target: mockInput } as unknown as Event;

    component.onToggleScope(mockEvent);
    expect(component.isCustomScope).toBeTrue();

    mockInput.checked = false;
    component.onToggleScope(mockEvent);
    expect(component.isCustomScope).toBeFalse();
  });

  it('should toggle scope with toggleScope method', () => {
    component.searchScope = 'default';
    component.toggleScope();
    expect(component.isCustomScope).toBeTrue();

    component.toggleScope();
    expect(component.isCustomScope).toBeFalse();
  });
});
