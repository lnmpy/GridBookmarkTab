import { TestBed } from '@angular/core/testing';
import { FaviconService } from './favicon.service';
import { Bookmark } from './types';

describe('FaviconService', () => {
  let service: FaviconService;

  beforeEach(() => {
    (globalThis as any).chrome.storage.local.get.mockReturnValue(
      Promise.resolve({}),
    );
    (globalThis as any).chrome.storage.local.set.mockReturnValue(
      Promise.resolve(),
    );

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
    vi.spyOn(globalThis, 'fetch').mockReturnValue(
      Promise.resolve({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      } as Response),
    );

    const result = await service.urlToBase64Public(
      'https://example.com/image.png',
    );

    expect(result).toBeTruthy();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://example.com/image.png',
      {
        mode: 'cors',
      },
    );
  });

  it('should handle fetch errors gracefully', async () => {
    vi.spyOn(console, 'debug').mockImplementation(() => undefined); // Suppress console.debug in test output
    vi.spyOn(console, 'error').mockImplementation(() => undefined); // Suppress console error
    vi.spyOn(globalThis, 'fetch').mockReturnValue(
      Promise.reject(new Error('Network error')),
    );

    const result = await service.urlToBase64Public(
      'https://example.com/image.png',
    );

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
    await expect(
      service.loadBookmarkFavIconUrl(null as any),
    ).resolves.not.toThrow();
  });

  it('should handle bookmark folder with custom icon', async () => {
    const folder: Bookmark = {
      id: 'folder-id',
      title: 'Test Folder',
      type: 'bookmarkFolder',
    };

    await service.saveCustomIcon(
      folder.id,
      'data:image/png;base64,folder-icon',
    );
    await service.loadBookmarkFavIconUrl(folder);

    expect(folder.favIconUrl).toBe('data:image/png;base64,folder-icon');
  });

  it('should deduplicate in-flight requests for the same domain', async () => {
    let fetchCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url: any) => {
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
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
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
    (globalThis as any).chrome.storage.local.get.mockReturnValue(
      Promise.resolve({
        'favicon:stored-failed.com': failedCache,
      }),
    );

    let fetchCalled = false;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
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
    expect(fetchCalled).toBe(false);
  });

  describe('high resolution icon selection', () => {
    // Fake images are blobs whose text is their pixel size, decoded by the stubbed createImageBitmap
    const image = (size: number, type = 'image/png') => new Blob([String(size)], { type });
    const dataUrl = (size: number) => `data:image/png;base64,${btoa(String(size))}`;

    // Plain response objects: jsdom's FileReader only accepts jsdom Blobs, not Node's
    const respond = (body: string | Blob, contentType = 'text/html') => {
      const blob = typeof body === 'string' ? new Blob([body], { type: contentType }) : body;
      return {
        ok: true,
        status: 200,
        url: '',
        blob: () => Promise.resolve(blob),
        text: () => blob.text(),
        json: async () => JSON.parse(await blob.text()),
      } as unknown as Response;
    };

    const mockSite = (routes: Record<string, () => Response>) => {
      const requested: string[] = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation((input: any) => {
        const url = String(input);
        requested.push(url);
        const route = routes[url];
        return Promise.resolve(route ? route() : ({ ok: false, status: 404 } as Response));
      });
      return requested;
    };

    beforeEach(() => {
      vi.spyOn(console, 'debug').mockImplementation(() => undefined);
      vi.stubGlobal('createImageBitmap', async (blob: Blob) => {
        const size = parseInt(await blob.text());
        if (!size) throw new Error('not an image');
        return { width: size, height: size, close: () => undefined };
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should prefer the largest declared icon and skip favicon.ico', async () => {
      const requested = mockSite({
        'https://hires.test/': () =>
          respond(
            `<link rel="icon" href="/favicon.ico">
             <link rel="apple-touch-icon" href="/touch.png">
             <link rel="manifest" href="/app/site.webmanifest">`,
          ),
        'https://hires.test/app/site.webmanifest': () =>
          respond(
            JSON.stringify({
              icons: [
                { src: 'maskable.png', sizes: '1024x1024', purpose: 'maskable' },
                { src: 'icon-512.png', sizes: '512x512' },
              ],
            }),
            'application/json',
          ),
        'https://hires.test/app/icon-512.png': () => respond(image(512)),
      });

      const bookmark: Bookmark = { id: 'hires', title: 'Hi', url: 'https://hires.test/page', type: 'bookmark' };
      await service.loadBookmarkFavIconUrl(bookmark);

      expect(bookmark.favIconUrl).toBe(dataUrl(512));
      expect(requested).not.toContain('https://hires.test/app/maskable.png');
      expect(requested).not.toContain('https://hires.test/favicon.ico');
      expect((globalThis as any).chrome.storage.local.set).toHaveBeenCalledWith({
        'favicon:hires.test': expect.objectContaining({ base64Url: dataUrl(512), size: 512 }),
      });
    });

    it('should keep the largest icon when none is sharp enough', async () => {
      mockSite({
        'https://lowres.test/': () =>
          respond('<link rel="shortcut icon" href="small.png" sizes="16x16">'),
        'https://lowres.test/small.png': () => respond(image(16)),
        'https://lowres.test/favicon.ico': () =>
          respond(image(48, 'application/octet-stream')),
      });

      const bookmark: Bookmark = { id: 'lowres', title: 'Lo', url: 'https://lowres.test/', type: 'bookmark' };
      await service.loadBookmarkFavIconUrl(bookmark);

      expect(bookmark.favIconUrl).toBe(`data:image/x-icon;base64,${btoa('48')}`);
    });

    it('should upgrade a legacy cached icon in the background', async () => {
      (globalThis as any).chrome.storage.local.get.mockReturnValue(
        Promise.resolve({ 'favicon:legacy.test': { base64Url: dataUrl(16) } }),
      );
      mockSite({
        'https://legacy.test/': () => respond('<link rel="apple-touch-icon" href="/touch.png">'),
        'https://legacy.test/touch.png': () => respond(image(180)),
      });
      await service.initService();

      const bookmark: Bookmark = { id: 'legacy', title: 'Old', url: 'https://legacy.test/', type: 'bookmark' };
      expect(service.getCachedFavicon(bookmark)).toBe(dataUrl(16));

      const loaded: string[] = [];
      service.faviconLoaded$.subscribe(({ url }) => loaded.push(url));
      await service.loadBookmarkFavIconUrl(bookmark);

      expect(bookmark.favIconUrl).toBe(dataUrl(180));
      expect(loaded).toEqual([dataUrl(16), dataUrl(180)]);
      expect(service.getCachedFavicon({ ...bookmark, id: 'other' })).toBe(dataUrl(180));
    });

    it('should not refetch an icon that is already sharp', async () => {
      (globalThis as any).chrome.storage.local.get.mockReturnValue(
        Promise.resolve({
          'favicon:sharp.test': { base64Url: dataUrl(256), size: 256 },
        }),
      );
      const requested = mockSite({});
      await service.initService();

      const bookmark: Bookmark = { id: 'sharp', title: 'Sharp', url: 'https://sharp.test/', type: 'bookmark' };
      await service.loadBookmarkFavIconUrl(bookmark);

      expect(bookmark.favIconUrl).toBe(dataUrl(256));
      expect(requested.filter((url) => url.includes('sharp.test'))).toEqual([]);
    });

    it('should recheck a low-res icon only after its recheck time', async () => {
      const day = 24 * 60 * 60 * 1000;
      (globalThis as any).chrome.storage.local.get.mockReturnValue(
        Promise.resolve({
          'favicon:waiting.test': { base64Url: dataUrl(32), size: 32, recheckAt: Date.now() + day },
          'favicon:due.test': { base64Url: dataUrl(32), size: 32, recheckAt: Date.now() - 1 },
        }),
      );
      const requested = mockSite({
        'https://due.test/': () => respond('<link rel="apple-touch-icon" href="/touch.png">'),
        'https://due.test/touch.png': () => respond(image(180)),
      });
      await service.initService();

      const waiting: Bookmark = { id: 'waiting', title: 'W', url: 'https://waiting.test/', type: 'bookmark' };
      const due: Bookmark = { id: 'due', title: 'D', url: 'https://due.test/', type: 'bookmark' };
      await service.loadBookmarkFavIconUrl(waiting);
      await service.loadBookmarkFavIconUrl(due);

      expect(requested.filter((url) => url.includes('waiting.test'))).toEqual([]);
      expect(waiting.favIconUrl).toBe(dataUrl(32));
      expect(due.favIconUrl).toBe(dataUrl(180));
    });

    it('should schedule the next low-res recheck 7 to 10 days later', async () => {
      mockSite({
        'https://small.test/favicon.ico': () => respond(image(32)),
      });
      const before = Date.now();
      const bookmark: Bookmark = { id: 'small', title: 'S', url: 'https://small.test/', type: 'bookmark' };
      await service.loadBookmarkFavIconUrl(bookmark);

      const day = 24 * 60 * 60 * 1000;
      const saved = (globalThis as any).chrome.storage.local.set.mock.calls
        .map(([items]: [Record<string, any>]) => items['favicon:small.test'])
        .find(Boolean);
      expect(saved.size).toBe(32);
      expect(saved.recheckAt).toBeGreaterThanOrEqual(before + 7 * day);
      expect(saved.recheckAt).toBeLessThanOrEqual(Date.now() + 10 * day);
    });
  });
});
