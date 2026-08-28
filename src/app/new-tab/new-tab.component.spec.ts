import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideAnimations } from "@angular/platform-browser/animations";

import { NewTabComponent } from "@app/new-tab/new-tab.component";

describe("NewTabComponent", () => {
  let component: NewTabComponent;
  let fixture: ComponentFixture<NewTabComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewTabComponent],
      providers: [provideAnimations()],
    }).compileComponents();

    fixture = TestBed.createComponent(NewTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("should open bookmark in background tab on middle click", () => {
    const tabService = (component as any).tabService;
    spyOn(tabService, "createTab").and.returnValue(Promise.resolve(["tab-1"]));

    const bookmarkItem = {
      id: "bm-1",
      title: "Google",
      type: "bookmark" as const,
      url: "https://google.com",
    };
    const middleClickEvent = new MouseEvent("auxclick", { button: 1 });

    component.onClick(middleClickEvent, bookmarkItem);

    expect(tabService.createTab).toHaveBeenCalledWith(["https://google.com"], {
      active: false,
    });
  });

  it("should open all bookmarks in folder on middle click", () => {
    const tabService = (component as any).tabService;
    spyOn(tabService, "createTab").and.returnValue(
      Promise.resolve(["tab-1", "tab-2"]),
    );
    spyOn(tabService, "createTabGroup");

    const folderItem = {
      id: "folder-1",
      title: "Dev Tools",
      type: "bookmarkFolder" as const,
      children: [
        {
          id: "bm-1",
          title: "GitHub",
          type: "bookmark" as const,
          url: "https://github.com",
        },
        {
          id: "bm-2",
          title: "MDN",
          type: "bookmark" as const,
          url: "https://developer.mozilla.org",
        },
      ],
    };
    const middleClickEvent = new MouseEvent("auxclick", { button: 1 });

    component.onClick(middleClickEvent, folderItem);

    expect(tabService.createTab).toHaveBeenCalledWith(
      ["https://github.com", "https://developer.mozilla.org"],
      { active: false },
    );
  });

  it("should update current tab on left click when bookmarkOpenInNewTab is false", () => {
    const tabService = (component as any).tabService;
    spyOn(tabService, "updateCurrentTab").and.returnValue(Promise.resolve());
    component.bookmarkOpenInNewTab = false;

    const bookmarkItem = {
      id: "bm-1",
      title: "Notes",
      type: "bookmark" as const,
      url: "chrome-extension://extention_id/options.html",
    };
    const clickEvent = new MouseEvent("click", { button: 0 });

    component.onClick(clickEvent, bookmarkItem);

    expect(tabService.updateCurrentTab).toHaveBeenCalledWith(
      "chrome-extension://extention_id/options.html",
    );
  });

  it("should handle dock bookmark click and update current tab", () => {
    const tabService = (component as any).tabService;
    spyOn(tabService, "updateCurrentTab").and.returnValue(Promise.resolve());
    component.bookmarkOpenInNewTab = false;

    const bookmarkItem = {
      id: "bm-dock-1",
      title: "Notes",
      type: "bookmark" as const,
      url: "chrome-extension://extention_id/options.html",
    };
    const clickEvent = new MouseEvent("click", { button: 0 });

    component.onDockBookmarkClick({
      event: clickEvent,
      bookmark: bookmarkItem,
    });

    expect(tabService.updateCurrentTab).toHaveBeenCalledWith(
      "chrome-extension://extention_id/options.html",
    );
  });
});
