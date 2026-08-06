import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';

import { BookmarkModalComponent } from './bookmark-modal.component';
import { BookmarkService } from '@app/services/bookmark.service';
import { ModalService } from '@app/services/modal.service';
import { Bookmark } from '@app/services/types';

describe('BookmarkModalComponent', () => {
  let component: BookmarkModalComponent;
  let fixture: ComponentFixture<BookmarkModalComponent>;
  let mockBookmarkService: jasmine.SpyObj<BookmarkService>;
  let mockModalService: jasmine.SpyObj<ModalService>;

  const mockBookmark: Bookmark = {
    id: '1',
    title: 'Test Bookmark',
    url: 'https://example.com',
    type: 'bookmark',
    parentId: '1',
  };

  beforeEach(async () => {
    mockBookmarkService = jasmine.createSpyObj('BookmarkService', [
      'getAllBookmarkFolders',
      'update',
      'create',
    ]);
    mockBookmarkService.getAllBookmarkFolders.and.returnValue(
      Promise.resolve([
        { id: '1', title: 'Root', type: 'bookmarkFolder', depth: 1 },
      ])
    );
    mockModalService = jasmine.createSpyObj('ModalService', ['close']);

    await TestBed.configureTestingModule({
      imports: [BookmarkModalComponent, FormsModule],
      providers: [
        { provide: BookmarkService, useValue: mockBookmarkService },
        { provide: ModalService, useValue: mockModalService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BookmarkModalComponent);
    component = fixture.componentInstance;
    component.bookmark = { ...mockBookmark };
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should accept valid standard URLs with scheme', () => {
    component.bookmarkUrl = 'https://google.com';
    component.onUrlChange();
    expect(component.urlError).toBeUndefined();

    component.bookmarkUrl = 'http://localhost:3000';
    component.onUrlChange();
    expect(component.urlError).toBeUndefined();
  });

  it('should accept non-standard URIs (javascript:, chrome:, mailto:, etc.)', () => {
    component.bookmarkUrl = 'javascript:alert("hello")';
    component.onUrlChange();
    expect(component.urlError).toBeUndefined();

    component.bookmarkUrl = 'chrome://bookmarks';
    component.onUrlChange();
    expect(component.urlError).toBeUndefined();

    component.bookmarkUrl = 'mailto:test@example.com';
    component.onUrlChange();
    expect(component.urlError).toBeUndefined();

    component.bookmarkUrl = 'about:blank';
    component.onUrlChange();
    expect(component.urlError).toBeUndefined();
  });

  it('should accept schema-less URLs (e.g. google.com) and auto-prefix https:// on confirm', async () => {
    component.bookmarkUrl = 'baidu.com';
    component.onUrlChange();
    expect(component.urlError).toBeUndefined();

    mockBookmarkService.update.and.returnValue(Promise.resolve());
    await component.onConfirm();

    expect(mockBookmarkService.update).toHaveBeenCalledWith('1', {
      title: 'Test Bookmark',
      url: 'https://baidu.com',
      parentId: undefined,
    });
    expect(mockModalService.close).toHaveBeenCalled();
  });

  it('should show urlError for invalid URL inputs', () => {
    component.bookmarkUrl = 'invalid url spaces';
    component.onUrlChange();
    expect(component.urlError).toBeDefined();
  });

  it('should prevent submission when url is invalid or empty', async () => {
    component.bookmarkUrl = '';
    await component.onConfirm();
    expect(component.urlError).toBeDefined();
    expect(mockBookmarkService.update).not.toHaveBeenCalled();
  });
});
