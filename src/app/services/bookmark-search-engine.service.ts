import { Injectable, inject } from '@angular/core';
import { Bookmark, SearchScope, SearchResult, HighlightSegment, SearchScopeOptions } from '@app/services/types';
import { BookmarkService } from '@app/services/bookmark.service';
import { SettingsService } from '@app/services/settings.service';

interface FuzzyMatchResult {
  score: number;
  matchedIndices: number[];
}

export interface IndexedBookmark extends Bookmark {
  path: string[];
}

@Injectable({
  providedIn: 'root',
})
export class BookmarkSearchEngineService {
  private bookmarkService = inject(BookmarkService);
  private settingsService = inject(SettingsService);

  private currentRootTree: Bookmark | null = null;
  private fullBookmarkTree: Bookmark | null = null;
  private availableFolders: Bookmark[] = [];
  private currentScope: SearchScope = 'default';
  private selectedFolderIds: Set<string> = new Set();

  private cachedScopeBookmarks: IndexedBookmark[] = [];

  constructor() {
    // Synchronize settings
    this.settingsService.onSettingsChange().subscribe((settings) => {
      if (settings) {
        if (settings.searchScope) {
          this.currentScope = settings.searchScope === 'custom' ? 'custom' : 'default';
        }
        if (settings.searchFolderWhitelist && settings.searchFolderWhitelist.length > 0) {
          this.selectedFolderIds = new Set(settings.searchFolderWhitelist);
        }
        this.refreshScopeBookmarks();
      }
    });

    // Synchronize root bookmark tree
    this.bookmarkService.bookmarks$.subscribe((root) => {
      if (root) {
        this.currentRootTree = root;
        if (this.selectedFolderIds.size === 0 && root.id) {
          this.selectedFolderIds.add(root.id);
        }
        this.refreshScopeBookmarks();
      }
    });
  }

  public async init(): Promise<void> {
    try {
      this.availableFolders = await this.bookmarkService.getAllBookmarkFolders();
    } catch {
      if (this.currentRootTree) {
        this.availableFolders = this.bookmarkService.getFoldersFromNode(this.currentRootTree);
      }
    }

    try {
      const fullTree = await this.bookmarkService.getFullBookmarkTree();
      if (fullTree) {
        this.fullBookmarkTree = fullTree;
        if (this.availableFolders.length === 0) {
          this.availableFolders = this.bookmarkService.getFoldersFromNode(fullTree);
        }
        this.refreshScopeBookmarks();
      }
    } catch (e) {
      console.warn('Failed to load full bookmark tree:', e);
    }
  }

  public setScope(scope: SearchScope, whitelistFolderIds?: Set<string> | string[]): void {
    this.currentScope = scope === 'custom' ? 'custom' : 'default';
    if (whitelistFolderIds) {
      this.selectedFolderIds = new Set(whitelistFolderIds);
    } else if (this.currentScope === 'custom' && this.selectedFolderIds.size === 0 && this.currentRootTree?.id) {
      this.selectedFolderIds.add(this.currentRootTree.id);
    }
    this.refreshScopeBookmarks();
  }

  public getAvailableFolders(): Bookmark[] {
    return this.availableFolders;
  }

  public getScopeBookmarks(): IndexedBookmark[] {
    return this.cachedScopeBookmarks;
  }

  public refreshScopeBookmarks(scopeOptions?: SearchScopeOptions): void {
    const rawScope = scopeOptions?.scope || this.currentScope;
    const scope: SearchScope = rawScope === 'custom' ? 'custom' : 'default';
    const folderIds = scopeOptions?.whitelistFolderIds
      ? new Set(scopeOptions.whitelistFolderIds)
      : this.selectedFolderIds;

    const root = this.currentRootTree;
    const full = this.fullBookmarkTree || root;

    if (!root && !full) {
      this.cachedScopeBookmarks = [];
      return;
    }

    if (scope === 'default') {
      const targetRoot = root;
      this.cachedScopeBookmarks = targetRoot ? this.flattenBookmarks(targetRoot, []) : [];
    } else if (scope === 'custom') {
      const targetRoot = full || root;
      this.cachedScopeBookmarks = targetRoot
        ? this.getBookmarksFromFolderIds(targetRoot, folderIds)
        : [];
    }
  }

