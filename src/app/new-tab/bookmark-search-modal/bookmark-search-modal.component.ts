import {
  Component,
  EventEmitter,
  OnInit,
  AfterViewInit,
  Output,
  Input,
  inject,
  HostListener,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { Bookmark, SearchScope, SearchResult } from '@app/services/types';
import { ModalService } from '@app/services/modal.service';
import { SettingsService } from '@app/services/settings.service';
import { I18nService } from '@app/services/i18n.service';
import { BookmarkSearchEngineService } from '@app/services/bookmark-search-engine.service';

@Component({
  selector: 'app-bookmark-search-modal',
  imports: [CommonModule, FormsModule],
  standalone: true,
  templateUrl: './bookmark-search-modal.component.html',
  styleUrls: ['./bookmark-search-modal.component.scss'],
})
export class BookmarkSearchModalComponent implements OnInit, AfterViewInit {
  private modalService: ModalService = inject(ModalService);
  private searchEngine: BookmarkSearchEngineService = inject(BookmarkSearchEngineService);
  private settingsService: SettingsService = inject(SettingsService);
  public i18n: I18nService = inject(I18nService);

  @Input() rootFolder?: Bookmark;
  @Output() confirm = new EventEmitter<Bookmark>();
  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  title: string = 'Search Bookmarks';
  searchQuery: string = '';
  searchResults: SearchResult[] = [];
  selectedIndex: number = 0;

  // Search scope & whitelist state
  searchScope: SearchScope = 'root';
  selectedFolderIds = new Set<string>();
  availableFolders: Bookmark[] = [];
  isFolderSelectorOpen: boolean = false;
  folderSearchText: string = '';

  async ngOnInit() {
    const currentSettings = this.settingsService.settingsSource.value;
    this.searchScope = currentSettings.searchScope || 'root';

    if (currentSettings.searchFolderWhitelist && currentSettings.searchFolderWhitelist.length > 0) {
      this.selectedFolderIds = new Set(currentSettings.searchFolderWhitelist);
    } else if (this.rootFolder?.id) {
      this.selectedFolderIds.add(this.rootFolder.id);
    }

    await this.searchEngine.init();
    this.availableFolders = this.searchEngine.getAvailableFolders();
    this.searchEngine.setScope(this.searchScope, this.selectedFolderIds);

    if (this.searchQuery) {
      this.onSearchChange();
    }
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.searchInput?.nativeElement?.focus();
    }, 100);
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: Event) {
    event.preventDefault();
    if (this.isFolderSelectorOpen) {
      this.isFolderSelectorOpen = false;
      return;
    }
    this.onCancel();
  }

  @HostListener('document:keydown.arrowdown', ['$event'])
  onArrowDown(event: Event) {
    if (this.isFolderSelectorOpen) return;
    event.preventDefault();
    if (this.searchResults.length > 0) {
      this.selectedIndex = (this.selectedIndex + 1) % this.searchResults.length;
      this.scrollToSelected();
    }
  }

  @HostListener('document:keydown.arrowup', ['$event'])
  onArrowUp(event: Event) {
    if (this.isFolderSelectorOpen) return;
    event.preventDefault();
    if (this.searchResults.length > 0) {
      this.selectedIndex =
        this.selectedIndex === 0 ? this.searchResults.length - 1 : this.selectedIndex - 1;
      this.scrollToSelected();
    }
  }

  @HostListener('document:keydown.enter', ['$event'])
  onEnterKey(event: Event) {
    if (this.isFolderSelectorOpen) return;
    event.preventDefault();
    if (this.searchResults.length > 0) {
      this.onSelectResult(this.searchResults[this.selectedIndex]);
    }
  }

  private scrollToSelected() {
    setTimeout(() => {
      const element = document.querySelector('.search-result.selected');
      element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 0);
  }

  setSearchScope(scope: SearchScope) {
    this.searchScope = scope;
    if (scope === 'custom') {
      if (this.selectedFolderIds.size === 0 && this.rootFolder?.id) {
        this.selectedFolderIds.add(this.rootFolder.id);
      }
    }
    this.searchEngine.setScope(this.searchScope, this.selectedFolderIds);
    this.onSearchChange();
  }

  toggleFolderSelector() {
    this.isFolderSelectorOpen = !this.isFolderSelectorOpen;
    if (this.isFolderSelectorOpen && this.availableFolders.length === 0) {
      this.availableFolders = this.searchEngine.getAvailableFolders();
    }
  }

  closeFolderSelector() {
    this.isFolderSelectorOpen = false;
  }

  toggleFolderSelection(folderId: string) {
    if (this.selectedFolderIds.has(folderId)) {
      this.selectedFolderIds.delete(folderId);
    } else {
      this.selectedFolderIds.add(folderId);
    }
    this.searchEngine.setScope(this.searchScope, this.selectedFolderIds);
    this.onSearchChange();
  }

  isFolderSelected(folderId: string): boolean {
    return this.selectedFolderIds.has(folderId);
  }

  selectAllFolders() {
    for (const folder of this.availableFolders) {
      this.selectedFolderIds.add(folder.id);
    }
    this.searchEngine.setScope(this.searchScope, this.selectedFolderIds);
    this.onSearchChange();
  }

  clearFolderSelection() {
    this.selectedFolderIds.clear();
    this.searchEngine.setScope(this.searchScope, this.selectedFolderIds);
    this.onSearchChange();
  }

  resetToRoot() {
    this.selectedFolderIds.clear();
    if (this.rootFolder?.id) {
      this.selectedFolderIds.add(this.rootFolder.id);
    }
    this.searchEngine.setScope(this.searchScope, this.selectedFolderIds);
    this.onSearchChange();
  }

  get filteredAvailableFolders(): Bookmark[] {
    if (!this.folderSearchText.trim()) {
      return this.availableFolders;
    }
    const query = this.folderSearchText.toLowerCase();
    return this.availableFolders.filter((f) => f.title.toLowerCase().includes(query));
  }

  get placeholderText(): string {
    if (this.searchScope === 'root') {
      const folderName = this.rootFolder?.title || this.i18n.t('rootFolderScope');
      return `${this.i18n.t('searchPlaceholder')} (${folderName})`;
    }
    if (this.searchScope === 'all') {
      return `${this.i18n.t('searchPlaceholder')} (${this.i18n.t('allBookmarksScope')})`;
    }
    const count = this.selectedFolderIds.size;
    return `${this.i18n.t('searchPlaceholder')} (${this.i18n.t('foldersSelected', [count.toString()])})`;
  }

  onSearchChange() {
    if (!this.searchQuery.trim()) {
      this.searchResults = [];
      this.selectedIndex = 0;
      return;
    }

    this.searchResults = this.searchEngine.search(this.searchQuery, {
      scope: this.searchScope,
      whitelistFolderIds: this.selectedFolderIds,
    });
    this.selectedIndex = 0;
  }

  onSelectResult(result: SearchResult) {
    this.confirm.emit(result.bookmark);
    this.modalService.close();
  }

  onCancel() {
    this.modalService.close();
  }

  onBackdropClick(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('modal') && !this.searchQuery?.trim()) {
      this.onCancel();
    }
  }

  getPathString(path: string[]): string {
    return path.slice(1, -1).join(' > ') || '';
  }
}

