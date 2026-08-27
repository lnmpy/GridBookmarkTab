import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  heroCog6Tooth,
  heroPaintBrush,
  heroFolder,
  heroMagnifyingGlass,
  heroCircleStack,
  heroInformationCircle,
  heroArrowDownTray,
  heroArrowUpTray,
  heroTrash,
  heroArrowPath,
  heroCheck,
  heroXMark,
  heroAdjustmentsHorizontal,
  heroArrowTopRightOnSquare,
  heroShieldCheck,
  heroGlobeAlt,
  heroKey,
  heroSwatch,
} from '@ng-icons/heroicons/outline';

import { Bookmark, SearchScope, Setting, AVAILABLE_THEMES } from '@app/services/types';
import { SettingsService } from '@app/services/settings.service';
import { BookmarkService } from '@app/services/bookmark.service';
import { FaviconService } from '@app/services/favicon.service';
import { ToastService } from '@app/services/toast.service';
import { I18nService } from '@app/services/i18n.service';
import { ToastContainerComponent } from '@app/components/toast-container/toast-container.component';

export type OptionsTab =
  | 'general'
  | 'appearance'
  | 'bookmarks'
  | 'search'
  | 'storage'
  | 'about';

@Component({
  selector: 'app-options',
  imports: [CommonModule, FormsModule, NgIcon, ToastContainerComponent],
  providers: [
    provideIcons({
      heroCog6Tooth,
      heroPaintBrush,
      heroFolder,
      heroMagnifyingGlass,
      heroCircleStack,
      heroInformationCircle,
      heroArrowDownTray,
      heroArrowUpTray,
      heroTrash,
      heroArrowPath,
      heroCheck,
      heroXMark,
      heroAdjustmentsHorizontal,
      heroArrowTopRightOnSquare,
      heroShieldCheck,
      heroGlobeAlt,
      heroKey,
      heroSwatch,
    }),
  ],
  templateUrl: './options.component.html',
  styleUrls: ['./options.component.scss'],
})
export class OptionsComponent implements OnInit, OnDestroy {
  public readonly settingsService = inject(SettingsService);
  public readonly bookmarkService = inject(BookmarkService);
  public readonly faviconService = inject(FaviconService);
  public readonly toastService = inject(ToastService);
  public readonly i18n = inject(I18nService);
  private readonly cdr = inject(ChangeDetectorRef);

  private settingsSubscription?: Subscription;

  activeTab: OptionsTab = 'general';

  // Local settings model bound to form
  settings: Setting = {
    bookmarkRootFolderId: '1',
    theme: 'light',
    language: 'auto',
    bookmarkDisplayColumn: 7,
    bookmarkSize: 80,
    bookmarkOpenInNewTab: true,
    searchShortcut: { modifiers: [], key: ' ' },
    searchScope: 'root',
    searchFolderWhitelist: [],
  };

  readonly themes = AVAILABLE_THEMES;

  readonly columnsMin = 4;
  readonly columnsMax = 12;
  readonly sizeMin = 40;
  readonly sizeMax = 120;

  bookmarkRootFolders: Bookmark[] = [];
  whitelistFilterText = '';

  faviconStats = {
    cachedIconsCount: 0,
    customIconsCount: 0,
  };

  confirmModal = {
    isOpen: false,
    title: '',
    message: '',
    confirmText: '',
    confirmClass: 'btn-error',
    onConfirm: async () => {},
  };

  readonly manifestVersion = '0.4.7';

  async ngOnInit(): Promise<void> {
    this.settingsSubscription = this.settingsService
      .onSettingsChange()
      .subscribe((s) => {
        if (s) {
          this.settings = { ...s };
          if (s.language) {
            this.i18n.setLanguage(s.language);
          }
          if (s.theme) {
            document.documentElement.setAttribute('data-theme', s.theme);
          }
          this.cdr.detectChanges();
        }
      });

    try {
      this.bookmarkRootFolders =
        await this.bookmarkService.getAllBookmarkFolders();
    } catch (e) {
      console.debug('Failed to load bookmark folders in options:', e);
    }

    await this.refreshFaviconStats();
  }

  ngOnDestroy(): void {
    this.settingsSubscription?.unsubscribe();
  }

  selectTab(tab: OptionsTab): void {
    this.activeTab = tab;
  }

  async refreshFaviconStats(): Promise<void> {
    this.faviconStats = await this.faviconService.getFaviconCacheStats();
    this.cdr.detectChanges();
  }

  // ==================== General & Appearance ====================

  async setLanguage(lang: string): Promise<void> {
    this.settings.language = lang;
    this.i18n.setLanguage(lang);
    await this.saveSettings();
  }

  async setTheme(theme: string): Promise<void> {
    this.settings.theme = theme;
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    await this.saveSettings();
  }

  async updateSetting(): Promise<void> {
    await this.saveSettings();
  }

  // ==================== Search & Shortcut ====================

  get shortcutDisplayString(): string {
    const s = this.settings.searchShortcut;
    if (!s || (!s.key && (!s.modifiers || s.modifiers.length === 0))) {
      return '';
    }
    const displayKey = this.formatKeyForDisplay(s.key);
    return [...(s.modifiers || []), displayKey].filter(Boolean).join(' + ');
  }

  private formatKeyForDisplay(key: string): string {
    const keyMap: Record<string, string> = {
      ' ': 'Space',
      ArrowUp: '↑',
      ArrowDown: '↓',
      ArrowLeft: '←',
      ArrowRight: '→',
      Enter: 'Enter',
      Escape: 'Esc',
      Backspace: 'Backspace',
      Tab: 'Tab',
    };
    return keyMap[key] || (key ? key.toUpperCase() : '');
  }

