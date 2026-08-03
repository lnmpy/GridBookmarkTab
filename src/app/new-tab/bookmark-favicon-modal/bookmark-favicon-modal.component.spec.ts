import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';

import { BookmarkFaviconModalComponent } from './bookmark-favicon-modal.component';
import { ModalService } from '@app/services/modal.service';
import { FaviconService } from '@app/services/favicon.service';
import { Bookmark } from '@app/services/types';

describe('BookmarkFaviconModalComponent', () => {
  let component: BookmarkFaviconModalComponent;
  let fixture: ComponentFixture<BookmarkFaviconModalComponent>;
  let mockModalService: jasmine.SpyObj<ModalService>;
  let mockFaviconService: jasmine.SpyObj<FaviconService>;

  const mockBookmark: Bookmark = {
    id: '1',
    title: 'Test Bookmark',
    url: 'https://example.com',
    type: 'bookmark',
    favIconUrl: 'https://example.com/favicon.ico',
  };

  beforeEach(async () => {
    mockModalService = jasmine.createSpyObj('ModalService', ['close']);
    mockFaviconService = jasmine.createSpyObj('FaviconService', [
      'urlToBase64Public',
      'saveCustomIcon',
    ]);

    await TestBed.configureTestingModule({
      imports: [BookmarkFaviconModalComponent, FormsModule],
      providers: [
        { provide: ModalService, useValue: mockModalService },
        { provide: FaviconService, useValue: mockFaviconService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BookmarkFaviconModalComponent);
    component = fixture.componentInstance;
    component.bookmark = mockBookmark;
    component.currentFaviconUrl = mockBookmark.favIconUrl;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with current favicon URL', () => {
    component.ngOnInit();
    expect(component.faviconUrl).toBe(mockBookmark.favIconUrl!);
    expect(component.previewUrl).toBe(mockBookmark.favIconUrl!);
  });

  it('should validate URL on change', async () => {
    component.faviconUrl = 'https://example.com/new-icon.png';
    await component.onUrlChange();

    expect(component.errorMessage).toBe('');
    expect(component.previewUrl).toBe('https://example.com/new-icon.png');
  });

  it('should show error for invalid URL', async () => {
    component.faviconUrl = 'not-a-valid-url';
    await component.onUrlChange();

    expect(component.errorMessage).toBe(component.i18n.t('invalidUrlFormat'));
    expect(component.previewUrl).toBe('');
  });

  it('should clear preview when URL is empty', async () => {
    component.faviconUrl = '';
    await component.onUrlChange();

    expect(component.previewUrl).toBe('');
  });

  it('should save favicon successfully', async () => {
    const base64Url = 'data:image/png;base64,abc123';
    mockFaviconService.urlToBase64Public.and.returnValue(Promise.resolve(base64Url));
    mockFaviconService.saveCustomIcon.and.returnValue(Promise.resolve());

    component.faviconUrl = 'https://example.com/icon.png';
    spyOn(component.confirm, 'emit');

    await component.onConfirm();

    expect(mockFaviconService.urlToBase64Public).toHaveBeenCalledWith(
      'https://example.com/icon.png'
    );
    expect(mockFaviconService.saveCustomIcon).toHaveBeenCalledWith(
      mockBookmark.id,
      base64Url
    );
    expect(component.bookmark.favIconUrl).toBe(base64Url);
    expect(component.confirm.emit).toHaveBeenCalledWith(base64Url);
    expect(mockModalService.close).toHaveBeenCalled();
  });

  it('should show error when URL is empty on confirm', async () => {
    component.faviconUrl = '';
    await component.onConfirm();

    expect(component.errorMessage).toBe(component.i18n.t('pleaseEnterFaviconUrl'));
    expect(mockModalService.close).not.toHaveBeenCalled();
  });

  it('should show error when fetch fails', async () => {
    mockFaviconService.urlToBase64Public.and.returnValue(Promise.resolve(null));

    component.faviconUrl = 'https://example.com/icon.png';
    await component.onConfirm();

    expect(component.errorMessage).toBe(component.i18n.t('failedToFetchImage'));
    expect(component.isLoading).toBe(false);
    expect(mockModalService.close).not.toHaveBeenCalled();
  });

  it('should handle save errors gracefully', async () => {
    spyOn(console, 'error'); // Suppress console error in test output
    mockFaviconService.urlToBase64Public.and.returnValue(
      Promise.resolve('data:image/png;base64,abc')
    );
    mockFaviconService.saveCustomIcon.and.returnValue(
      Promise.reject(new Error('Storage error'))
    );

    component.faviconUrl = 'https://example.com/icon.png';
    await component.onConfirm();

    expect(component.errorMessage).toBe(component.i18n.t('errorSavingFavicon'));
    expect(component.isLoading).toBe(false);
  });

  it('should show loading state during save', async () => {
    mockFaviconService.urlToBase64Public.and.returnValue(
      Promise.resolve('data:image/png;base64,abc')
    );
    mockFaviconService.saveCustomIcon.and.returnValue(Promise.resolve());

    component.faviconUrl = 'https://example.com/icon.png';

    const confirmPromise = component.onConfirm();

    // Loading state should be set at start
    expect(component.isLoading).toBe(true);

    await confirmPromise;

    // Loading should be false after completion (modal closes)
    expect(mockModalService.close).toHaveBeenCalled();
  });

  it('should close modal on cancel', () => {
    component.onCancel();
    expect(mockModalService.close).toHaveBeenCalled();
  });

  it('should close modal on Escape key', () => {
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    component.onEscapeKey(event);

    expect(mockModalService.close).toHaveBeenCalled();
  });

  it('should not close on Escape when loading', () => {
    component.isLoading = true;
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    component.onEscapeKey(event);

    expect(mockModalService.close).not.toHaveBeenCalled();
  });

  it('should accept raw SVG markup and convert to data URI', async () => {
    const rawSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>';
    component.faviconUrl = rawSvg;

    await component.onUrlChange();

    expect(component.errorMessage).toBe('');
    expect(component.previewUrl).toContain('data:image/svg+xml;base64,');

    mockFaviconService.saveCustomIcon.and.returnValue(Promise.resolve());
    spyOn(component.confirm, 'emit');

    await component.onConfirm();

    expect(mockFaviconService.saveCustomIcon).toHaveBeenCalledWith(
      mockBookmark.id,
      jasmine.stringMatching(/^data:image\/svg\+xml;base64,/)
    );
    expect(component.confirm.emit).toHaveBeenCalledWith(
      jasmine.stringMatching(/^data:image\/svg\+xml;base64,/)
    );
    expect(mockModalService.close).toHaveBeenCalled();
  });

  it('should accept SVG Data URI', async () => {
    const dataUri = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==';
    component.faviconUrl = dataUri;

    await component.onUrlChange();

    expect(component.errorMessage).toBe('');
    expect(component.previewUrl).toBe(dataUri);

    mockFaviconService.saveCustomIcon.and.returnValue(Promise.resolve());
    spyOn(component.confirm, 'emit');

    await component.onConfirm();

    expect(mockFaviconService.saveCustomIcon).toHaveBeenCalledWith(
      mockBookmark.id,
      dataUri
    );
    expect(mockModalService.close).toHaveBeenCalled();
  });

  it('should process local file selection', async () => {
    const file = new File(['<svg></svg>'], 'icon.svg', { type: 'image/svg+xml' });
    const event = {
      target: {
        files: [file],
        value: 'C:\\fakepath\\icon.svg'
      }
    } as unknown as Event;

    mockFaviconService.saveCustomIcon.and.returnValue(Promise.resolve());

    await component.onFileSelected(event);

    expect(component.errorMessage).toBe('');
    expect(component.faviconUrl).toContain('data:image/svg+xml;base64,');
  });
});
