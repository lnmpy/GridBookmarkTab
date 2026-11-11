import {
  Component,
  OnInit,
  Input,
  Output,
  EventEmitter,
  inject,
  signal,
  HostListener,
  ViewChild,
  ElementRef,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';

import { Bookmark, SearchScope, SearchResult } from '@app/services/types';
import { SettingsService } from '@app/services/settings.service';
import { I18nService } from '@app/services/i18n.service';
import { BookmarkSearchEngineService } from '@app/services/bookmark-search-engine.service';
import { TabService } from '@app/services/tab.service';

@Component({
  selector: 'app-bookmark-search-box',
  imports: [CommonModule, FormsModule],
  standalone: true,
  templateUrl: './bookmark-search-box.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./bookmark-search-box.component.scss'],
})
export class BookmarkSearchBoxComponent implements OnInit {
  private searchEngine = inject(BookmarkSearchEngineService);
  private settingsService = inject(SettingsService);
  private tabService = inject(TabService);
  public i18n = inject(I18nService);
  private elementRef = inject(ElementRef);

  @Input() rootFolder?: Bookmark;
  @Output() selectBookmark = new EventEmitter<{
    bookmark: Bookmark;
    openInNewTab?: boolean;
  }>();

  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  searchQuery = signal('');
  searchResults = signal<SearchResult[]>([]);
  selectedIndex = signal(0);
  isOpen = signal(false);

  // Search scope & whitelist state
  searchScope = signal<SearchScope>('default');
  // Replaced on every change (never mutated) so the signal notifies readers
  selectedFolderIds = signal(new Set<string>());
  availableFolders = signal<Bookmark[]>([]);
  isFolderSelectorOpen = signal(false);
  folderSearchText = signal('');

  private settings = toSignal(this.settingsService.onSettingsChange(), {
    requireSync: true,
  });

