import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';

import { BookmarkModalComponent } from './bookmark-modal.component';
import { BookmarkService } from '@app/services/bookmark.service';
import { ModalService } from '@app/services/modal.service';
import { FaviconService } from '@app/services/favicon.service';
import { TabService } from '@app/services/tab.service';
import { Bookmark } from '@app/services/types';

describe('BookmarkModalComponent', () => {
  let component: BookmarkModalComponent;
  let fixture: ComponentFixture<BookmarkModalComponent>;
  let mockBookmarkService: jasmine.SpyObj<BookmarkService>;
  let mockModalService: jasmine.SpyObj<ModalService>;
  let mockFaviconService: jasmine.SpyObj<FaviconService>;
  let mockTabService: jasmine.SpyObj<TabService>;

  const mockBookmark: Bookmark = {
    id: '1',
    title: 'Test Bookmark',
    url: 'https://example.com',
    type: 'bookmark',
    parentId: '1',
    favIconUrl: 'https://example.com/favicon.ico',
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
    mockFaviconService = jasmine.createSpyObj('FaviconService', [
      'urlToBase64Public',
      'saveCustomIcon',
    ]);
    mockTabService = jasmine.createSpyObj('TabService', ['createWindow']);

    await TestBed.configureTestingModule({
      imports: [BookmarkModalComponent, FormsModule],
      providers: [
        { provide: BookmarkService, useValue: mockBookmarkService },
        { provide: ModalService, useValue: mockModalService },
        { provide: FaviconService, useValue: mockFaviconService },
        { provide: TabService, useValue: mockTabService },
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

  it('should initialize with bookmark data and preview favicon', () => {
    expect(component.bookmarkTitle).toBe(mockBookmark.title);
    expect(component.bookmarkUrl).toBe(mockBookmark.url);
    expect(component.previewFaviconUrl).toBe(mockBookmark.favIconUrl!);
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

  it('should update preview on favicon URL change', async () => {
    component.faviconUrl = 'https://example.com/new-icon.png';
    await component.onFaviconUrlChange();

    expect(component.faviconError).toBeUndefined();
    expect(component.previewFaviconUrl).toBe('https://example.com/new-icon.png');
  });

  it('should show error for invalid favicon URL format', async () => {
    component.faviconUrl = 'invalid url text';
    await component.onFaviconUrlChange();

    expect(component.faviconError).toBe(component.i18n.t('invalidUrlFormat'));
    expect(component.previewFaviconUrl).toBe(mockBookmark.favIconUrl!);
  });

  it('should restore initial favicon preview when favicon input is empty', async () => {
    component.faviconUrl = '';
    await component.onFaviconUrlChange();

    expect(component.faviconError).toBeUndefined();
    expect(component.previewFaviconUrl).toBe(mockBookmark.favIconUrl!);
  });

  it('should accept raw SVG markup and convert to data URI', async () => {
    const rawSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>';
    component.faviconUrl = rawSvg;

    await component.onFaviconUrlChange();

    expect(component.faviconError).toBeUndefined();
    expect(component.previewFaviconUrl).toContain('data:image/svg+xml;base64,');

    mockBookmarkService.update.and.returnValue(Promise.resolve());
    mockFaviconService.saveCustomIcon.and.returnValue(Promise.resolve());
    spyOn(component.confirm, 'emit');

    await component.onConfirm();

    expect(mockFaviconService.saveCustomIcon).toHaveBeenCalledWith(
      mockBookmark.id,
      jasmine.stringMatching(/^data:image\/svg\+xml;base64,/)
    );
    expect(component.confirm.emit).toHaveBeenCalled();
    expect(mockModalService.close).toHaveBeenCalled();
  });

  it('should accept SVG Data URI directly', async () => {
    const dataUri = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==';
    component.faviconUrl = dataUri;

    await component.onFaviconUrlChange();

    expect(component.faviconError).toBeUndefined();
    expect(component.previewFaviconUrl).toBe(dataUri);

    mockBookmarkService.update.and.returnValue(Promise.resolve());
    mockFaviconService.saveCustomIcon.and.returnValue(Promise.resolve());

    await component.onConfirm();

    expect(mockFaviconService.saveCustomIcon).toHaveBeenCalledWith(
      mockBookmark.id,
      dataUri
    );
    expect(mockModalService.close).toHaveBeenCalled();
  });

  it('should save favicon and update bookmark when valid favicon URL is entered', async () => {
    const base64Url = 'data:image/png;base64,abc123';
    mockFaviconService.urlToBase64Public.and.returnValue(Promise.resolve(base64Url));
    mockFaviconService.saveCustomIcon.and.returnValue(Promise.resolve());
    mockBookmarkService.update.and.returnValue(Promise.resolve());
    spyOn(component.confirm, 'emit');

    component.faviconUrl = 'https://example.com/icon.png';
    await component.onConfirm();

    expect(mockFaviconService.urlToBase64Public).toHaveBeenCalledWith('https://example.com/icon.png');
    expect(mockFaviconService.saveCustomIcon).toHaveBeenCalledWith(mockBookmark.id, base64Url);
    expect(component.bookmark.favIconUrl).toBe(base64Url);
    expect(mockBookmarkService.update).toHaveBeenCalled();
    expect(component.confirm.emit).toHaveBeenCalled();
    expect(mockModalService.close).toHaveBeenCalled();
  });

  it('should show error when favicon image fetch fails', async () => {
    mockFaviconService.urlToBase64Public.and.returnValue(Promise.resolve(null));

    component.faviconUrl = 'https://example.com/not-found.png';
    await component.onConfirm();

    expect(component.faviconError).toBe(component.i18n.t('failedToFetchImage'));
    expect(component.isFaviconLoading).toBe(false);
    expect(mockBookmarkService.update).not.toHaveBeenCalled();
    expect(mockModalService.close).not.toHaveBeenCalled();
  });

  it('should handle favicon save errors gracefully', async () => {
    spyOn(console, 'error');
    mockFaviconService.urlToBase64Public.and.returnValue(Promise.resolve('data:image/png;base64,abc'));
    mockFaviconService.saveCustomIcon.and.returnValue(Promise.reject(new Error('Storage failure')));

    component.faviconUrl = 'https://example.com/icon.png';
    await component.onConfirm();

    expect(component.faviconError).toBe(component.i18n.t('errorSavingFavicon'));
    expect(component.isFaviconLoading).toBe(false);
    expect(mockBookmarkService.update).not.toHaveBeenCalled();
  });

  it('should save custom icon when creating a new bookmark with faviconUrl', async () => {
    component.bookmark = {
      id: '',
      title: 'New Bookmark',
      url: 'https://newsite.com',
      type: 'bookmark',
      parentId: '1',
    };
    component.bookmarkTitle = 'New Bookmark';
    component.bookmarkUrl = 'https://newsite.com';
    component.bookmarkParentId = '1';

    const base64Url = 'data:image/png;base64,abc456';
    mockFaviconService.urlToBase64Public.and.returnValue(Promise.resolve(base64Url));
    mockFaviconService.saveCustomIcon.and.returnValue(Promise.resolve());
    mockBookmarkService.create.and.returnValue(Promise.resolve({ id: 'new-id-99', title: 'New Bookmark' } as chrome.bookmarks.BookmarkTreeNode));

    component.faviconUrl = 'https://newsite.com/icon.png';
    await component.onConfirm();

    expect(mockBookmarkService.create).toHaveBeenCalled();
    expect(mockFaviconService.saveCustomIcon).toHaveBeenCalledWith('new-id-99', base64Url);
    expect(mockModalService.close).toHaveBeenCalled();
  });

  it('should process local file selection', async () => {
    const file = new File(['<svg></svg>'], 'icon.svg', { type: 'image/svg+xml' });
    const event = {
      target: {
        files: [file],
        value: 'C:\\fakepath\\icon.svg',
      },
    } as unknown as Event;

    mockFaviconService.saveCustomIcon.and.returnValue(Promise.resolve());

    await component.onFileSelected(event);

    expect(component.faviconError).toBeUndefined();
    expect(component.faviconUrl).toContain('data:image/svg+xml;base64,');
  });

  it('should open search window when onSearchIcon is called', () => {
    component.bookmarkUrl = 'https://example.com';
    component.onSearchIcon();

    expect(mockTabService.createWindow).toHaveBeenCalledWith(
      jasmine.stringMatching(/google\.com\/search\?tbm=isch&q=example\.com%20favicon/),
      false,
      jasmine.any(Object)
    );
  });

  it('should close modal on cancel', () => {
    component.onCancel();
    expect(mockModalService.close).toHaveBeenCalled();
  });

  it('should handle escape key when not loading', () => {
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    component.onKeydownEsc(event);
    expect(mockModalService.close).toHaveBeenCalled();
  });

  it('should not close on escape key when loading', () => {
    component.isFaviconLoading = true;
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    component.onKeydownEsc(event);
    expect(mockModalService.close).not.toHaveBeenCalled();
  });
});