  async onShortcutKeydown(event: KeyboardEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    // Ignore solitary modifier key presses
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) {
      return;
    }

    const modifiers: string[] = [];
    if (event.metaKey) modifiers.push('Meta');
    if (event.ctrlKey) modifiers.push('Ctrl');
    if (event.altKey) modifiers.push('Alt');
    if (event.shiftKey) modifiers.push('Shift');

    const key = event.key.toLowerCase();

    this.settings.searchShortcut = { modifiers, key };
    await this.saveSettings();
  }

  async clearShortcut(): Promise<void> {
    this.settings.searchShortcut = { modifiers: [], key: '' };
    await this.saveSettings();
  }

  async setSearchScope(scope: SearchScope): Promise<void> {
    this.settings.searchScope = scope;
    await this.saveSettings();
  }

  // ==================== Whitelist Folders ====================

  get filteredBookmarkFolders(): Bookmark[] {
    if (!this.whitelistFilterText.trim()) {
      return this.bookmarkRootFolders;
    }
    const filter = this.whitelistFilterText.toLowerCase();
    return this.bookmarkRootFolders.filter((f) =>
      f.title?.toLowerCase().includes(filter),
    );
  }

  isWhitelistFolderSelected(folderId: string): boolean {
    return (this.settings.searchFolderWhitelist || []).includes(folderId);
  }

  async toggleWhitelistFolder(folderId: string): Promise<void> {
    const list = [...(this.settings.searchFolderWhitelist || [])];
    const index = list.indexOf(folderId);
    if (index > -1) {
      list.splice(index, 1);
    } else {
      list.push(folderId);
    }
    this.settings.searchFolderWhitelist = list;
    await this.saveSettings();
  }

  async selectAllWhitelistFolders(): Promise<void> {
    this.settings.searchFolderWhitelist = this.bookmarkRootFolders.map(
      (f) => f.id,
    );
    await this.saveSettings();
  }

  async clearWhitelistFolders(): Promise<void> {
    this.settings.searchFolderWhitelist = [];
    await this.saveSettings();
  }

  // ==================== Storage, Export & Import ====================

  exportSettings(): void {
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(this.settings, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute(
      'download',
      `gbktab-settings-${new Date().toISOString().slice(0, 10)}.json`,
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    this.toastService.show(
      this.i18n.t('settingsExported'),
      'success',
    );
  }

  onImportFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }
    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = async (e: ProgressEvent<FileReader>) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text);

        if (typeof parsed !== 'object' || parsed === null) {
          throw new Error('Invalid JSON structure');
        }

        // Merge imported settings with current structure
        const validatedSettings: Setting = {
          ...this.settings,
          ...parsed,
        };

        this.settings = validatedSettings;
        if (validatedSettings.theme) {
          localStorage.setItem('theme', validatedSettings.theme);
          document.documentElement.setAttribute(
            'data-theme',
            validatedSettings.theme,
          );
        }
        if (validatedSettings.language) {
          this.i18n.setLanguage(validatedSettings.language);
        }

        await this.settingsService.storeSettings(validatedSettings);
        this.toastService.show(
          this.i18n.t('settingsImported'),
          'success',
        );
      } catch (err) {
        console.error('Import settings error:', err);
        this.toastService.show(
          this.i18n.t('invalidSettingsFile'),
          'error',
        );
      } finally {
        input.value = '';
      }
    };

    reader.readAsText(file);
  }

  promptClearFaviconCache(): void {
    this.confirmModal = {
      isOpen: true,
      title: this.i18n.t('clearFaviconCache'),
      message: this.i18n.t('confirmClearFaviconCache'),
      confirmText: this.i18n.t('confirm'),
      confirmClass: 'btn-warning',
      onConfirm: async () => {
        await this.faviconService.clearFaviconCache();
        await this.refreshFaviconStats();
        this.toastService.show(
          this.i18n.t('faviconCacheCleared'),
          'success',
        );
        this.closeConfirmModal();
      },
    };
  }

  promptResetDefaults(): void {
    this.confirmModal = {
      isOpen: true,
      title: this.i18n.t('resetDefaults'),
      message: this.i18n.t('confirmResetDefaults'),
      confirmText: this.i18n.t('confirm'),
      confirmClass: 'btn-error',
      onConfirm: async () => {
        const defaultSettings: Setting = {
          bookmarkRootFolderId: '1',
          theme: 'light',
          language: 'auto',
          bookmarkDisplayColumn: 7,
          bookmarkSize: 80,
          bookmarkOpenInNewTab: true,
          searchShortcut: { modifiers: [], key: ' ' },
          searchScope: 'root',
          searchFolderWhitelist: [],
        };
        this.settings = { ...defaultSettings };
        localStorage.setItem('theme', defaultSettings.theme);
        document.documentElement.setAttribute(
          'data-theme',
          defaultSettings.theme,
        );
        this.i18n.setLanguage(defaultSettings.language);
        await this.settingsService.storeSettings(defaultSettings);
        this.toastService.show(
          this.i18n.t('settingsReset'),
          'success',
        );
        this.closeConfirmModal();
      },
    };
  }

  closeConfirmModal(): void {
    this.confirmModal.isOpen = false;
  }

  async executeConfirmModal(): Promise<void> {
    if (this.confirmModal.onConfirm) {
      await this.confirmModal.onConfirm();
    }
  }

  // ==================== Navigation & Actions ====================

  openNewTab(): void {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: 'chrome://newtab' });
    } else {
      window.location.hash = '#/?target=new-tab';
    }
  }

  private async saveSettings(): Promise<void> {
    await this.settingsService.storeSettings(this.settings);
    this.cdr.detectChanges();
  }
}
