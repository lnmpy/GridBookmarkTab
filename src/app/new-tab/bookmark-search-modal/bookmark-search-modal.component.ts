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
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { Bookmark, SearchScope } from '@app/services/types';
import { ModalService } from '@app/services/modal.service';
import { BookmarkService } from '@app/services/bookmark.service';
import { SettingsService } from '@app/services/settings.service';
import { I18nService } from '@app/services/i18n.service';

interface FuzzyMatchResult {
  score: number;
  matchedIndices: number[];
}

export interface SearchResult {
  bookmark: Bookmark;
  score: number;
  path: string[];
  highlightedTitle: SafeHtml;
  highlightedUrl: SafeHtml;
}

@Component({
  selector: 'app-bookmark-search-modal',
  imports: [CommonModule, FormsModule],
  standalone: true,
  templateUrl: './bookmark-search-modal.component.html',
  styleUrls: ['./bookmark-search-modal.component.scss'],
})
export class BookmarkSearchModalComponent implements OnInit, AfterViewInit {
  private modalService: ModalService = inject(ModalService);
  private bookmarkService: BookmarkService = inject(BookmarkService);
  private settingsService: SettingsService = inject(SettingsService);
  private sanitizer: DomSanitizer = inject(DomSanitizer);
  public i18n: I18nService = inject(I18nService);

  @Input() rootFolder?: Bookmark;
  @Output() confirm = new EventEmitter<Bookmark>();
  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  title: string = 'Search Bookmarks';
  searchQuery: string = '';
  allBookmarks: Bookmark[] = [];
  searchResults: SearchResult[] = [];
  selectedIndex: number = 0;

  // Search scope & whitelist state
  searchScope: SearchScope = 'root';
  selectedFolderIds = new Set<string>();
  availableFolders: Bookmark[] = [];
  isFolderSelectorOpen: boolean = false;
  folderSearchText: string = '';

  private currentRootTree: Bookmark | null = null;
  private fullBookmarkTree: Bookmark | null = null;

  async ngOnInit() {
    const currentSettings = this.settingsService.settingsSource.value;
    this.searchScope = currentSettings.searchScope || 'root';

    if (currentSettings.searchFolderWhitelist && currentSettings.searchFolderWhitelist.length > 0) {
      this.selectedFolderIds = new Set(currentSettings.searchFolderWhitelist);
    }

    // Subscribe to current root bookmark tree
    this.bookmarkService.bookmarks$.subscribe((root) => {
      if (root) {
        this.currentRootTree = root;
        if (!this.rootFolder) {
          this.rootFolder = root;
        }
        if (this.selectedFolderIds.size === 0 && this.rootFolder?.id) {
          this.selectedFolderIds.add(this.rootFolder.id);
        }
        this.refreshScopeBookmarks();
      }
    });

    try {
      this.availableFolders = await this.bookmarkService.getAllBookmarkFolders();
    } catch (e) {
      if (this.currentRootTree) {
        this.availableFolders = this.bookmarkService.getFoldersFromNode(this.currentRootTree);
      }
    }

    // Load full bookmark tree to support searching in 'all' and 'custom' scopes across all Chrome bookmark roots
    try {
      const fullTree = await this.bookmarkService.getFullBookmarkTree();
      if (fullTree) {
        this.fullBookmarkTree = fullTree;
        if (this.availableFolders.length === 0) {
          this.availableFolders = this.bookmarkService.getFoldersFromNode(fullTree);
        }
        this.refreshScopeBookmarks();
        if (this.searchQuery) {
          this.onSearchChange();
        }
      }
    } catch (e) {
      console.warn('Failed to load full bookmark tree:', e);
    }
  }

  ngAfterViewInit() {
    // Focus the input field after view is initialized
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
    this.refreshScopeBookmarks();
    this.onSearchChange();
  }

  toggleFolderSelector() {
    this.isFolderSelectorOpen = !this.isFolderSelectorOpen;
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
    this.refreshScopeBookmarks();
    this.onSearchChange();
  }

  isFolderSelected(folderId: string): boolean {
    return this.selectedFolderIds.has(folderId);
  }

  selectAllFolders() {
    for (const folder of this.availableFolders) {
      this.selectedFolderIds.add(folder.id);
    }
    this.refreshScopeBookmarks();
    this.onSearchChange();
  }

  clearFolderSelection() {
    this.selectedFolderIds.clear();
    this.refreshScopeBookmarks();
    this.onSearchChange();
  }

