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

import { Bookmark } from '@app/services/types';
import { SettingsService } from '@app/services/settings.service';
import { ModalService } from '@app/services/modal.service';
import { BookmarkService } from '@app/services/bookmark.service';

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

  @Output() confirm = new EventEmitter<void>();
  @Output() columnsChange = new EventEmitter<number>();

  title!: string;

  readonly themes = [
    'light',
    'cmyk',
    'dim',
    'dracula',
    'emerald',
    'lofi',
    'night',
    'retro',
  ];
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
  onKeydownEnter(event: KeyboardEvent) {
    event.preventDefault();
    this.onConfirm();
  }

  @HostListener('document:keydown.esc', ['$event'])
  onKeydownEsc(event: KeyboardEvent) {
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
}
