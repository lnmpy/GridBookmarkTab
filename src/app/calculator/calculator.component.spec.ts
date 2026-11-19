import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { CalculatorComponent } from './calculator.component';
import { I18nService } from '@app/services/i18n.service';
import { SettingsService } from '@app/services/settings.service';
import {
  DEFAULT_CALCULATOR_PREFILL,
  ToolboxService,
} from '@app/services/toolbox.service';

describe('CalculatorComponent', () => {
  let fixture: ComponentFixture<CalculatorComponent>;
  let component: CalculatorComponent;
  let titleService: Title;
  let i18nService: I18nService;
  let toolboxService: ToolboxService;

  beforeEach(async () => {
    localStorage.clear();
    document.title = 'New Tab';

    await TestBed.configureTestingModule({
      imports: [CalculatorComponent],
      providers: [
        provideRouter([]),
        {
          provide: SettingsService,
          useValue: {
            settingsSource: new BehaviorSubject({ theme: 'light' }),
          },
        },
      ],
    }).compileComponents();

    titleService = TestBed.inject(Title);
    i18nService = TestBed.inject(I18nService);
    toolboxService = TestBed.inject(ToolboxService);

    fixture = TestBed.createComponent(CalculatorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  it('should set page title to calculator title and restore previous title on destroy', () => {
    expect(titleService.getTitle()).toBe(i18nService.t('toolCalculator'));

    i18nService.setLanguage('zh_CN');
    fixture.detectChanges();
    expect(titleService.getTitle()).toBe(i18nService.t('toolCalculator'));

    fixture.destroy();
    expect(titleService.getTitle()).toBe('New Tab');
  });

  it('should not block tab close when content matches predefined content', () => {
    expect(component.docText()).toBe(DEFAULT_CALCULATOR_PREFILL);
    expect(component.hasUserContent()).toBe(false);

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('should not block tab close when content is cleared to empty or whitespace', () => {
    const textarea = fixture.nativeElement.querySelector(
      'textarea',
    ) as HTMLTextAreaElement;
    textarea.value = '   ';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(component.hasUserContent()).toBe(false);

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('should block tab close with confirm when user has input differing from predefined content', () => {
    const textarea = fixture.nativeElement.querySelector(
      'textarea',
    ) as HTMLTextAreaElement;
    textarea.value = `${DEFAULT_CALCULATOR_PREFILL}\n10 * G`;
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(component.hasUserContent()).toBe(true);

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('should handle empty predefined content properly', async () => {
    fixture.destroy();
    await toolboxService.setCalculatorDefaultContent('');

    const emptyFixture = TestBed.createComponent(CalculatorComponent);
    const emptyComponent = emptyFixture.componentInstance;
    emptyFixture.detectChanges();

    expect(emptyComponent.docText()).toBe('');
    expect(emptyComponent.hasUserContent()).toBe(false);

    const cleanEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);

    const textarea = emptyFixture.nativeElement.querySelector(
      'textarea',
    ) as HTMLTextAreaElement;
    textarea.value = '1 + 2';
    textarea.dispatchEvent(new Event('input'));
    emptyFixture.detectChanges();

    expect(emptyComponent.hasUserContent()).toBe(true);

    const dirtyEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirtyEvent);
    expect(dirtyEvent.defaultPrevented).toBe(true);

    emptyFixture.destroy();
  });
});
