import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OptionsComponent, OptionsTab } from './options.component';
import { SettingsService } from '@app/services/settings.service';
import { BookmarkService } from '@app/services/bookmark.service';
import { FaviconService } from '@app/services/favicon.service';
import { ToastService } from '@app/services/toast.service';
import { Bookmark } from '@app/services/types';

describe('OptionsComponent', () => {
  let component: OptionsComponent;
  let fixture: ComponentFixture<OptionsComponent>;
  let settingsService: SettingsService;
  let bookmarkService: BookmarkService;
  let faviconService: FaviconService;
  let toastService: ToastService;

  const mockFolders: Bookmark[] = [
    { id: '1', title: 'Bookmarks Bar', type: 'bookmarkFolder', depth: 0 },
    { id: '2', title: 'Other Bookmarks', type: 'bookmarkFolder', depth: 0 },
    { id: '3', title: 'Development', parentId: '1', type: 'bookmarkFolder', depth: 1 },
  ];

  beforeEach(async () => {
    (globalThis as any).chrome.storage.sync.get.and.returnValue(
      Promise.resolve({
        bookmarkRootFolderId: '1',
        theme: 'light',
        language: 'auto',
        bookmarkDisplayColumn: 7,
        bookmarkSize: 80,
        bookmarkOpenInNewTab: true,
        searchShortcut: { modifiers: [], key: ' ' },
        searchScope: 'root',
        searchFolderWhitelist: [],
      }),
    );
    (globalThis as any).chrome.storage.sync.set.and.returnValue(Promise.resolve());
    (globalThis as any).chrome.storage.local.get.and.returnValue(Promise.resolve({}));

    await TestBed.configureTestingModule({
      imports: [OptionsComponent],
    }).compileComponents();

    settingsService = TestBed.inject(SettingsService);
    bookmarkService = TestBed.inject(BookmarkService);
    faviconService = TestBed.inject(FaviconService);
    toastService = TestBed.inject(ToastService);

    spyOn(bookmarkService, 'getAllBookmarkFolders').and.returnValue(
      Promise.resolve(mockFolders),
    );
    spyOn(faviconService, 'getFaviconCacheStats').and.returnValue(
      Promise.resolve({ cachedIconsCount: 15, customIconsCount: 3 }),
    );
    spyOn(faviconService, 'clearFaviconCache').and.returnValue(Promise.resolve(15));
    spyOn(toastService, 'show');

    fixture = TestBed.createComponent(OptionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create and load initial state', () => {
    expect(component).toBeTruthy();
    expect(component.activeTab).toBe('general');
    expect(component.bookmarkRootFolders.length).toBe(3);
    expect(component.faviconStats.cachedIconsCount).toBe(15);
    expect(component.faviconStats.customIconsCount).toBe(3);
  });

  it('should switch active tabs', () => {
    const tabs: OptionsTab[] = ['appearance', 'bookmarks', 'search', 'storage', 'about', 'general'];
    for (const tab of tabs) {
      component.selectTab(tab);
      expect(component.activeTab).toBe(tab);
    }
  });

  it('should update theme and store settings', async () => {
    spyOn(settingsService, 'storeSettings').and.returnValue(Promise.resolve());
    await component.setTheme('dark');
    expect(component.settings.theme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(settingsService.storeSettings).toHaveBeenCalled();
  });

  it('should update language and store settings', async () => {
    spyOn(settingsService, 'storeSettings').and.returnValue(Promise.resolve());
    await component.setLanguage('zh_CN');
    expect(component.settings.language).toBe('zh_CN');
    expect(settingsService.storeSettings).toHaveBeenCalled();
  });

  it('should format search shortcut display string correctly', () => {
    component.settings.searchShortcut = { modifiers: ['Meta', 'Shift'], key: 'f' };
    expect(component.shortcutDisplayString).toBe('Meta + Shift + F');

    component.settings.searchShortcut = { modifiers: [], key: ' ' };
    expect(component.shortcutDisplayString).toBe('Space');

    component.settings.searchShortcut = { modifiers: [], key: '' };
    expect(component.shortcutDisplayString).toBe('');
  });

  it('should record shortcut on keydown', async () => {
    spyOn(settingsService, 'storeSettings').and.returnValue(Promise.resolve());
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });

    await component.onShortcutKeydown(event);
    expect(component.settings.searchShortcut.modifiers).toContain('Meta');
    expect(component.settings.searchShortcut.key).toBe('k');
    expect(settingsService.storeSettings).toHaveBeenCalled();
  });

  it('should clear shortcut', async () => {
    spyOn(settingsService, 'storeSettings').and.returnValue(Promise.resolve());
    await component.clearShortcut();
    expect(component.settings.searchShortcut.key).toBe('');
    expect(component.settings.searchShortcut.modifiers).toEqual([]);
    expect(settingsService.storeSettings).toHaveBeenCalled();
  });

  it('should toggle and manage whitelist folders', async () => {
    spyOn(settingsService, 'storeSettings').and.returnValue(Promise.resolve());
    
    // Select all
    await component.selectAllWhitelistFolders();
    expect(component.settings.searchFolderWhitelist).toEqual(['1', '2', '3']);

    // Toggle off folder '2'
    await component.toggleWhitelistFolder('2');
    expect(component.isWhitelistFolderSelected('2')).toBeFalse();
    expect(component.isWhitelistFolderSelected('1')).toBeTrue();

    // Toggle on folder '2'
    await component.toggleWhitelistFolder('2');
    expect(component.isWhitelistFolderSelected('2')).toBeTrue();

    // Clear all
    await component.clearWhitelistFolders();
    expect(component.settings.searchFolderWhitelist).toEqual([]);
  });

  it('should filter bookmark folders by text', () => {
    component.whitelistFilterText = 'dev';
    expect(component.filteredBookmarkFolders.length).toBe(1);
    expect(component.filteredBookmarkFolders[0].title).toBe('Development');

    component.whitelistFilterText = '';
    expect(component.filteredBookmarkFolders.length).toBe(3);
  });

  it('should handle export settings', () => {
    component.exportSettings();
    expect(toastService.show).toHaveBeenCalled();
  });

  it('should prompt and clear favicon cache on confirmation', async () => {
    component.promptClearFaviconCache();
    expect(component.confirmModal.isOpen).toBeTrue();

    await component.executeConfirmModal();
    expect(faviconService.clearFaviconCache).toHaveBeenCalled();
    expect(toastService.show).toHaveBeenCalled();
    expect(component.confirmModal.isOpen).toBeFalse();
  });

  it('should prompt and reset settings to default on confirmation', async () => {
    spyOn(settingsService, 'storeSettings').and.returnValue(Promise.resolve());
    component.promptResetDefaults();
    expect(component.confirmModal.isOpen).toBeTrue();

    await component.executeConfirmModal();
    expect(component.settings.bookmarkDisplayColumn).toBe(7);
    expect(component.settings.bookmarkSize).toBe(80);
    expect(settingsService.storeSettings).toHaveBeenCalled();
    expect(toastService.show).toHaveBeenCalled();
    expect(component.confirmModal.isOpen).toBeFalse();
  });

  it('should close confirm modal without action', () => {
    component.promptResetDefaults();
    expect(component.confirmModal.isOpen).toBeTrue();

    component.closeConfirmModal();
    expect(component.confirmModal.isOpen).toBeFalse();
  });

  it('should open new tab when requested', () => {
    component.openNewTab();
    expect((globalThis as any).chrome.tabs.create).toHaveBeenCalledWith({
      url: 'chrome://newtab',
    });
  });
});
