import { TestBed } from '@angular/core/testing';
import { TabService } from './tab.service';

describe('TabService', () => {
  let service: TabService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TabService],
    });
    service = TestBed.inject(TabService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('updateCurrentTab', () => {
    it('should call chrome.tabs.update with url', async () => {
      const url = 'chrome-extension://lkeeogfaiembcblonahillacpaabmiop/notes.html?note=Temp';
      await service.updateCurrentTab(url);

      expect((globalThis as any).chrome.tabs.update).toHaveBeenCalledWith({ url });
    });
  });

  describe('createTab', () => {
    it('should call chrome.tabs.create for each url', async () => {
      const urls = ['https://google.com', 'https://github.com'];
      await service.createTab(urls, { active: false });

      expect((globalThis as any).chrome.tabs.create).toHaveBeenCalledWith({
        windowId: chrome.windows.WINDOW_ID_CURRENT,
        url: 'https://google.com',
        active: false,
      });
      expect((globalThis as any).chrome.tabs.create).toHaveBeenCalledWith({
        windowId: chrome.windows.WINDOW_ID_CURRENT,
        url: 'https://github.com',
        active: false,
      });
    });
  });
});
