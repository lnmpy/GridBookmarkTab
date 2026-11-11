// Minimal chrome.* mock with demo bookmarks, for store screenshots.
(() => {
  const scene = window.__SCENE__ || {};
  let nextId = 100;
  const bm = (title, url) => ({ id: String(nextId++), title, url, dateAdded: 1 });
  const folder = (id, title, children) => ({ id, title, children, dateAdded: 1 });

  const tree = [
    folder('0', '', [
      folder('1', 'Bookmarks bar', [
        folder('10', 'Work', [
          bm('Jira', 'https://www.atlassian.com/software/jira'),
          bm('Confluence', 'https://www.atlassian.com/software/confluence'),
          bm('Zoom', 'https://zoom.us/'),
          bm('Google Docs', 'https://docs.google.com/'),
          bm('Google Sheets', 'https://sheets.google.com/'),
          bm('Asana', 'https://asana.com/'),
          bm('Trello', 'https://trello.com/'),
          bm('Miro', 'https://miro.com/'),
          bm('Salesforce', 'https://www.salesforce.com/'),
          bm('HubSpot', 'https://www.hubspot.com/'),
        ]),
        folder('11', 'Design', [
          bm('Figma', 'https://www.figma.com/'),
          bm('Dribbble', 'https://dribbble.com/'),
          bm('Behance', 'https://www.behance.net/'),
          bm('Unsplash', 'https://unsplash.com/'),
          bm('Canva', 'https://www.canva.com/'),
        ]),
        folder('12', 'Reading', [
          bm('Medium', 'https://medium.com/'),
          bm('Hacker News', 'https://news.ycombinator.com/'),
          bm('The Verge', 'https://www.theverge.com/'),
          bm('Wikipedia', 'https://www.wikipedia.org/'),
        ]),
        bm('Gmail', 'https://mail.google.com/mail/u/0/#inbox'),
        bm('Discord', 'https://discord.com/app'),
        bm('Google Drive', 'https://drive.google.com/'),
        bm('GitHub', 'https://github.com/'),
        bm('Stack Overflow', 'https://stackoverflow.com/'),
        bm('ChatGPT', 'https://chatgpt.com/'),
        bm('Claude', 'https://claude.ai/'),
        bm('Notion', 'https://www.notion.so/'),
        bm('Slack', 'https://slack.com/'),
        bm('Linear', 'https://linear.app/'),
        bm('Figma', 'https://www.figma.com/files'),
        bm('YouTube', 'https://www.youtube.com/'),
        bm('Netflix', 'https://www.netflix.com/'),
        bm('Spotify', 'https://open.spotify.com/'),
        bm('Reddit', 'https://www.reddit.com/'),
        bm('Amazon', 'https://www.amazon.com/'),
        bm('Twitch', 'https://www.twitch.tv/'),
        bm('Duolingo', 'https://www.duolingo.com/'),
        bm('Booking.com', 'https://www.booking.com/'),
        bm('Airbnb', 'https://www.airbnb.com/'),
        bm('Pinterest', 'https://www.pinterest.com/'),
      ]),
      folder('2', 'Other bookmarks', [
        folder('20', 'Dock', [
          bm('Google', 'https://www.google.com/'),
          bm('Gmail', 'https://mail.google.com/'),
          bm('YouTube', 'https://www.youtube.com/'),
          bm('GitHub', 'https://github.com/'),
          bm('ChatGPT', 'https://chatgpt.com/'),
          bm('Notion', 'https://www.notion.so/'),
          bm('Spotify', 'https://open.spotify.com/'),
          bm('Figma', 'https://www.figma.com/'),
        ]),
      ]),
    ]),
  ];

  const walk = (nodes, parentId) => {
    nodes.forEach((n, i) => {
      n.index = i;
      if (parentId) n.parentId = parentId;
      if (n.children) walk(n.children, n.id);
    });
  };
  walk(tree);
  const find = (id, nodes = tree) => {
    for (const n of nodes) {
      if (n.id === id) return n;
      const r = n.children && find(id, n.children);
      if (r) return r;
    }
  };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const evt = () => ({ addListener() {}, removeListener() {}, hasListener: () => false });
  const done = (v, cb) => (cb ? (cb(v), undefined) : Promise.resolve(v));

  const today = new Date().toISOString().split('T')[0];
  const local = { ...(scene.local || {}) };
  if (scene.wallpaperUrl) {
    local.bing_wallpaper_cache = { date: today, url: scene.wallpaperUrl, title: '', copyright: '' };
  }
  window.__mockLocal = local;
  const sync = { ...(scene.settings || {}) };
  if (scene.settings?.theme) localStorage.setItem('theme', scene.settings.theme);
  localStorage.removeItem('gbk_settings_cache');

  const area = (store) => ({
    get(keys, cb) {
      let out = {};
      if (keys == null) out = { ...store };
      else if (typeof keys === 'string') out = keys in store ? { [keys]: store[keys] } : {};
      else if (Array.isArray(keys)) keys.forEach((k) => k in store && (out[k] = store[k]));
      else out = { ...keys, ...Object.fromEntries(Object.keys(keys).filter((k) => k in store).map((k) => [k, store[k]])) };
      return done(clone(out), cb);
    },
    set(items, cb) { Object.assign(store, items); return done(undefined, cb); },
    remove(keys, cb) { [].concat(keys).forEach((k) => delete store[k]); return done(undefined, cb); },
    clear(cb) { Object.keys(store).forEach((k) => delete store[k]); return done(undefined, cb); },
    onChanged: evt(),
  });

  window.chrome = {
    runtime: {
      id: 'demo',
      lastError: undefined,
      getURL: (p) => `${location.origin}/${String(p).replace(/^\//, '')}`,
      openOptionsPage: () => Promise.resolve(),
      sendMessage: () => Promise.resolve(),
      onMessage: evt(),
      getManifest: () => ({ version: '0.6.0', name: 'GBKTab', permissions: [] }),
    },
    i18n: { getUILanguage: () => scene.lang || 'en-US', getMessage: (k) => k },
    storage: { local: area(local), sync: area(sync), onChanged: evt() },
    bookmarks: {
      getTree: (cb) => done(clone(tree), cb),
      getSubTree: (id, cb) => done([clone(find(id))], cb),
      get: (id, cb) => done([].concat(id).map((i) => clone({ ...find(i), children: undefined })), cb),
      getChildren: (id, cb) => done(clone(find(id).children || []), cb),
      create: (o, cb) => done({ id: String(nextId++), ...o }, cb),
      update: (id, o, cb) => done({ id, ...o }, cb),
      move: (id, o, cb) => done({ id, ...o }, cb),
      remove: (id, cb) => done(undefined, cb),
      removeTree: (id, cb) => done(undefined, cb),
      onChanged: evt(), onCreated: evt(), onMoved: evt(), onRemoved: evt(), onChildrenReordered: evt(),
    },
    tabs: { query: () => Promise.resolve([]), create: () => Promise.resolve({}), update: () => Promise.resolve({}), group: () => Promise.resolve(1) },
    tabGroups: { get: () => Promise.resolve({}), update: () => Promise.resolve({}), TAB_GROUP_ID_NONE: -1 },
    windows: { get: () => Promise.resolve({}), create: () => Promise.resolve({}), update: () => Promise.resolve({}), WINDOW_ID_CURRENT: -2 },
    permissions: { getAll: () => Promise.resolve({ permissions: ['bookmarks', 'storage', 'favicon'], origins: [] }) },
  };
})();
