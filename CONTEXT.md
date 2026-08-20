# Domain Context & Glossary

## Core Domain Concepts

- **Bookmark**: A leaf node representing a saved URL with title, URL, favicon, and parent folder relationship.
- **BookmarkFolder**: A container node in the bookmark hierarchy holding children bookmarks or subfolders.
- **BookmarkTree**: The complete or scoped hierarchical tree structure of bookmarks and folders.
- **SearchScope**: The active search boundary:
  - `root`: Restricted to the user's configured root bookmark folder.
  - `all`: Spanning all Chrome bookmark trees.
  - `custom`: Filtered to an explicit whitelist of selected folder IDs and their descendants.
- **HighlightSegment**: A structured token `{ text: string; isMatch: boolean }` representing matched vs non-matched character spans for XSS-safe UI rendering.
- **SearchResult**: A matched bookmark item containing relevance score, ancestral breadcrumb path, and structured highlight segments for title and URL.
- **BookmarkSearchEngine**: Deep module responsible for tree indexing, scope filtering, fuzzy ranking, and highlight segment computation.

## Architecture Vocabulary

- **Module**: A cohesive unit with an interface and implementation.
- **Interface**: The testable boundary surface exposed to consumers.
- **Depth**: The ratio of implementation capability to interface surface (deep modules have small interfaces and rich implementations).
- **Seam**: The boundary where modules connect and dependencies can be substituted.
- **Adapter**: Concrete implementation connecting a seam to external APIs (e.g. Chrome storage/tabs vs in-memory test mocks).
- **Locality**: Keeping code that changes together in one place.
- **Leverage**: Simplifying caller call-sites by absorbing coordination complexity behind the interface.
