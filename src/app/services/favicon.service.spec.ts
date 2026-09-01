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

  it('should deduplicate in-flight requests for the same domain', async () => {
    let fetchCount = 0;
    spyOn(globalThis, 'fetch').and.callFake((url: any) => {
      fetchCount++;
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            ok: false,
            status: 404,
            text: () => Promise.resolve('Not Found'),
            blob: () => Promise.resolve(new Blob()),
            headers: new Headers(),
          } as Response);
        }, 20);
      });
    });

    const bookmark1: Bookmark = {
      id: 'b1',
      title: 'Site Page 1',
      url: 'https://unique-test-domain.com/page1',
      type: 'bookmark',
    };
    const bookmark2: Bookmark = {
      id: 'b2',
      title: 'Site Page 2',
      url: 'https://unique-test-domain.com/page2',
      type: 'bookmark',
    };

    // Trigger both concurrently
    await Promise.all([
      service.loadBookmarkFavIconUrl(bookmark1),
      service.loadBookmarkFavIconUrl(bookmark2),
    ]);

    // Should only have initiated fetch tasks once for the unique domain
    // fetchFromWebsite (5 paths + 1 html) + fetchFromLnmpyApi (2 trials max) = max 8 calls for 1 domain, not 16
    expect(fetchCount).toBeLessThanOrEqual(8);
  });

  it('should not retry requests for domains marked as failed within TTL', async () => {
    let fetchCallCount = 0;
    spyOn(globalThis, 'fetch').and.callFake(() => {
      fetchCallCount++;
      return Promise.resolve({
        ok: false,
        status: 404,
        text: () => Promise.resolve('404 Not Found'),
        blob: () => Promise.resolve(new Blob()),
        headers: new Headers(),
      } as Response);
    });

    const bookmark1: Bookmark = {
      id: 'b-fail-1',
      title: '404 Domain Page 1',
      url: 'https://fail-test-domain.org/p1',
      type: 'bookmark',
    };

    await service.loadBookmarkFavIconUrl(bookmark1);
    const initialFetchCount = fetchCallCount;
    expect(initialFetchCount).toBeGreaterThan(0);

    const bookmark2: Bookmark = {
      id: 'b-fail-2',
      title: '404 Domain Page 2',
      url: 'https://fail-test-domain.org/p2',
      type: 'bookmark',
    };

    // Load another bookmark with same domain
    await service.loadBookmarkFavIconUrl(bookmark2);
    // Should not have made any new fetch calls because domain failed and is in memory cache
    expect(fetchCallCount).toBe(initialFetchCount);
  });

  it('should load unexpired failed caches during initService', async () => {
    const failedCache = {
      base64Url: '',
      failedAt: Date.now() - 1000, // 1 second ago, well within 10 min TTL
    };
    (globalThis as any).chrome.storage.local.get.and.returnValue(
      Promise.resolve({
        'favicon:stored-failed.com': failedCache,
      })
    );

    let fetchCalled = false;
    spyOn(globalThis, 'fetch').and.callFake(() => {
      fetchCalled = true;
      return Promise.resolve({
        ok: false,
        status: 404,
      } as Response);
    });

    await service.initService();

    const bookmark: Bookmark = {
      id: 'b-stored-fail',
      title: 'Stored Failed Site',
      url: 'https://stored-failed.com/home',
      type: 'bookmark',
    };

    await service.loadBookmarkFavIconUrl(bookmark);
    // Should NOT fetch because it's populated into failed memory cache during init
    expect(fetchCalled).toBeFalse();
  });
});
