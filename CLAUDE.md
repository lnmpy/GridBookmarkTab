# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GridBookmarkTab (GBKTab) is a Chrome extension that reimagines the new tab page as a grid-based bookmark manager with tab group management features. Built with Angular 20, it uses standalone components and Chrome Extension Manifest V3.

## Common Commands

### Development

```bash
npm run start   # Build in watch mode for development
npm run build   # Production build
npm run test    # Run tests via Karma
npm run lint    # Run ESLint
```

The build outputs to `dist/GridBookmarkTab/`. Load this directory as an unpacked extension in Chrome for testing.

## Architecture

### Chrome Extension Structure

The extension uses a single Angular app that serves three different entry points via routing:

- **New Tab Page**: Main grid view for bookmarks and tab management (`/new-tab`)
- **Popup**: Browser action popup (`/popup`)
- **Options**: Extension options page (`/options`)

Routing is handled through a URL parameter `?target=<new-tab|popup|options>` which gets intercepted by `TargetGuard` (src/app/app.routes.ts:18) and routed to the appropriate component.

### Key Services

**BookmarkService** (src/app/services/bookmark.service.ts)

- Manages Chrome bookmarks API interactions
- Provides reactive bookmarks observable via `bookmarks$`
- Supports configurable root folder (user can select which bookmark folder to display)
- Lazy-loads favicons via FaviconService
- All CRUD operations automatically reload the bookmark tree

**SettingsService** (src/app/services/settings.service.ts)

- Uses Chrome storage sync API for settings persistence
- Exposes reactive settings stream via `settingsSource` BehaviorSubject
- Settings control: theme, display columns/gaps, bookmark root folder, tab behavior

**TabService** (src/app/services/tab.service.ts)

- Manages Chrome tabs and tab groups
- Provides reactive windows observable via `windows$`
- Handles tab/window creation, grouping, moving, and deletion

**ModalService** (src/app/services/modal.service.ts)

- Dynamic modal rendering system using ViewContainerRef
- All modals are rendered in a single host component (modal-host.component.ts)
- Modals communicate via component inputs and output EventEmitters

**FaviconService** (src/app/services/favicon.service.ts)

- Manages favicon caching and loading for bookmarks
- Uses Chrome storage for favicon cache

### Modal System

Modals are dynamically created using Angular's ViewContainerRef:

1. ModalHostComponent provides the container (src/app/components/modal-host/modal-host.component.ts)
2. ModalService creates components dynamically with input binding
3. Modals emit `confirm` events that parent components subscribe to
4. Context menus use Angular CDK Overlay for positioning

### Drag & Drop

Uses Angular CDK drag-drop:

- Bookmarks can be reordered within the same folder
- Tabs can be moved between windows and tab groups
- Tab groups can be moved between windows
- The system tracks `draggedItem` and `draggedHoverdItem` for visual feedback

### Build Configuration

Uses custom webpack config (custom-webpack.config.ts) to build the background service worker separately from the main Angular app. The background script entry point is src/background.ts, compiled to background_runtime.js.

### Styling

- TailwindCSS 4.x for utility classes
- DaisyUI for component themes (configurable via settings)
- SCSS for component-specific styles
- Theme injection handled via theme_inject.js

## Important Patterns

### Chrome API Access

All Chrome API calls (bookmarks, tabs, tabGroups, storage, windows) go through service classes, never directly from components.

### Reactive State Management

Services use RxJS BehaviorSubjects to broadcast state changes. Components subscribe in ngOnInit() and update their local state accordingly. The bookmark breadcrumb navigation (src/app/new-tab/new-tab.component.ts:117-132) demonstrates syncing component state with service observables.

### Type Safety

All domain types are defined in src/app/services/types.ts including Bookmark, Tab, TabGroup, Window, and Setting interfaces.

### Reload Patterns

Service methods accept a `reload` parameter (default true) to optionally skip reloading after mutations, useful for batch operations or UI-optimistic updates.