  public search(query: string, scopeOptions?: SearchScopeOptions): SearchResult[] {
    if (!query || !query.trim()) {
      return [];
    }

    if (scopeOptions) {
      this.refreshScopeBookmarks(scopeOptions);
    }

    const trimmedQuery = query.toLowerCase().trim();
    const results: SearchResult[] = [];

    const titleWeight = 2;
    const urlWeight = 1;

    for (const bookmark of this.cachedScopeBookmarks) {
      const titleMatch = this.fuzzyMatch(trimmedQuery, (bookmark.title || '').toLowerCase());
      const urlMatch = this.fuzzyMatch(trimmedQuery, (bookmark.url || '').toLowerCase());

      const totalScore = titleMatch.score * titleWeight + urlMatch.score * urlWeight;

      if (titleMatch.score > 0 || urlMatch.score > 0) {
        results.push({
          bookmark,
          score: totalScore,
          path: bookmark.path || [],
          titleSegments: this.createHighlightSegments(bookmark.title || '', titleMatch.matchedIndices),
          urlSegments: this.createHighlightSegments(bookmark.url || '', urlMatch.matchedIndices),
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 50);
  }

  public fuzzyMatch(query: string, text: string): FuzzyMatchResult {
    if (!query || !text) {
      return { score: 0, matchedIndices: [] };
    }

    const tokens = query.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      return { score: 0, matchedIndices: [] };
    }

    if (tokens.length === 1) {
      const singleMatch = this.matchSingleToken(tokens[0], text);
      if (singleMatch.score === 0) {
        return { score: 0, matchedIndices: [] };
      }
      const score = singleMatch.score + Math.max(0, 20 - text.length / 10);
      return { score, matchedIndices: singleMatch.matchedIndices };
    }

    // Multi-token search (AND logic across all tokens)
    const tokenResults: FuzzyMatchResult[] = [];
    const allIndices = new Set<number>();
    let totalScore = 0;

    for (const token of tokens) {
      const result = this.matchSingleToken(token, text);
      if (result.score === 0) {
        return { score: 0, matchedIndices: [] };
      }
      tokenResults.push(result);
      totalScore += result.score;
      for (const idx of result.matchedIndices) {
        allIndices.add(idx);
      }
    }

    // In-order bonus: check if token matches appear in the order of query tokens
    let inOrder = true;
    for (let i = 1; i < tokenResults.length; i++) {
      const prevFirstIndex = tokenResults[i - 1].matchedIndices[0];
      const currFirstIndex = tokenResults[i].matchedIndices[0];
      if (currFirstIndex < prevFirstIndex) {
        inOrder = false;
        break;
      }
    }

    if (inOrder) {
      totalScore += 30;

      // Proximity bonus: check gaps between consecutive token matches
      let closeProximity = true;
      for (let i = 1; i < tokenResults.length; i++) {
        const prevLastIndex =
          tokenResults[i - 1].matchedIndices[tokenResults[i - 1].matchedIndices.length - 1];
        const currFirstIndex = tokenResults[i].matchedIndices[0];
        const gap = currFirstIndex - prevLastIndex - 1;
        if (gap <= 2) {
          totalScore += 15;
        } else {
          closeProximity = false;
        }
      }
      if (closeProximity) {
        totalScore += 20;
      }
    }

    // Full query tokens matched bonus
    totalScore += 40;
    totalScore += Math.max(0, 20 - text.length / 10);

    const sortedIndices = Array.from(allIndices).sort((a, b) => a - b);
    return { score: totalScore, matchedIndices: sortedIndices };
  }

  private matchSingleToken(token: string, text: string): FuzzyMatchResult {
    if (!token || !text) {
      return { score: 0, matchedIndices: [] };
    }

    // 1. Try exact substring match first (pick the occurrence with the best score)
    let bestSubstringMatch: FuzzyMatchResult | null = null;
    let searchStart = 0;

    while (searchStart < text.length) {
      const foundPos = text.indexOf(token, searchStart);
      if (foundPos === -1) break;

      const indices: number[] = [];
      for (let i = 0; i < token.length; i++) {
        indices.push(foundPos + i);
      }

      let subScore = token.length * 20;

      // Word boundary bonus at start
      const isWordStart = foundPos === 0 || /[\s\-_./]/.test(text[foundPos - 1]);
      if (isWordStart) {
        subScore += 25;
      }

      // Start of string bonus
      if (foundPos === 0) {
        subScore += 30;
      }

      // Word boundary bonus at end
      const endPos = foundPos + token.length;
      const isWordEnd = endPos === text.length || /[\s\-_./]/.test(text[endPos]);
      if (isWordEnd) {
        subScore += 15;
      }

      // Exact full match bonus
      if (foundPos === 0 && endPos === text.length) {
        subScore += 50;
      }

      if (!bestSubstringMatch || subScore > bestSubstringMatch.score) {
        bestSubstringMatch = { score: subScore, matchedIndices: indices };
      }

      searchStart = foundPos + 1;
    }

    if (bestSubstringMatch) {
      return bestSubstringMatch;
    }

    // 2. Fallback to fuzzy subsequence match
    return this.matchSubsequence(token, text);
  }

  private matchSubsequence(pattern: string, text: string): FuzzyMatchResult {
    const matchedIndices: number[] = [];
    let score = 0;
    let textIndex = 0;
    let consecutiveMatches = 0;
    let lastMatchIndex = -1;

    for (let i = 0; i < pattern.length; i++) {
      const char = pattern[i];
      const foundIndex = text.indexOf(char, textIndex);

      if (foundIndex === -1) {
        return { score: 0, matchedIndices: [] };
      }

      matchedIndices.push(foundIndex);
      score += 10;

      // Bonus for consecutive matches
      if (foundIndex === lastMatchIndex + 1) {
        consecutiveMatches++;
        score += 5 * consecutiveMatches;
      } else {
        consecutiveMatches = 0;
      }

      // Bonus for word boundary
      if (foundIndex === 0 || /[\s\-_./]/.test(text[foundIndex - 1])) {
        score += 15;
      }

      // Bonus for match at start of text
      if (foundIndex === 0) {
        score += 20;
      }

      // Penalty for distance between matches
      if (lastMatchIndex !== -1) {
        const gap = foundIndex - lastMatchIndex - 1;
        score -= Math.min(gap, 5);
      }

      lastMatchIndex = foundIndex;
      textIndex = foundIndex + 1;
    }

    // Bonus for prefix match
    if (text.startsWith(pattern)) {
      score += 50;
    }

    return { score, matchedIndices };
  }

  public createHighlightSegments(text: string, matchedIndices: number[]): HighlightSegment[] {
    if (!text) {
      return [];
    }
    if (!matchedIndices || matchedIndices.length === 0) {
      return [{ text, isMatch: false }];
    }

    const indexSet = new Set(matchedIndices);
    const segments: HighlightSegment[] = [];
    let currentBuffer = '';
    let currentIsMatch = indexSet.has(0);

    for (let i = 0; i < text.length; i++) {
      const isMatch = indexSet.has(i);
      if (isMatch === currentIsMatch) {
        currentBuffer += text[i];
      } else {
        if (currentBuffer) {
          segments.push({ text: currentBuffer, isMatch: currentIsMatch });
        }
        currentBuffer = text[i];
        currentIsMatch = isMatch;
      }
    }

    if (currentBuffer) {
      segments.push({ text: currentBuffer, isMatch: currentIsMatch });
    }

    return segments;
  }

  private flattenBookmarks(bookmark: Bookmark, path: string[]): IndexedBookmark[] {
    const results: IndexedBookmark[] = [];
    const currentPath = bookmark.title ? [...path, bookmark.title] : path;

    if (bookmark.type === 'bookmark' && bookmark.url) {
      results.push({
        ...bookmark,
        path: currentPath,
      });
    }

    if (bookmark.children) {
      for (const child of bookmark.children) {
        results.push(...this.flattenBookmarks(child, currentPath));
      }
    }

    return results;
  }

  private getBookmarksFromFolderIds(root: Bookmark, folderIds: Set<string>): IndexedBookmark[] {
    const results: IndexedBookmark[] = [];
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
          });
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
}
