import { Component, EventEmitter, OnInit, AfterViewInit, Output, inject, HostListener, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { Bookmark } from '@app/services/types';
import { ModalService } from '@app/services/modal.service';
import { BookmarkService } from '@app/services/bookmark.service';

interface SearchResult {
  bookmark: Bookmark;
  score: number;
  path: string[];
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

  @Output() confirm = new EventEmitter<Bookmark>();
  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  title: string = 'Search Bookmarks';
  searchQuery: string = '';
  allBookmarks: Bookmark[] = [];
  searchResults: SearchResult[] = [];
  selectedIndex: number = 0;

  ngOnInit() {
    // Flatten all bookmarks for searching
    this.bookmarkService.bookmarks$.subscribe((root) => {
      if (root) {
        this.allBookmarks = this.flattenBookmarks(root, []);
      }
    });
  }

  ngAfterViewInit() {
    // Focus the input field after view is initialized
    setTimeout(() => {
      this.searchInput?.nativeElement?.focus();
    }, 100);
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: KeyboardEvent) {
    event.preventDefault();
    this.onCancel();
  }

  @HostListener('document:keydown.arrowdown', ['$event'])
  onArrowDown(event: KeyboardEvent) {
    event.preventDefault();
    if (this.searchResults.length > 0) {
      this.selectedIndex = (this.selectedIndex + 1) % this.searchResults.length;
      this.scrollToSelected();
    }
  }

  @HostListener('document:keydown.arrowup', ['$event'])
  onArrowUp(event: KeyboardEvent) {
    event.preventDefault();
    if (this.searchResults.length > 0) {
      this.selectedIndex = this.selectedIndex === 0 ? this.searchResults.length - 1 : this.selectedIndex - 1;
      this.scrollToSelected();
    }
  }

  @HostListener('document:keydown.enter', ['$event'])
  onEnterKey(event: KeyboardEvent) {
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

  private flattenBookmarks(bookmark: Bookmark, path: string[]): Bookmark[] {
    const results: Bookmark[] = [];
    const currentPath = [...path, bookmark.title];

    if (bookmark.type === 'bookmark' && bookmark.url) {
      results.push({
        ...bookmark,
        // Store path for display
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

  onSearchChange() {
    if (!this.searchQuery.trim()) {
      this.searchResults = [];
      this.selectedIndex = 0;
      return;
    }

    const query = this.searchQuery.toLowerCase();
    const results: SearchResult[] = [];

    for (const bookmark of this.allBookmarks) {
      const score = this.fuzzyMatch(query, bookmark);
      if (score > 0) {
        results.push({
          bookmark,
          score,
          path: (bookmark as any).path || [],
        });
      }
    }

    // Sort by score (higher is better)
    results.sort((a, b) => b.score - a.score);

    // Limit to top 50 results
    this.searchResults = results.slice(0, 50);
    this.selectedIndex = 0;
  }

  private fuzzyMatch(query: string, bookmark: Bookmark): number {
    const title = bookmark.title.toLowerCase();
    const url = (bookmark.url || '').toLowerCase();

    let score = 0;

    // Exact match gets highest score
    if (title.includes(query)) {
      score += 100;
      // Bonus for match at start
      if (title.startsWith(query)) {
        score += 50;
      }
    }

    // URL match
    if (url.includes(query)) {
      score += 50;
    }

    // Fuzzy matching: check if all characters of query appear in order
    let titleIndex = 0;
    let urlIndex = 0;
    let fuzzyScore = 0;

    for (let i = 0; i < query.length; i++) {
      const char = query[i];

      // Search in title
      const titlePos = title.indexOf(char, titleIndex);
      if (titlePos !== -1) {
        fuzzyScore += 10;
        // Bonus for consecutive matches
        if (titlePos === titleIndex) {
          fuzzyScore += 5;
        }
        titleIndex = titlePos + 1;
      }

      // Search in URL
      const urlPos = url.indexOf(char, urlIndex);
      if (urlPos !== -1) {
        fuzzyScore += 5;
        urlIndex = urlPos + 1;
      }
    }

    score += fuzzyScore;

    return score;
  }

  onSelectResult(result: SearchResult) {
    this.confirm.emit(result.bookmark);
    this.modalService.close();
  }

  onCancel() {
    this.modalService.close();
  }

  getPathString(path: string[]): string {
    // Remove root and current item, join rest
    return path.slice(1, -1).join(' > ') || '';
  }
}