  get isMac(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      /Mac|iPod|iPhone|iPad/.test(navigator.platform)
    );
  }

  get formattedShortcutKey(): string {
    const settings = this.settings();
    if (!settings.searchShortcut) return this.isMac ? '⌘K' : 'Ctrl+K';
    const modMap: Record<string, string> = {
      Meta: this.isMac ? '⌘' : 'Win',
      Ctrl: this.isMac ? '⌃' : 'Ctrl',
      Alt: this.isMac ? '⌥' : 'Alt',
      Shift: this.isMac ? '⇧' : 'Shift',
    };
    const keyMap: Record<string, string> = {
      ' ': 'Space',
    };
    const mods = (settings.searchShortcut.modifiers || [])
      .map((m) => modMap[m] || m)
      .join('');
    const key =
      keyMap[settings.searchShortcut.key] ||
      settings.searchShortcut.key.toUpperCase();
    return `${mods}${key}`;
  }

  get isDropdownVisible(): boolean {
    return (
      this.isOpen() &&
      (!!this.searchQuery().trim() ||
        (this.searchScope() === 'custom' && this.isFolderSelectorOpen()))
    );
  }

  async ngOnInit() {
    const currentSettings = this.settingsService.settingsSource.value;
    this.searchScope.set(
      currentSettings.searchScope === 'custom' ? 'custom' : 'default',
    );

    if (
      currentSettings.searchFolderWhitelist &&
      currentSettings.searchFolderWhitelist.length > 0
    ) {
      this.selectedFolderIds.set(
        new Set(currentSettings.searchFolderWhitelist),
      );
    } else if (this.rootFolder?.id) {
      this.selectedFolderIds.set(new Set([this.rootFolder.id]));
    }

    await this.searchEngine.init();
    this.availableFolders.set(this.searchEngine.getAvailableFolders());
    this.searchEngine.setScope(this.searchScope(), this.selectedFolderIds());
  }

  focus() {
    this.searchInput?.nativeElement?.focus();
    this.isOpen.set(true);
    if (this.searchQuery()) {
      this.onSearchChange();
    }
  }

  onInputFocus() {
    this.isOpen.set(true);
    if (this.searchQuery()) {
      this.onSearchChange();
    }
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: MouseEvent) {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.closeDropdown();
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: Event) {
    if (!this.isOpen() && !this.searchQuery()) return;
    event.preventDefault();
    if (this.isFolderSelectorOpen()) {
      this.isFolderSelectorOpen.set(false);
      return;
    }
    this.closeDropdown();
    this.searchInput?.nativeElement?.blur();
  }

  @HostListener('document:keydown.arrowdown', ['$event'])
  onArrowDown(event: Event) {
    if (!this.isDropdownVisible || this.isFolderSelectorOpen()) return;
    event.preventDefault();
    if (this.searchResults().length > 0) {
      this.selectedIndex.set(
        (this.selectedIndex() + 1) % this.searchResults().length,
      );
      this.scrollToSelected();
    }
  }

  @HostListener('document:keydown.arrowup', ['$event'])
  onArrowUp(event: Event) {
    if (!this.isDropdownVisible || this.isFolderSelectorOpen()) return;
    event.preventDefault();
    if (this.searchResults().length > 0) {
      this.selectedIndex.set(
        this.selectedIndex() === 0
          ? this.searchResults().length - 1
          : this.selectedIndex() - 1,
      );
      this.scrollToSelected();
    }
  }

  @HostListener('document:keydown.enter', ['$event'])
  onEnterKey(event: Event) {
    if (!this.isDropdownVisible || this.isFolderSelectorOpen()) return;
    if (this.searchResults().length > 0) {
      event.preventDefault();
      const kbEvent = event as KeyboardEvent;
      const isNewTab = kbEvent.metaKey || kbEvent.ctrlKey;
      this.onSelectResult(this.searchResults()[this.selectedIndex()], isNewTab);
    }
  }

  private scrollToSelected() {
    setTimeout(() => {
      const element = this.elementRef.nativeElement.querySelector(
        '.search-result.selected',
      );
      element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 0);
  }

  get isCustomScope(): boolean {
    return this.searchScope() === 'custom';
  }

  toggleScope() {
    this.setSearchScope(this.isCustomScope ? 'default' : 'custom');
    if (!this.isCustomScope) {
      this.isFolderSelectorOpen.set(false);
    }
  }

  setSearchScope(scope: SearchScope) {
    this.searchScope.set(scope === 'custom' ? 'custom' : 'default');
    if (this.searchScope() === 'custom') {
      if (this.selectedFolderIds().size === 0 && this.rootFolder?.id) {
        this.selectedFolderIds.set(new Set([this.rootFolder.id]));
      }
    }
    this.searchEngine.setScope(this.searchScope(), this.selectedFolderIds());
    this.onSearchChange();
  }

  toggleFolderSelector() {
    this.isFolderSelectorOpen.set(!this.isFolderSelectorOpen());
    if (this.isFolderSelectorOpen() && this.availableFolders().length === 0) {
      this.availableFolders.set(this.searchEngine.getAvailableFolders());
    }
  }

  toggleFolderSelection(folderId: string) {
    const selected = new Set(this.selectedFolderIds());
    if (selected.has(folderId)) {
      selected.delete(folderId);
    } else {
      selected.add(folderId);
    }
    this.selectedFolderIds.set(selected);
    this.searchEngine.setScope(this.searchScope(), this.selectedFolderIds());
    this.onSearchChange();
  }

  isFolderSelected(folderId: string): boolean {
    return this.selectedFolderIds().has(folderId);
  }

  selectAllFolders() {
    const selected = new Set(this.selectedFolderIds());
    for (const folder of this.availableFolders()) {
      selected.add(folder.id);
    }
    this.selectedFolderIds.set(selected);
    this.searchEngine.setScope(this.searchScope(), this.selectedFolderIds());
    this.onSearchChange();
  }

  clearFolderSelection() {
    this.selectedFolderIds.set(new Set());
    this.searchEngine.setScope(this.searchScope(), this.selectedFolderIds());
    this.onSearchChange();
  }

  get filteredAvailableFolders(): Bookmark[] {
    if (!this.folderSearchText().trim()) {
      return this.availableFolders();
    }
    const query = this.folderSearchText().toLowerCase();
    return this.availableFolders().filter((f) =>
      f.title.toLowerCase().includes(query),
    );
  }

  get placeholderText(): string {
    return `${this.i18n.t('searchBookmarks')}...`;
  }

  onSearchChange() {
    this.isOpen.set(true);
    if (!this.searchQuery().trim()) {
      this.searchResults.set([]);
      this.selectedIndex.set(0);
      return;
    }

    this.searchResults.set(
      this.searchEngine.search(this.searchQuery(), {
        scope: this.searchScope(),
        whitelistFolderIds: this.selectedFolderIds(),
      }),
    );
    this.selectedIndex.set(0);
  }

  clearSearch() {
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.selectedIndex.set(0);
    this.searchInput?.nativeElement?.focus();
  }

  closeDropdown() {
    this.isOpen.set(false);
    this.isFolderSelectorOpen.set(false);
  }

  onSelectResult(result: SearchResult, openInNewTab: boolean = false) {
    const bookmark = result.bookmark;
    this.selectBookmark.emit({ bookmark, openInNewTab });

    const settings = this.settingsService.settingsSource.value;
    const forceNewTab = openInNewTab || settings.bookmarkOpenInNewTab;

    if (bookmark?.url) {
      if (forceNewTab) {
        this.tabService.createTab([bookmark.url], {
          active: !openInNewTab,
        });
      } else {
        this.tabService.updateCurrentTab(bookmark.url);
      }
    }

    this.closeDropdown();
  }

  getPathString(path: string[]): string {
    return path.slice(1, -1).join(' > ') || '';
  }
}
