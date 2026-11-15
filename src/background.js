const STORAGE_KEY = 'gbk_pomodoro_state_v1';
const TICK_ALARM = 'pomodoro_tick';
const END_ALARM = 'pomodoro_end';

const DEFAULT_SETTINGS = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakInterval: 4,
  autoStartBreak: true,
  autoStartFocus: false,
  soundEnabled: true,
};

let tickInterval = null;
let lastBadgeText = null;
let lastBadgeColor = null;
let lastBadgeTitle = null;

function durationForMode(mode, settings) {
  const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  switch (mode) {
    case 'short':
      return Math.max(1, s.shortBreakMinutes) * 60;
    case 'long':
      return Math.max(1, s.longBreakMinutes) * 60;
    default:
      return Math.max(1, s.focusMinutes) * 60;
  }
}

function formatTime(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function setBadge(text, color, title) {
  if (lastBadgeText !== text) {
    lastBadgeText = text;
    chrome.action.setBadgeText({ text });
  }
  if (color && lastBadgeColor !== color) {
    lastBadgeColor = color;
    chrome.action.setBadgeBackgroundColor({ color });
    if (chrome.action.setBadgeTextColor) {
      chrome.action.setBadgeTextColor({ color: '#FFFFFF' });
    }
  } else if (!color) {
    lastBadgeColor = null;
  }
  if (lastBadgeTitle !== title) {
    lastBadgeTitle = title;
    chrome.action.setTitle({ title });
  }
}

function clearTimers() {
  if (tickInterval !== null) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
  chrome.alarms.clear(TICK_ALARM);
  chrome.alarms.clear(END_ALARM);
}

async function completePhase(state) {
  const settings = { ...DEFAULT_SETTINGS, ...(state.settings || {}) };
  const wasFocus = state.mode !== 'short' && state.mode !== 'long';
  const nextCompletedCount = wasFocus
    ? (state.completedCount || 0) + 1
    : state.completedCount || 0;

  let nextMode = 'focus';
  if (wasFocus) {
    const interval = Math.max(1, settings.longBreakInterval);
    nextMode = nextCompletedCount % interval === 0 ? 'long' : 'short';
  }

  const shouldAutoStart = wasFocus
    ? settings.autoStartBreak
    : settings.autoStartFocus;
  const nextDuration = durationForMode(nextMode, settings);
  const now = Date.now();

  const nextState = {
    ...state,
    mode: nextMode,
    completedCount: nextCompletedCount,
    isRunning: shouldAutoStart,
    endTime: shouldAutoStart ? now + nextDuration * 1000 : null,
    pausedRemainingSeconds: nextDuration,
    settings,
  };

  await chrome.storage.local.set({ [STORAGE_KEY]: nextState });
  return nextState;
}

async function syncPomodoroBadge() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  let state = result?.[STORAGE_KEY];

  if (!state || !state.isRunning || typeof state.endTime !== 'number') {
    clearTimers();
    setBadge('', null, '');
    return;
  }

  let remaining = Math.max(0, Math.ceil((state.endTime - Date.now()) / 1000));
  if (remaining <= 0) {
    state = await completePhase(state);
    if (!state.isRunning || typeof state.endTime !== 'number') {
      clearTimers();
      setBadge('', null, '');
      return;
    }
    remaining = Math.max(0, Math.ceil((state.endTime - Date.now()) / 1000));
  }

  const text =
    remaining >= 60 ? `${Math.ceil(remaining / 60)}m` : `${remaining}s`;
  const color = state.mode === 'focus' ? '#4F46E5' : '#3E6337';
  const title = `GBKTab · ${formatTime(remaining)}`;
  setBadge(text, color, title);

  chrome.alarms.create(TICK_ALARM, { periodInMinutes: 0.5 });
  chrome.alarms.create(END_ALARM, { when: state.endTime });

  if (tickInterval === null) {
    tickInterval = setInterval(() => {
      void syncPomodoroBadge();
    }, 1000);
  }
}

chrome.runtime.onStartup.addListener(() => {
  void syncPomodoroBadge();
});

chrome.runtime.onInstalled.addListener(() => {
  void syncPomodoroBadge();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TICK_ALARM || alarm.name === END_ALARM) {
    void syncPomodoroBadge();
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes[STORAGE_KEY]) {
    void syncPomodoroBadge();
  }
});

void syncPomodoroBadge();
