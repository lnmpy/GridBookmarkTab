import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { PomodoroService } from './pomodoro.service';

describe('PomodoroService', () => {
  let service: PomodoroService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(PomodoroService);
  });

  afterEach(() => {
    service.ngOnDestroy();
  });

  it('should initialize with default 25m focus state', () => {
    expect(service.mode()).toBe('focus');
    expect(service.isRunning()).toBe(false);
    expect(service.remainingSeconds()).toBe(25 * 60);
    expect(service.completedCount()).toBe(0);
  });

  it('should persist running state to localStorage and restore', () => {
    service.start();
    expect(service.isRunning()).toBe(true);
    const raw = localStorage.getItem('gbk_pomodoro_state_v1');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.isRunning).toBe(true);
    expect(typeof parsed.endTime).toBe('number');

    service.pause();
    expect(service.isRunning()).toBe(false);
  });

  it('should automatically transition from focus to short break and long break on interval', () => {
    service.updateSettings({
      longBreakInterval: 2,
      autoStartBreak: true,
      autoStartFocus: false,
    });

    // 1st focus completes -> short break (auto-started)
    service.skipPhase();
    expect(service.completedCount()).toBe(1);
    expect(service.mode()).toBe('short');
    expect(service.isRunning()).toBe(true);

    // short break completes -> back to focus (paused because autoStartFocus=false)
    service.skipPhase();
    expect(service.mode()).toBe('focus');
    expect(service.isRunning()).toBe(false);

    // 2nd focus completes -> long break (interval=2, auto-started)
    service.skipPhase();
    expect(service.completedCount()).toBe(2);
    expect(service.mode()).toBe('long');
    expect(service.isRunning()).toBe(true);
  });

  it('should update chrome extension action badge when running and clear when paused', () => {
    const setBadgeText = vi.fn();
    const setBadgeBackgroundColor = vi.fn();
    const setBadgeTextColor = vi.fn();
    const setTitle = vi.fn();

    (globalThis as unknown as { chrome: unknown }).chrome = {
      action: {
        setBadgeText,
        setBadgeBackgroundColor,
        setBadgeTextColor,
        setTitle,
      },
    };

    service.start();
    expect(setBadgeText).toHaveBeenCalledWith({ text: '25m' });
    expect(setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#4F46E5' });
    expect(setBadgeTextColor).toHaveBeenCalledWith({ color: '#FFFFFF' });
    expect(setTitle).toHaveBeenCalledWith({ title: 'GBKTab · 25:00' });

    service.pause();
    expect(setBadgeText).toHaveBeenLastCalledWith({ text: '' });
    expect(setTitle).toHaveBeenLastCalledWith({ title: '' });

    delete (globalThis as unknown as { chrome?: unknown }).chrome;
  });
});
