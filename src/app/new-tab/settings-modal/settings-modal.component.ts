import {
  Component,
  EventEmitter,
  Output,
  inject,
  HostListener,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { Bookmark, AVAILABLE_THEMES } from '@app/services/types';
import { SettingsService } from '@app/services/settings.service';
import { ModalService } from '@app/services/modal.service';
import { BookmarkService } from '@app/services/bookmark.service';
import { I18nService } from '@app/services/i18n.service';

@Component({
  selector: 'app-settings-modal',
  imports: [CommonModule, FormsModule],
  standalone: true,
  templateUrl: './settings-modal.component.html',
  styleUrls: ['./settings-modal.component.scss'],
})
export class SettingsModalComponent implements OnInit {
  private bookmarkService: BookmarkService = inject(BookmarkService);
  private settingsService: SettingsService = inject(SettingsService);
  private modalService: ModalService = inject(ModalService);
  i18n: I18nService = inject(I18nService);

  @Output() confirm = new EventEmitter<void>();
  @Output() columnsChange = new EventEmitter<number>();

  title!: string;

  readonly themes = AVAILABLE_THEMES;
  readonly columnsMin = 4;
  readonly columnsMax = 12;

  bookmarkRootFolders: Bookmark[] = [];

  async ngOnInit() {
    this.title = 'Settings';
    this.bookmarkRootFolders =
      await this.bookmarkService.getAllBookmarkFolders();
  }

  get theme() {
    return this.settingsService.settingsSource.value.theme;
  }

  set theme(value: string) {
    this.settingsService.settingsSource.next({
      ...this.settingsService.settingsSource.value,
      theme: value,
    });
    document.documentElement.setAttribute('data-theme', this.theme);
  }

  get language() {
    return this.settingsService.settingsSource.value.language;
  }

  set language(value: string) {
    this.settingsService.settingsSource.next({
      ...this.settingsService.settingsSource.value,
      language: value,
    });
    // Update i18n service immediately for preview
    this.i18n.setLanguage(value);
  }

  get bookmarkDisplayColumn() {
    return this.settingsService.settingsSource.value.bookmarkDisplayColumn;
  }

  set bookmarkDisplayColumn(value: number) {
    this.settingsService.settingsSource.next({
      ...this.settingsService.settingsSource.value,
      bookmarkDisplayColumn: value,
    });
    this.columnsChange.emit(value);
  }

  get bookmarkSize() {
    return this.settingsService.settingsSource.value.bookmarkSize;
  }

  set bookmarkSize(value: number) {
    this.settingsService.settingsSource.next({
      ...this.settingsService.settingsSource.value,
      bookmarkSize: value,
    });
  }

  get bookmarkOpenInNewTab() {
    return this.settingsService.settingsSource.value.bookmarkOpenInNewTab;
  }

  set bookmarkOpenInNewTab(value: boolean) {
    this.settingsService.settingsSource.next({
      ...this.settingsService.settingsSource.value,
      bookmarkOpenInNewTab: value,
    });
  }



  get bookmarkRootFolderId() {
    return this.settingsService.settingsSource.value.bookmarkRootFolderId;
  }

  set bookmarkRootFolderId(value: string) {
    this.settingsService.settingsSource.next({
      ...this.settingsService.settingsSource.value,
      bookmarkRootFolderId: value,
    });
  }

  get searchShortcut() {
    return this.settingsService.settingsSource.value.searchShortcut;
  }

  set searchShortcut(value: { modifiers: string[]; key: string }) {
    this.settingsService.settingsSource.next({
      ...this.settingsService.settingsSource.value,
      searchShortcut: value,
    });
  }

  get searchScope() {
    return this.settingsService.settingsSource.value.searchScope || 'root';
  }

  set searchScope(value: 'root' | 'all' | 'custom') {
    this.settingsService.settingsSource.next({
      ...this.settingsService.settingsSource.value,
      searchScope: value,
    });
  }

  get searchFolderWhitelist(): string[] {
    return this.settingsService.settingsSource.value.searchFolderWhitelist || [];
  }

  set searchFolderWhitelist(value: string[]) {
    this.settingsService.settingsSource.next({
      ...this.settingsService.settingsSource.value,
      searchFolderWhitelist: value,
    });
  }

  isWhitelistFolderSelected(folderId: string): boolean {
    return this.searchFolderWhitelist.includes(folderId);
  }

  toggleWhitelistFolder(folderId: string) {
    const list = [...this.searchFolderWhitelist];
    const index = list.indexOf(folderId);
    if (index > -1) {
      list.splice(index, 1);
    } else {
      list.push(folderId);
    }
    this.searchFolderWhitelist = list;
  }

  selectAllWhitelistFolders() {
    this.searchFolderWhitelist = this.bookmarkRootFolders.map((f) => f.id);
  }

  clearWhitelistFolders() {
    this.searchFolderWhitelist = [];
  }

  get shortcutString() {
    const s = this.searchShortcut;
    if (!s) return '';
    const displayKey = this.formatKeyForDisplay(s.key);
    return [...s.modifiers, displayKey].join('+');
  }

  private formatKeyForDisplay(key: string): string {
    // Map special keys to readable names
    const keyMap: Record<string, string> = {
      ' ': 'Space',
      'ArrowUp': '↑',
      'ArrowDown': '↓',
      'ArrowLeft': '←',
      'ArrowRight': '→',
      'Enter': 'Enter',
      'Escape': 'Esc',
      'Backspace': 'Backspace',
      'Tab': 'Tab',
    };
    return keyMap[key] || key.toUpperCase();
  }

  onShortcutKeydown(event: KeyboardEvent) {
    event.preventDefault();
    event.stopPropagation();

    // Ignore modifier-only keydowns
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) {
      return;
    }

    const modifiers = [];
    if (event.metaKey) modifiers.push('Meta');
    if (event.ctrlKey) modifiers.push('Ctrl');
    if (event.altKey) modifiers.push('Alt');
    if (event.shiftKey) modifiers.push('Shift');

    const key = event.key.toLowerCase();

    this.searchShortcut = { modifiers, key };
  }

  @HostListener('document:keydown.enter', ['$event'])
  onKeydownEnter(event: Event) {
    event.preventDefault();
    this.onConfirm();
  }

  @HostListener('document:keydown.esc', ['$event'])
  onKeydownEsc(event: Event) {
    event.preventDefault();
    this.onCancel();
  }

  onConfirm() {
    localStorage.setItem('theme', this.theme);
    document.documentElement.setAttribute('data-theme', this.theme);
    this.settingsService.storeSettings(
      this.settingsService.settingsSource.value,
    );
    this.confirm.emit();
    this.modalService.close();
  }

  onCancel() {
    this.settingsService.reloadSettings();
    document.documentElement.setAttribute(
      'data-theme',
      localStorage.getItem('theme') as string,
    );
    this.modalService.close();
  }

  openFullOptions() {
    this.modalService.close();
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: 'options.html' });
    } else {
      window.location.hash = '#/?target=options';
    }
  }
}
