import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { ToastService } from './toast.service';
import { I18nService } from './i18n.service';

export type PomodoroMode = 'focus' | 'short' | 'long';

export interface PomodoroSettings {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  longBreakInterval: number;
  autoStartBreak: boolean;
  autoStartFocus: boolean;
  soundEnabled: boolean;
}

export interface PomodoroState {
  mode: PomodoroMode;
  isRunning: boolean;
  endTime: number | null;
  pausedRemainingSeconds: number;
  completedCount: number;
  settings: PomodoroSettings;
}

const STORAGE_KEY = 'gbk_pomodoro_state_v1';

const DEFAULT_SETTINGS: PomodoroSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakInterval: 4,
  autoStartBreak: true,
  autoStartFocus: false,
  soundEnabled: true,
};

@Injectable({
  providedIn: 'root',
})
export class PomodoroService implements OnDestroy {
  private toastService = inject(ToastService);
  private i18n = inject(I18nService);

  private readonly stateSignal = signal<PomodoroState>(this.loadInitialState());
  private readonly nowSignal = signal<number>(Date.now());
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private storageListener:
    | ((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void)
    | null = null;

  readonly mode = computed(() => this.stateSignal().mode);
  readonly isRunning = computed(() => this.stateSignal().isRunning);
  readonly completedCount = computed(() => this.stateSignal().completedCount);
  readonly settings = computed(() => this.stateSignal().settings);

  readonly totalSeconds = computed(() => {
    const s = this.stateSignal().settings;
    switch (this.stateSignal().mode) {
      case 'focus':
        return Math.max(1, s.focusMinutes) * 60;
      case 'short':
        return Math.max(1, s.shortBreakMinutes) * 60;
      case 'long':
        return Math.max(1, s.longBreakMinutes) * 60;
    }
  });

  readonly remainingSeconds = computed(() => {
    const state = this.stateSignal();
    if (state.isRunning && state.endTime !== null) {
      return Math.max(0, Math.ceil((state.endTime - this.nowSignal()) / 1000));
    }
    return state.pausedRemainingSeconds;
  });

  readonly formattedTime = computed(() => {
    const total = this.remainingSeconds();
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  });

  constructor() {
    this.reconcileElapsed();
    if (this.stateSignal().isRunning) {
      this.startTicking();
    }
    void this.syncFromChromeStorage();
    this.registerStorageListener();
  }

  ngOnDestroy(): void {
    this.stopTicking();
    if (
      this.storageListener &&
      typeof chrome !== 'undefined' &&
      chrome.storage?.onChanged
    ) {
      chrome.storage.onChanged.removeListener(this.storageListener);
      this.storageListener = null;
    }
  }

  toggleRunning(): void {
    if (this.stateSignal().isRunning) {
      this.pause();
    } else {
      this.start();
    }
  }

  start(): void {
    const current = this.stateSignal();
    if (current.isRunning) return;
    const secs =
      current.pausedRemainingSeconds > 0
        ? current.pausedRemainingSeconds
        : this.durationForMode(current.mode, current.settings);
    const now = Date.now();
    this.nowSignal.set(now);
    const next: PomodoroState = {
      ...current,
      isRunning: true,
      endTime: now + secs * 1000,
      pausedRemainingSeconds: secs,
    };
    this.persistState(next);
    this.startTicking();
  }

  pause(): void {
    const current = this.stateSignal();
    if (!current.isRunning) return;
    const remaining = this.remainingSeconds();
    this.stopTicking();
    const next: PomodoroState = {
      ...current,
      isRunning: false,
      endTime: null,
      pausedRemainingSeconds: remaining,
    };
    this.persistState(next);
  }

  reset(): void {
    this.stopTicking();
    const current = this.stateSignal();
    const next: PomodoroState = {
      ...current,
      isRunning: false,
      endTime: null,
      pausedRemainingSeconds: this.durationForMode(current.mode, current.settings),
    };
    this.persistState(next);
  }

  switchMode(mode: PomodoroMode): void {
    this.stopTicking();
    const current = this.stateSignal();
    const next: PomodoroState = {
      ...current,
      mode,
      isRunning: false,
      endTime: null,
      pausedRemainingSeconds: this.durationForMode(mode, current.settings),
    };
    this.persistState(next);
  }

  skipPhase(): void {
    this.completeCurrentPhase(false);
  }

  resetCompletedCount(): void {
    const current = this.stateSignal();
    this.persistState({ ...current, completedCount: 0 });
  }

  updateSettings(patch: Partial<PomodoroSettings>): void {
    const current = this.stateSignal();
    const nextSettings: PomodoroSettings = {
      ...current.settings,
      ...patch,
    };
    const next: PomodoroState = {
      ...current,
      settings: nextSettings,
      pausedRemainingSeconds: current.isRunning
        ? current.pausedRemainingSeconds
        : this.durationForMode(current.mode, nextSettings),
    };
    this.persistState(next);
  }

  private durationForMode(mode: PomodoroMode, s: PomodoroSettings): number {
    switch (mode) {
      case 'focus':
        return Math.max(1, s.focusMinutes) * 60;
      case 'short':
        return Math.max(1, s.shortBreakMinutes) * 60;
      case 'long':
        return Math.max(1, s.longBreakMinutes) * 60;
    }
  }

  private startTicking(): void {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => {
      const now = Date.now();
      this.nowSignal.set(now);
      const state = this.stateSignal();
      if (state.isRunning && state.endTime !== null && now >= state.endTime) {
        this.completeCurrentPhase(true);
      }
    }, 500);
  }

