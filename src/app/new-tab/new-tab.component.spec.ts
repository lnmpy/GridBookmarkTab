import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NewTabComponent } from '@app/new-tab/new-tab.component';
import { SettingsService } from '@app/services/settings.service';

describe('NewTabComponent', () => {
  let component: NewTabComponent;
  let fixture: ComponentFixture<NewTabComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewTabComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(NewTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function setBookmarkOpenInNewTab(value: boolean) {
    const settingsService = TestBed.inject(SettingsService);
    settingsService.settingsSource.next({
      ...settingsService.settingsSource.value,
      bookmarkOpenInNewTab: value,
    });
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should open bookmark in background tab on middle click', () => {
    const tabService = (component as any).tabService;
    vi.spyOn(tabService, 'createTab').mockReturnValue(
      Promise.resolve(['tab-1']),
    );

    const bookmarkItem = {
      id: 'bm-1',
      title: 'Google',
      type: 'bookmark' as const,
      url: 'https://google.com',
    };
    const middleClickEvent = new MouseEvent('auxclick', { button: 1 });

    component.onClick(middleClickEvent, bookmarkItem);

    expect(tabService.createTab).toHaveBeenCalledWith(['https://google.com'], {
      active: false,
    });
  });

  it('should open all bookmarks in folder on middle click', () => {
    const tabService = (component as any).tabService;
    vi.spyOn(tabService, 'createTab').mockReturnValue(
      Promise.resolve(['tab-1', 'tab-2']),
    );
    vi.spyOn(tabService, 'createTabGroup');

    const folderItem = {
      id: 'folder-1',
      title: 'Dev Tools',
      type: 'bookmarkFolder' as const,
      children: [
        {
          id: 'bm-1',
          title: 'GitHub',
          type: 'bookmark' as const,
          url: 'https://github.com',
        },
        {
          id: 'bm-2',
          title: 'MDN',
          type: 'bookmark' as const,
          url: 'https://developer.mozilla.org',
        },
      ],
    };
    const middleClickEvent = new MouseEvent('auxclick', { button: 1 });

    component.onClick(middleClickEvent, folderItem);

    expect(tabService.createTab).toHaveBeenCalledWith(
      ['https://github.com', 'https://developer.mozilla.org'],
      { active: false },
    );
  });

  it('should update current tab on left click when bookmarkOpenInNewTab is false', () => {
    const tabService = (component as any).tabService;
    vi.spyOn(tabService, 'updateCurrentTab').mockReturnValue(Promise.resolve());
    setBookmarkOpenInNewTab(false);

    const bookmarkItem = {
      id: 'bm-1',
      title: 'Notes',
      type: 'bookmark' as const,
      url: 'chrome-extension://extention_id/options.html',
    };
    const clickEvent = new MouseEvent('click', { button: 0 });

    component.onClick(clickEvent, bookmarkItem);

    expect(tabService.updateCurrentTab).toHaveBeenCalledWith(
      'chrome-extension://extention_id/options.html',
    );
  });

  it('should handle dock bookmark click and update current tab', () => {
    const tabService = (component as any).tabService;
    vi.spyOn(tabService, 'updateCurrentTab').mockReturnValue(Promise.resolve());
    setBookmarkOpenInNewTab(false);

    const bookmarkItem = {
      id: 'bm-dock-1',
      title: 'Notes',
      type: 'bookmark' as const,
      url: 'chrome-extension://extention_id/options.html',
    };
    const clickEvent = new MouseEvent('click', { button: 0 });

    component.onDockBookmarkClick({
      event: clickEvent,
      bookmark: bookmarkItem,
    });

    expect(tabService.updateCurrentTab).toHaveBeenCalledWith(
      'chrome-extension://extention_id/options.html',
    );
  });

  describe('keyboard navigation', () => {
    // 6 items laid out as a 3-column grid: row = floor(i / 3), col = i % 3
    const children = [
      { id: 'b0', title: 'Zero', type: 'bookmark' as const, url: 'https://zero.dev' },
      { id: 'b1', title: 'One', type: 'bookmark' as const, url: 'https://one.dev' },
      {
        id: 'f2',
        title: 'Folder',
        type: 'bookmarkFolder' as const,
        children: [
          { id: 'c0', title: 'Child', type: 'bookmark' as const, url: 'https://child.dev' },
        ],
      },
      { id: 'b3', title: 'Three', type: 'bookmark' as const, url: 'https://three.dev' },
      { id: 'b4', title: 'Four', type: 'bookmark' as const, url: 'https://four.dev' },
      { id: 'b5', title: 'Five', type: 'bookmark' as const, url: 'https://five.dev' },
    ];

    beforeEach(() => {
      component.breadcrumb.set([
        { id: 'root', title: 'Root', type: 'bookmarkFolder', children },
      ]);
      component.isBookmarksLoaded.set(true);
      fixture.detectChanges();

      // jsdom has no layout; place cards on a 100px grid
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
        function (this: HTMLElement) {
          const index = children.findIndex((c) => this.id === `bookmark-${c.id}`);
          const i = Math.max(index, 0);
          const left = (i % 3) * 100;
          const top = Math.floor(i / 3) * 100;
          return { left, top, right: left + 80, bottom: top + 80, width: 80, height: 80, x: left, y: top, toJSON: () => ({}) } as DOMRect;
        },
      );
      HTMLElement.prototype.scrollIntoView = vi.fn();
    });

    function press(key: string, init: KeyboardEventInit = {}) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key, ...init }));
      fixture.detectChanges();
    }

    it('shows the cursor on the first bookmark on the first key press', () => {
      press('l');
      expect(component.keyboardFocusId()).toBe('b0');
      expect(
        fixture.nativeElement.querySelector('#bookmark-b0').classList,
      ).toContain('is-kb-focused');
    });

    it('moves left and right with arrows and h/l', () => {
      press('ArrowRight');
      press('l');
      press('ArrowRight');
      expect(component.keyboardFocusId()).toBe('f2');
      press('h');
      expect(component.keyboardFocusId()).toBe('b1');
    });

    it('moves between rows in the same column with j/k', () => {
      press('l');
      press('l'); // b1, column 1
      press('j');
      expect(component.keyboardFocusId()).toBe('b4');
      press('ArrowUp');
      expect(component.keyboardFocusId()).toBe('b1');
    });

    it('opens the focused bookmark on Enter', () => {
      const tabService = (component as any).tabService;
      vi.spyOn(tabService, 'createTab').mockReturnValue(Promise.resolve(['t']));
      setBookmarkOpenInNewTab(true);

      press('l');
      press('Enter');

      expect(tabService.createTab).toHaveBeenCalledWith(['https://zero.dev'], {
        active: false,
      });
    });

    it('enters the focused folder on Enter and focuses its first child', () => {
      press('l');
      press('l');
      press('l');
      press('Enter');

      expect(component.currentFolder()?.id).toBe('f2');
      expect(component.keyboardFocusId()).toBe('c0');
    });

    it('leaves keyboard navigation on Escape', () => {
      press('l');
      press('Escape');
      expect(component.keyboardFocusId()).toBeUndefined();
    });

    it('stays on the top row at the root, where there is no ancestor crumb', () => {
      press('l');
      press('k');
      expect(component.keyboardFocusId()).toBe('b0');
      expect(component.keyboardCrumbIndex()).toBeUndefined();
    });

    describe('breadcrumb', () => {
      const root = { id: 'root', title: 'Root', type: 'bookmarkFolder' as const, children };
      // Inside the 'f2' folder, which sits at index 2 of root
      const sub = children[2];

      beforeEach(() => {
        component.breadcrumb.set([root, sub]);
        fixture.detectChanges();
      });

      it('starts on the first bookmark, not the breadcrumb', () => {
        press('k');
        expect(component.keyboardFocusId()).toBe('c0');
        expect(component.keyboardCrumbIndex()).toBeUndefined();
      });

      it('moves up from the top row onto the parent crumb', () => {
        press('l');
        press('k');
        expect(component.keyboardFocusId()).toBeUndefined();
        expect(component.keyboardCrumbIndex()).toBe(0);
        expect(
          fixture.nativeElement.querySelector('.crumb').classList,
        ).toContain('is-kb-focused');
      });

      it('moves back down into the grid', () => {
        press('l');
        press('k');
        press('j');
        expect(component.keyboardCrumbIndex()).toBeUndefined();
        expect(component.keyboardFocusId()).toBe('c0');
      });

      it('jumps to the crumb on Enter and lands on the folder it came from', () => {
        press('l');
        press('k');
        press('Enter');
        expect(component.currentFolder()?.id).toBe('root');
        expect(component.keyboardCrumbIndex()).toBeUndefined();
        expect(component.keyboardFocusId()).toBe('f2');
      });
    });

    it('ignores navigation keys when the setting is off', () => {
      const settingsService = TestBed.inject(SettingsService);
      settingsService.settingsSource.next({
        ...settingsService.settingsSource.value,
        keyboardNavigation: false,
      });

      press('l');
      expect(component.keyboardFocusId()).toBeUndefined();
    });
  });
});