  resetToRoot() {
    this.selectedFolderIds.clear();
    const targetId = this.rootFolder?.id || this.currentRootTree?.id;
    if (targetId) {
      this.selectedFolderIds.add(targetId);
    }
    this.refreshScopeBookmarks();
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

  public refreshScopeBookmarks() {
    const root = this.currentRootTree || this.rootFolder;
    const full = this.fullBookmarkTree || root;
    if (!root && !full) {
      this.allBookmarks = [];
      return;
    }

    if (this.searchScope === 'root') {
      const targetRoot = this.rootFolder || root;
      this.allBookmarks = targetRoot ? this.flattenBookmarks(targetRoot, []) : [];
    } else if (this.searchScope === 'all') {
      const targetRoot = full || root;
      this.allBookmarks = targetRoot ? this.flattenBookmarks(targetRoot, []) : [];
    } else if (this.searchScope === 'custom') {
      const targetRoot = full || root;
      this.allBookmarks = targetRoot ? this.getBookmarksFromFolderIds(targetRoot, this.selectedFolderIds) : [];
    }
  }

  private flattenBookmarks(bookmark: Bookmark, path: string[]): Bookmark[] {
    const results: Bookmark[] = [];
    const currentPath = bookmark.title ? [...path, bookmark.title] : path;

    if (bookmark.type === 'bookmark' && bookmark.url) {
      results.push({
        ...bookmark,
        path: currentPath,
      } as any);
    }

    if (bookmark.children) {
      for (const child of bookmark.children) {
        results.push(...this.flattenBookmarks(child, currentPath));
      }
    }

    return results;
  }

  private getBookmarksFromFolderIds(root: Bookmark, folderIds: Set<string>): Bookmark[] {
    const results: Bookmark[] = [];
    const visitedBookmarkIds = new Set<string>();

    const findAndCollect = (node: Bookmark, path: string[], isUnderSelectedFolder: boolean) => {
      const currentPath = node.title ? [...path, node.title] : path;
      const isSelected = folderIds.has(node.id) || isUnderSelectedFolder;

      if (node.type === 'bookmark' && node.url && isSelected) {
        if (!visitedBookmarkIds.has(node.id)) {
          visitedBookmarkIds.add(node.id);
          results.push({
            ...node,
            path: currentPath,
          } as any);
        }
      }

      if (node.children) {
        for (const child of node.children) {
          findAndCollect(child, currentPath, isSelected);
        }
      }
    };

    findAndCollect(root, [], false);
    return results;
  }

  onSearchChange() {
    if (!this.searchQuery.trim()) {
      this.searchResults = [];
      this.selectedIndex = 0;
      return;
    }

    const query = this.searchQuery.toLowerCase();
    const results: SearchResult[] = [];

    for (const bookmark of this.allBookmarks) {
      const titleMatch = this.fuzzyMatch(query, bookmark.title.toLowerCase());
      const urlMatch = this.fuzzyMatch(query, (bookmark.url || '').toLowerCase());

      // Title weight is 2x URL weight
      const titleWeight = 2;
      const urlWeight = 1;

      const totalScore = titleMatch.score * titleWeight + urlMatch.score * urlWeight;

      // Only include results where at least one of title or url has all query chars matched
      if (titleMatch.score > 0 || urlMatch.score > 0) {
        results.push({
          bookmark,
          score: totalScore,
          path: (bookmark as any).path || [],
          highlightedTitle: this.highlightMatches(bookmark.title, titleMatch.matchedIndices),
          highlightedUrl: this.highlightMatches(bookmark.url || '', urlMatch.matchedIndices),
        });
      }
    }

    // Sort by score (higher is better)
    results.sort((a, b) => b.score - a.score);

    // Limit to top 50 results
    this.searchResults = results.slice(0, 50);
    this.selectedIndex = 0;
  }

  /**
   * Fuzzy match algorithm that tracks matched character positions
   * Returns score and matched indices for highlighting
   */
  private fuzzyMatch(query: string, text: string): FuzzyMatchResult {
    if (!query || !text) {
      return { score: 0, matchedIndices: [] };
    }

    const matchedIndices: number[] = [];
    let score = 0;
    let textIndex = 0;
    let consecutiveMatches = 0;
    let lastMatchIndex = -1;

    // Try to match all query characters in order
    for (let i = 0; i < query.length; i++) {
      const char = query[i];
      const foundIndex = text.indexOf(char, textIndex);

      if (foundIndex === -1) {
        // Character not found - no match
        return { score: 0, matchedIndices: [] };
      }

      matchedIndices.push(foundIndex);

      // Base score for matching a character
      score += 10;

      // Bonus for consecutive matches
      if (foundIndex === lastMatchIndex + 1) {
        consecutiveMatches++;
        score += 5 * consecutiveMatches;
      } else {
        consecutiveMatches = 0;
      }

      // Bonus for match at word boundary (start of text or after space/separator)
      if (foundIndex === 0 || /[\s\-_./]/.test(text[foundIndex - 1])) {
        score += 15;
      }

      // Bonus for match at start of text
      if (foundIndex === 0) {
        score += 20;
      }

      // Penalty for distance from last match (prefer closer matches)
      if (lastMatchIndex !== -1) {
        const gap = foundIndex - lastMatchIndex - 1;
        score -= Math.min(gap, 5); // Cap penalty at 5
      }

      lastMatchIndex = foundIndex;
      textIndex = foundIndex + 1;
    }

    // Bonus if query matches the beginning of the text exactly
    if (text.startsWith(query)) {
      score += 50;
    }

    // Bonus for shorter text (prefer more specific matches)
    score += Math.max(0, 20 - text.length / 10);

    return { score, matchedIndices };
  }

  /**
   * Create highlighted HTML string with matched characters wrapped in span
   */
  private highlightMatches(text: string, matchedIndices: number[]): SafeHtml {
    if (!text || matchedIndices.length === 0) {
      return this.sanitizer.bypassSecurityTrustHtml(this.escapeHtml(text));
    }

    const indexSet = new Set(matchedIndices);
    let result = '';
    let inHighlight = false;

    for (let i = 0; i < text.length; i++) {
      const isMatch = indexSet.has(i);

      if (isMatch && !inHighlight) {
        result += '<span class="fuzzy-highlight">';
        inHighlight = true;
      } else if (!isMatch && inHighlight) {
        result += '</span>';
        inHighlight = false;
      }

      result += this.escapeHtml(text[i]);
    }

    if (inHighlight) {
      result += '</span>';
    }

    return this.sanitizer.bypassSecurityTrustHtml(result);
  }

  /**
   * Escape HTML special characters to prevent XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
    // Remove root and current item, join rest
    return path.slice(1, -1).join(' > ') || '';
  }
}
