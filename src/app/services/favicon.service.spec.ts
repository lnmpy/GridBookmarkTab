import { TestBed } from '@angular/core/testing';
import { FaviconService } from './favicon.service';
import { Bookmark } from './types';

describe('FaviconService', () => {
  let service: FaviconService;

  beforeEach(() => {
    (globalThis as any).chrome.storage.local.get.and.returnValue(Promise.resolve({}));
    (globalThis as any).chrome.storage.local.set.and.returnValue(Promise.resolve());

    TestBed.configureTestingModule({});
    service = TestBed.inject(FaviconService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize service', async () => {
    await service.initService();
    expect((globalThis as any).chrome.storage.local.get).toHaveBeenCalled();
  });

  it('should save custom icon', async () => {
    const bookmarkId = 'test-bookmark-id';
    const base64Url = 'data:image/png;base64,abc123';

    await service.saveCustomIcon(bookmarkId, base64Url);

    expect((globalThis as any).chrome.storage.local.set).toHaveBeenCalled();
  });

  it('should remove custom icon', async () => {
    const bookmarkId = 'test-bookmark-id';

    await service.removeCustomIcon(bookmarkId);

    expect((globalThis as any).chrome.storage.local.set).toHaveBeenCalled();
  });

  it('should convert URL to base64', async () => {
    // Mock fetch
    const mockBlob = new Blob(['test'], { type: 'image/png' });
    spyOn(globalThis, 'fetch').and.returnValue(
      Promise.resolve({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      } as Response)
    );

    const result = await service.urlToBase64Public('https://example.com/image.png');

    expect(result).toBeTruthy();
    expect(globalThis.fetch).toHaveBeenCalledWith('https://example.com/image.png', {
      mode: 'cors',
    });
  });

  it('should handle fetch errors gracefully', async () => {
    spyOn(console, 'debug'); // Suppress console.debug in test output
    spyOn(console, 'error'); // Suppress console error
    spyOn(globalThis, 'fetch').and.returnValue(
      Promise.reject(new Error('Network error'))
    );

    const result = await service.urlToBase64Public('https://example.com/image.png');

    expect(result).toBeNull();
  });

  it('should load bookmark favicon with custom icon', async () => {
    const bookmark: Bookmark = {
      id: 'test-id',
      title: 'Test',
      url: 'https://example.com',
      type: 'bookmark',
    };

    // Mock custom icon in service
    await service.saveCustomIcon(bookmark.id, 'data:image/png;base64,custom');
    await service.loadBookmarkFavIconUrl(bookmark);

    expect(bookmark.favIconUrl).toBe('data:image/png;base64,custom');
  });

  it('should handle null bookmark gracefully', async () => {
    await expectAsync(
      service.loadBookmarkFavIconUrl(null as any)
    ).toBeResolved();
  });

  it('should handle bookmark folder with custom icon', async () => {
    const folder: Bookmark = {
      id: 'folder-id',
      title: 'Test Folder',
      type: 'bookmarkFolder',
    };

    await service.saveCustomIcon(folder.id, 'data:image/png;base64,folder-icon');
    await service.loadBookmarkFavIconUrl(folder);

    expect(folder.favIconUrl).toBe('data:image/png;base64,folder-icon');
  });
});
