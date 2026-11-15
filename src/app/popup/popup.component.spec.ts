import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { PopupComponent } from './popup.component';
import { SettingsService } from '@app/services/settings.service';
import { ToolboxService } from '@app/services/toolbox.service';

describe('PopupComponent', () => {
  let fixture: ComponentFixture<PopupComponent>;
  let component: PopupComponent;
  let toolboxService: ToolboxService;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [PopupComponent],
      providers: [
        {
          provide: SettingsService,
          useValue: {
            settingsSource: new BehaviorSubject({ theme: 'light' }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PopupComponent);
    component = fixture.componentInstance;
    toolboxService = TestBed.inject(ToolboxService);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render visible tools in the popup menu', () => {
    const buttons = fixture.nativeElement.querySelectorAll('.grid button');
    expect(buttons.length).toBe(toolboxService.visibleTools().length);
  });

  it('should open inline tool view and navigate back to menu', () => {
    const qrTool = toolboxService.getToolDefinition('qrCode');
    component.onToolClick(qrTool);
    fixture.detectChanges();

    expect(component.activeToolId()).toBe('qrCode');
    expect(fixture.nativeElement.querySelector('app-qr-code-tool')).toBeTruthy();

    component.backToMenu();
    fixture.detectChanges();

    expect(component.activeToolId()).toBeNull();
    expect(fixture.nativeElement.querySelector('.grid')).toBeTruthy();
  });

  it('should open calculator in a new tab and close popup when chrome API is available', () => {
    const createTabSpy = vi.fn();
    const getUrlSpy = vi.fn((path: string) => `chrome-extension://id/${path}`);
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {});

    (globalThis as unknown as { chrome: unknown }).chrome = {
      tabs: { create: createTabSpy },
      runtime: { getURL: getUrlSpy, openOptionsPage: vi.fn() },
    };

    const calcTool = toolboxService.getToolDefinition('calculator');
    component.onToolClick(calcTool);

    expect(getUrlSpy).toHaveBeenCalledWith('index.html#/?target=calculator');
    expect(createTabSpy).toHaveBeenCalledWith({
      url: 'chrome-extension://id/index.html#/?target=calculator',
    });
    expect(closeSpy).toHaveBeenCalled();

    delete (globalThis as unknown as { chrome?: unknown }).chrome;
  });

  it('should open new tab and options page from header actions', () => {
    const createTabSpy = vi.fn();
    const openOptionsSpy = vi.fn();
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {});

    (globalThis as unknown as { chrome: unknown }).chrome = {
      tabs: { create: createTabSpy },
      runtime: { openOptionsPage: openOptionsSpy },
    };

    component.openNewTab();
    expect(createTabSpy).toHaveBeenCalledWith({ url: 'chrome://newtab' });
    expect(closeSpy).toHaveBeenCalledTimes(1);

    component.openSettings();
    expect(openOptionsSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledTimes(2);

    delete (globalThis as unknown as { chrome?: unknown }).chrome;
  });
});
