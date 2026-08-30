import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DockComponent } from './dock.component';
import { Bookmark } from '@app/services/types';

describe('DockComponent', () => {
  let component: DockComponent;
  let fixture: ComponentFixture<DockComponent>;

  const mockDockFolder: Bookmark = {
    id: 'dock-1',
    title: 'Dock',
    type: 'bookmarkFolder',
    children: [
      {
        id: 'bm-1',
        title: 'GitHub',
        url: 'https://github.com',
        type: 'bookmark',
        favIconUrl: 'https://github.com/favicon.ico',
      },
      {
        id: 'folder-1',
        title: 'Work Tools',
        type: 'bookmarkFolder',
        children: [
          {
            id: 'bm-2',
            title: 'Jira',
            url: 'https://jira.com',
            type: 'bookmark',
          },
        ],
      },
    ],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DockComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DockComponent);
    component = fixture.componentInstance;
    component.dockFolder = mockDockFolder;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have items from dockFolder', () => {
    expect(component.items.length).toBe(2);
    expect(component.items[0].title).toBe('GitHub');
    expect(component.items[1].title).toBe('Work Tools');
  });

  it('should emit folderClick when clicking a bookmark folder', () => {
    spyOn(component.folderClick, 'emit');
    const folderItem = mockDockFolder.children![1];
    const mouseEvent = new MouseEvent('click');

    component.onItemClick(mouseEvent, folderItem);
    expect(component.folderClick.emit).toHaveBeenCalledWith({
      event: mouseEvent,
      folder: folderItem,
    });
  });

  it('should emit bookmarkClick when clicking or middle clicking a bookmark item', () => {
    spyOn(component.bookmarkClick, 'emit');
    const bookmarkItem = mockDockFolder.children![0];
    const mouseEvent = new MouseEvent('click');

    component.onItemClick(mouseEvent, bookmarkItem);

    expect(component.bookmarkClick.emit).toHaveBeenCalledWith({
      event: mouseEvent,
      bookmark: bookmarkItem,
    });
  });

  it('should emit bookmarkClick on middle click (button 1)', () => {
    spyOn(component.bookmarkClick, 'emit');
    const bookmarkItem = mockDockFolder.children![0];
    const mouseEvent = new MouseEvent('auxclick', { button: 1 });

    component.onItemClick(mouseEvent, bookmarkItem);

    expect(component.bookmarkClick.emit).toHaveBeenCalledWith({
      event: mouseEvent,
      bookmark: bookmarkItem,
    });
  });

  it('should emit bookmarkContextMenu on right click', () => {
    spyOn(component.bookmarkContextMenu, 'emit');
    const bookmarkItem = mockDockFolder.children![0];
    const mouseEvent = new MouseEvent('contextmenu');
    spyOn(mouseEvent, 'preventDefault');
    spyOn(mouseEvent, 'stopPropagation');

    component.onContextMenu(mouseEvent, bookmarkItem);
    expect(mouseEvent.preventDefault).toHaveBeenCalled();
    expect(component.bookmarkContextMenu.emit).toHaveBeenCalledWith({
      event: mouseEvent,
      bookmark: bookmarkItem,
    });
  });

  it('should render tooltip capsules by default', () => {
    fixture.detectChanges();
    const tooltips = fixture.nativeElement.querySelectorAll('.dock-tooltip');
    expect(tooltips.length).toBe(2);
    expect(tooltips[0].textContent.trim()).toBe('GitHub');
    expect(tooltips[1].textContent.trim()).toBe('Work Tools');
  });

  it('should calculate mini icons for folder preview', () => {
    const folder = mockDockFolder.children![1];
    const miniIcons = component.getFolderMiniIcons(folder);
    expect(miniIcons.length).toBe(4);
    expect(miniIcons[0]?.id).toBe('bm-2');
    expect(miniIcons[1]).toBeNull();
  });

  it('should cap items to MAX_DOCK_ITEMS (12 items max)', () => {
    spyOnProperty(window, 'innerWidth', 'get').and.returnValue(1440);
    component.iconSize = 52;
    component.updateMaxVisibleItems();

    const manyBookmarks: Bookmark[] = Array.from({ length: 20 }, (_, i) => ({
      id: `bm-${i}`,
      title: `Bookmark ${i}`,
      type: 'bookmark' as const,
      url: `https://example${i}.com`,
    }));
    component.dockFolder = {
      id: 'dock-many',
      title: 'Dock',
      type: 'bookmarkFolder',
      children: manyBookmarks,
    };
    expect(component.items.length).toBe(12);
  });

  it('should adapt maxVisibleItems based on screen width', () => {
    spyOnProperty(window, 'innerWidth', 'get').and.returnValue(400);
    component.iconSize = 52;
    component.updateMaxVisibleItems();
    expect(component.maxVisibleItems).toBeLessThanOrEqual(6);
    expect(component.maxVisibleItems).toBeGreaterThanOrEqual(1);
  });
});
