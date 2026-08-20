import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, of } from 'rxjs';

import { BookmarkSearchModalComponent } from './bookmark-search-modal.component';
import { ModalService } from '@app/services/modal.service';
import { BookmarkService } from '@app/services/bookmark.service';
import { SettingsService } from '@app/services/settings.service';
import { I18nService } from '@app/services/i18n.service';
import { BookmarkSearchEngineService } from '@app/services/bookmark-search-engine.service';
import { Bookmark, Setting, SearchResult } from '@app/services/types';

describe('BookmarkSearchModalComponent', () => {
  let component: BookmarkSearchModalComponent;
  let fixture: ComponentFixture<BookmarkSearchModalComponent>;
  let mockModalService: jasmine.SpyObj<ModalService>;
  let mockSearchEngine: jasmine.SpyObj<BookmarkSearchEngineService>;
  let mockSettingsService: any;
  let mockI18nService: jasmine.SpyObj<I18nService>;

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
    mockModalService = jasmine.createSpyObj('ModalService', ['close']);
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
      { id: '5', title: 'Folder B', type: 'bookmarkFolder', depth: 1 },
    ]);
    mockSearchEngine.search.and.returnValue([mockSearchResult]);

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
        { provide: BookmarkSearchEngineService, useValue: mockSearchEngine },
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: I18nService, useValue: mockI18nService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BookmarkSearchModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and initialize search engine', () => {
    expect(component).toBeTruthy();
    expect(mockSearchEngine.init).toHaveBeenCalled();
    expect(mockSearchEngine.setScope).toHaveBeenCalledWith('root', jasmine.any(Set));
  });

  it('should delegate search to engine when query changes', () => {
    component.searchQuery = 'Google';
    component.onSearchChange();

    expect(mockSearchEngine.search).toHaveBeenCalledWith('Google', {
      scope: 'root',
      whitelistFolderIds: jasmine.any(Set),
    });
    expect(component.searchResults.length).toBe(1);
    expect(component.searchResults[0]).toBe(mockSearchResult);
  });

  it('should clear results when search query is empty', () => {
    component.searchQuery = '';
    component.onSearchChange();

    expect(component.searchResults.length).toBe(0);
  });

  it('should update scope and refresh search', () => {
    component.setSearchScope('all');

    expect(component.searchScope).toBe('all');
    expect(mockSearchEngine.setScope).toHaveBeenCalledWith('all', jasmine.any(Set));
  });

  it('should toggle folder selection correctly', () => {
    component.searchScope = 'custom';
    component.selectedFolderIds = new Set(['3']);

    component.toggleFolderSelection('5');
    expect(component.selectedFolderIds.has('5')).toBeTrue();
    expect(mockSearchEngine.setScope).toHaveBeenCalledWith('custom', component.selectedFolderIds);

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

  it('should handle arrow down key navigation', () => {
    component.searchResults = [mockSearchResult, { ...mockSearchResult, score: 90 }];
    component.selectedIndex = 0;

    const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
    component.onArrowDown(event);

    expect(component.selectedIndex).toBe(1);
  });

  it('should handle arrow up key navigation', () => {
    component.searchResults = [mockSearchResult, { ...mockSearchResult, score: 90 }];
    component.selectedIndex = 1;

    const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
    component.onArrowUp(event);

    expect(component.selectedIndex).toBe(0);
  });

  it('should emit confirm event on Enter key', () => {
    spyOn(component.confirm, 'emit');
    component.searchResults = [mockSearchResult];

    const event = new KeyboardEvent('keydown', { key: 'Enter' });
    component.onEnterKey(event);

    expect(component.confirm.emit).toHaveBeenCalledWith(mockSearchResult.bookmark);
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
    component.onSelectResult(mockSearchResult);

    expect(component.confirm.emit).toHaveBeenCalledWith(mockSearchResult.bookmark);
    expect(mockModalService.close).toHaveBeenCalled();
  });

  it('should get path string correctly', () => {
    const path = ['Root', 'Folder', 'YouTube'];
    const result = component.getPathString(path);

    expect(result).toBe('Folder');
  });
});

