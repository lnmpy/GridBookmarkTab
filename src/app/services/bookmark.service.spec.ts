import { TestBed } from "@angular/core/testing";
import { BehaviorSubject, Subject } from "rxjs";
import { BookmarkService } from "./bookmark.service";
import { SettingsService } from "./settings.service";
import { FaviconService } from "./favicon.service";
import { Bookmark, Setting } from "./types";

describe("BookmarkService", () => {
  let settingsSubject: BehaviorSubject<Setting>;
  let faviconLoadedSubject: Subject<{ id: string; url: string }>;
  let mockFaviconService: {
    initService: ReturnType<typeof vi.fn>;
    getCachedFavicon: ReturnType<typeof vi.fn>;
    loadBookmarkFavIconUrl: ReturnType<typeof vi.fn>;
    faviconLoaded$: Subject<{ id: string; url: string }>;
  };

  beforeEach(() => {
    localStorage.clear();

    settingsSubject = new BehaviorSubject<Setting>({
      bookmarkRootFolderId: "1",
      dockEnabled: false,
      dockFolderId: "",
    } as Setting);

    faviconLoadedSubject = new Subject<{ id: string; url: string }>();
    mockFaviconService = {
      initService: vi.fn().mockResolvedValue(undefined),
      getCachedFavicon: vi.fn().mockReturnValue(undefined),
      loadBookmarkFavIconUrl: vi.fn().mockResolvedValue(undefined),
      faviconLoaded$: faviconLoadedSubject,
    };

    const chromeAny = (globalThis as any).chrome;
    chromeAny.bookmarks = {
      getSubTree: vi.fn().mockResolvedValue([
        {
          id: "1",
          title: "Bookmarks Bar",
          children: [
            {
              id: "2",
              parentId: "1",
              index: 0,
              title: "Example",
              url: "https://example.com",
            },
            {
              id: "3",
              parentId: "1",
              index: 1,
              title: "Folder",
              children: [],
            },
          ],
        },
      ]),
      getTree: vi.fn().mockResolvedValue([]),
      onCreated: { addListener: vi.fn() },
      onRemoved: { addListener: vi.fn() },
      onChanged: { addListener: vi.fn() },
      onMoved: { addListener: vi.fn() },
      onChildrenReordered: { addListener: vi.fn() },
    };

    TestBed.configureTestingModule({
      providers: [
        {
          provide: SettingsService,
          useValue: {
            onSettingsChange: () => settingsSubject.asObservable(),
          },
        },
        {
          provide: FaviconService,
          useValue: mockFaviconService,
        },
      ],
    });
  });

  it("hydrates default favIconUrl when reading stripped cache from localStorage", () => {
    const cachedTree: Bookmark = {
      id: "1",
      title: "Bookmarks Bar",
      type: "bookmarkFolder",
      children: [
        {
          id: "2",
          title: "Example",
          type: "bookmark",
          url: "https://example.com",
        },
        {
          id: "3",
          title: "Subfolder",
          type: "bookmarkFolder",
          children: [],
        },
      ],
    };
    localStorage.setItem(
      "gbk_root_bookmarks_cache",
      JSON.stringify(cachedTree),
    );

    const service = TestBed.inject(BookmarkService);
    let initial: Bookmark | null = null;
    service.bookmarks$.subscribe((b) => {
      initial = b;
    });

    expect(initial).toBeTruthy();
    expect(initial!.favIconUrl).toBe("/assets/icons/folder-icon.svg");
    expect(initial!.children![0].favIconUrl).toBe(
      "/assets/icons/default-icon.svg",
    );
    expect(initial!.children![1].favIconUrl).toBe(
      "/assets/icons/folder-icon.svg",
    );
  });

  it("strips data: base64 favIconUrl when caching bookmarks to localStorage", async () => {
    mockFaviconService.getCachedFavicon.mockReturnValue(
      "data:image/png;base64,VERY_LARGE_BASE64_PAYLOAD",
    );

    const service = TestBed.inject(BookmarkService);
    await service.reloadBookmarks();

    const raw = localStorage.getItem("gbk_root_bookmarks_cache");
    expect(raw).toBeTruthy();
    expect(raw).not.toContain("data:image/png;base64");

    const parsed = JSON.parse(raw!) as Bookmark;
    expect(parsed.children![0].favIconUrl).toBeUndefined();
    expect(parsed.children![1].favIconUrl).toBe(
      "/assets/icons/folder-icon.svg",
    );
  });

  it("updates in-memory bookmarks on faviconLoaded$ without persisting data: URI to localStorage", async () => {
    const service = TestBed.inject(BookmarkService);
    await service.reloadBookmarks();

    let latest: Bookmark | null = null;
    service.bookmarks$.subscribe((b) => {
      latest = b;
    });

    const dataUrl = "data:image/png;base64,LOADED_ICON";
    faviconLoadedSubject.next({ id: "2", url: dataUrl });

    expect(latest!.children![0].favIconUrl).toBe(dataUrl);
    const raw = localStorage.getItem("gbk_root_bookmarks_cache");
    expect(raw).not.toContain("LOADED_ICON");
  });
});
