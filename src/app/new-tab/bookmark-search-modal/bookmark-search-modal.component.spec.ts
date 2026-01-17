import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { of } from 'rxjs';

import { BookmarkSearchModalComponent } from './bookmark-search-modal.component';
import { ModalService } from '@app/services/modal.service';
import { BookmarkService } from '@app/services/bookmark.service';
import { Bookmark } from '@app/services/types';

describe('BookmarkSearchModalComponent', () => {
  let component: BookmarkSearchModalComponent;
  let fixture: ComponentFixture<BookmarkSearchModalComponent>;
  let mockModalService: jasmine.SpyObj<ModalService>;
  let mockBookmarkService: jasmine.SpyObj<BookmarkService>;

  const mockBookmarks: Bookmark = {
    id: 'root',
    title: 'Root',
    type: 'bookmarkFolder',
    children: [
      {
        id: '1',
        title: 'Google',
        url: 'https://google.com',
        type: 'bookmark',
        favIconUrl: 'https://google.com/favicon.ico',
      },
      {
        id: '2',
        title: 'GitHub',
        url: 'https://github.com',
        type: 'bookmark',
        favIconUrl: 'https://github.com/favicon.ico',
      },
      {
        id: '3',
        title: 'Folder',
        type: 'bookmarkFolder',
        children: [
          {
            id: '4',
            title: 'YouTube',
            url: 'https://youtube.com',
            type: 'bookmark',
            favIconUrl: 'https://youtube.com/favicon.ico',
          },
        ],
      },
    ],
  };

  beforeEach(async () => {
    mockModalService = jasmine.createSpyObj('ModalService', ['close']);
    mockBookmarkService = jasmine.createSpyObj('BookmarkService', [], {
      bookmarks$: of(mockBookmarks),
    });

    await TestBed.configureTestingModule({
      imports: [BookmarkSearchModalComponent, FormsModule],
      providers: [
        { provide: ModalService, useValue: mockModalService },
        { provide: BookmarkService, useValue: mockBookmarkService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BookmarkSearchModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should flatten bookmarks on init', () => {
    expect(component.allBookmarks.length).toBe(3);
    expect(component.allBookmarks[0].title).toBe('Google');
    expect(component.allBookmarks[1].title).toBe('GitHub');
    expect(component.allBookmarks[2].title).toBe('YouTube');
  });

  it('should search bookmarks with exact match', () => {
    component.searchQuery = 'Google';
    component.onSearchChange();

    expect(component.searchResults.length).toBeGreaterThan(0);
    expect(component.searchResults[0].bookmark.title).toBe('Google');
  });

  it('should search bookmarks with fuzzy match', () => {
    component.searchQuery = 'git';
    component.onSearchChange();

    expect(component.searchResults.length).toBeGreaterThan(0);
    expect(component.searchResults[0].bookmark.title).toBe('GitHub');
  });

  it('should clear results when search query is empty', () => {
    component.searchQuery = 'Google';
    component.onSearchChange();
    expect(component.searchResults.length).toBeGreaterThan(0);

    component.searchQuery = '';
    component.onSearchChange();
    expect(component.searchResults.length).toBe(0);
  });

  it('should handle arrow down key', () => {
    component.searchQuery = 'o';
    component.onSearchChange();

    expect(component.selectedIndex).toBe(0);

    const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
    component.onArrowDown(event);

    expect(component.selectedIndex).toBe(1);
  });

  it('should handle arrow up key', () => {
    component.searchQuery = 'o';
    component.onSearchChange();
    component.selectedIndex = 1;

    const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
    component.onArrowUp(event);

    expect(component.selectedIndex).toBe(0);
  });

  it('should emit confirm event on Enter key', () => {
    spyOn(component.confirm, 'emit');
    component.searchQuery = 'Google';
    component.onSearchChange();

    const event = new KeyboardEvent('keydown', { key: 'Enter' });
    component.onEnterKey(event);

    expect(component.confirm.emit).toHaveBeenCalledWith(
      component.searchResults[0].bookmark
    );
    expect(mockModalService.close).toHaveBeenCalled();
  });

  it('should close modal on Escape key', () => {
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    component.onEscapeKey(event);

    expect(mockModalService.close).toHaveBeenCalled();
  });

  it('should select result on click', () => {
    spyOn(component.confirm, 'emit');
    component.searchQuery = 'Google';
    component.onSearchChange();

    component.onSelectResult(component.searchResults[0]);

    expect(component.confirm.emit).toHaveBeenCalledWith(
      component.searchResults[0].bookmark
    );
    expect(mockModalService.close).toHaveBeenCalled();
  });

  it('should get path string correctly', () => {
    const path = ['Root', 'Folder', 'YouTube'];
    const result = component.getPathString(path);

    expect(result).toBe('Folder');
  });

  it('should limit results to 50', () => {
    // Manually populate allBookmarks with 100 items
    component.allBookmarks = Array.from({ length: 100 }, (_, i) => ({
      id: `${i}`,
      title: `Bookmark ${i}`,
      url: `https://example${i}.com`,
      type: 'bookmark' as const,
      favIconUrl: 'https://example.com/favicon.ico',
    }));

    component.searchQuery = 'Bookmark';
    component.onSearchChange();

    expect(component.searchResults.length).toBeLessThanOrEqual(50);
  });

  it('should score exact matches higher than fuzzy matches', () => {
    component.searchQuery = 'Google';
    component.onSearchChange();

    const topResult = component.searchResults[0];
    expect(topResult.bookmark.title).toBe('Google');
    expect(topResult.score).toBeGreaterThan(100);
  });
});