  private stopTicking(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private reconcileElapsed(): void {
    const state = this.stateSignal();
    if (!state.isRunning || state.endTime === null) return;
    const now = Date.now();
    this.nowSignal.set(now);
    if (now >= state.endTime) {
      this.completeCurrentPhase(false);
    }
  }

  private completeCurrentPhase(notify: boolean): void {
    const current = this.stateSignal();
    const wasFocus = current.mode === 'focus';
    const nextCompletedCount = wasFocus
      ? current.completedCount + 1
      : current.completedCount;

    let nextMode: PomodoroMode = 'focus';
    if (wasFocus) {
      const interval = Math.max(1, current.settings.longBreakInterval);
      nextMode = nextCompletedCount % interval === 0 ? 'long' : 'short';
    }

    const shouldAutoStart = wasFocus
      ? current.settings.autoStartBreak
      : current.settings.autoStartFocus;

    const nextDuration = this.durationForMode(nextMode, current.settings);
    const now = Date.now();
    this.nowSignal.set(now);

    const next: PomodoroState = {
      ...current,
      mode: nextMode,
      completedCount: nextCompletedCount,
      isRunning: shouldAutoStart,
      endTime: shouldAutoStart ? now + nextDuration * 1000 : null,
      pausedRemainingSeconds: nextDuration,
    };

    this.persistState(next);
    if (shouldAutoStart) {
      this.startTicking();
    } else {
      this.stopTicking();
    }

    if (notify) {
      if (current.settings.soundEnabled) {
        this.playChime();
      }
      const msgKey = wasFocus
        ? nextMode === 'long'
          ? 'pomodoroLongBreakToast'
          : 'pomodoroShortBreakToast'
        : 'pomodoroFocusToast';
      this.toastService.show(this.i18n.t(msgKey), 'info');
    }
  }

  private normalizeState(raw?: Partial<PomodoroState> | null): PomodoroState {
    const settings: PomodoroSettings = {
      ...DEFAULT_SETTINGS,
      ...(raw?.settings ?? {}),
    };
    const mode: PomodoroMode =
      raw?.mode === 'short' || raw?.mode === 'long' ? raw.mode : 'focus';
    const isRunning = Boolean(raw?.isRunning && raw?.endTime);
    const endTime = isRunning && typeof raw?.endTime === 'number' ? raw.endTime : null;
    const pausedRemainingSeconds =
      typeof raw?.pausedRemainingSeconds === 'number' && raw.pausedRemainingSeconds >= 0
        ? raw.pausedRemainingSeconds
        : this.durationForMode(mode, settings);
    const completedCount =
      typeof raw?.completedCount === 'number' && raw.completedCount >= 0
        ? raw.completedCount
        : 0;

    return {
      mode,
      isRunning,
      endTime,
      pausedRemainingSeconds,
      completedCount,
      settings,
    };
  }

  private loadInitialState(): PomodoroState {
    try {
      if (typeof localStorage !== 'undefined') {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached) {
          return this.normalizeState(JSON.parse(cached));
        }
      }
    } catch {
      // Ignore cache read errors
    }
    return this.normalizeState();
  }

  private async syncFromChromeStorage(): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const result = await chrome.storage.local.get(STORAGE_KEY);
        const stored = result?.[STORAGE_KEY] as Partial<PomodoroState> | undefined;
        if (stored) {
          const normalized = this.normalizeState(stored);
          this.stateSignal.set(normalized);
          this.saveLocalCache(normalized);
          this.reconcileElapsed();
          if (this.stateSignal().isRunning) {
            this.startTicking();
          } else {
            this.stopTicking();
          }
        }
      }
    } catch {
      // Ignore chrome storage errors
    }
  }

  private registerStorageListener(): void {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
        this.storageListener = (changes, areaName) => {
          if (areaName !== 'local' || !changes[STORAGE_KEY]?.newValue) return;
          const normalized = this.normalizeState(
            changes[STORAGE_KEY].newValue as Partial<PomodoroState>,
          );
          this.stateSignal.set(normalized);
          this.saveLocalCache(normalized);
          if (normalized.isRunning) {
            this.startTicking();
          } else {
            this.stopTicking();
          }
        };
        chrome.storage.onChanged.addListener(this.storageListener);
      }
    } catch {
      // Ignore listener errors
    }
  }

  private saveLocalCache(state: PomodoroState): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    } catch {
      // Ignore storage quota errors
    }
  }

  private persistState(next: PomodoroState): void {
    this.stateSignal.set(next);
    this.saveLocalCache(next);
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        void chrome.storage.local.set({ [STORAGE_KEY]: next });
      }
    } catch {
      // Ignore chrome storage errors
    }
  }

  private playChime(): void {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch {
      // Ignore audio errors
    }
  }
}
