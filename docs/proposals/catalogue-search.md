# Listen catalogue search: proposal for #343

This document frames the product and API decisions needed before implementing search or browsing in Listen. It records current source behavior and offers a possible first slice for maintainer discussion; none of the recommendations below are approved product behavior.

## Current facts

- The library is a paginated list of public, published posts containing supported media blocks. `Riff\Library::query()` defaults to 24 posts per page, newest first, and excludes password-protected posts. `GET /riff/v1/library` currently accepts `page` and returns `items`, `page`, `pages`, and `total`.
- Each list item represents a post, not an individual track. Its title and permalink come from the post; its optional `artist` value is populated only when every track has the same non-empty artist. The item also carries artwork, track count, duration, and a localized metadata line.
- Track data can contain `title`, `artist`, and `album`. Core audio/video and playlist blocks are read by the core source, while other plugins can register sources implementing `Riff\Source`. A source may describe eligible posts in SQL through `where()`, or leave that clause empty when it cannot.
- The Listen page renders its initial library on the server. Its JavaScript fetches later views and paginated REST results, swaps the view without a page load, and stores the opened post in the `riff` query argument. Library links and post links are real addresses; browser Back and Forward change views.
- There is no search or artist/album filtering contract in the current REST route or interface.

## Recommended first slice (not approved)

Start with a post-level text query over post titles only, returning matching library items in the existing post-list shape and order. Keep the current 24-item pagination and return the existing page metadata. Treat an empty query as the current unfiltered library. This narrow slice aligns the result with the current UI's post cards and avoids silently implying that a matching track is a separate playable result.

Keep artist and album browsing out of this first slice. Decide whether post-content matching and track-metadata matching are valuable, and what they mean for posts containing multiple tracks, before adding those semantics. A later slice can build on this agreement rather than committing to a broad search model prematurely.

Before implementation, agree the matching behavior (including case and partial matches), minimum or maximum query length, how whitespace and punctuation are treated, ordering of matches, empty/no-match messaging, and how the query persists through pagination and browser history. Add an accessible, localized control and clear loading, error, and empty states consistent with the server-rendered baseline.

## Alternatives and tradeoffs

| Direction | Benefits | Costs and unresolved behavior |
| --- | --- | --- |
| Post title only | Small, predictable contract; matches existing post cards; can preserve post-level result and playback behavior. | Does not find a post by track title, artist, album, or body content. |
| Post title and content | Familiar site-search expectations; may find context beyond titles. | Can match incidental prose and may be expensive or inconsistent with specialized sources; requires a decision about WordPress search semantics. |
| Track title, artist, or album | Makes embedded music metadata discoverable. | Track metadata is produced per source and is not necessarily available to SQL. A post can contain mixed artists or albums, and the result remains a post card rather than an individual track. |
| Separate artist and album browsing | Supports explicit catalogue navigation. | Requires defining grouping, normalization, missing metadata, mixed metadata, and whether those controls are filters or landing views. It is broader than text search and should be scoped separately if needed. |

The issue mentions indexes as a possibility, but no catalogue-size evidence, query budget, or performance regression is established. Do not introduce a metadata index, custom table, or cache until maintainers choose the matching fields and define representative catalogue sizes and measurable query/response budgets. A database strategy should follow the agreed query contract and be validated against those budgets.

## Public URL and API implications

- The REST route is public and documented. A search argument would be a public API addition: define and document its name, type, sanitization/validation, matching semantics, defaults, and interaction with `page` before shipping it. Existing callers omitting the argument must continue receiving the current library.
- Search state should be shareable, reloadable, and preserved by pagination. The Listen page already reserves `riff` for opening a post. Choose a distinct query argument for search, and define how search state coexists with `riff`, pretty permalinks, and plain permalinks before implementing history updates.
- Server-rendered initial results and enhanced REST results should agree for the same URL state. A visit without JavaScript must remain useful; Back/Forward should restore the expected search or browse view without disrupting playback.
- Any future filter arguments should be specified alongside search state, pagination, validation, and result semantics rather than introduced as undocumented UI-only behavior.

## Decisions awaiting maintainer approval

1. Is the first release strictly post-title search, or should it include post content and/or track metadata?
2. Are results posts (the current library item shape), tracks, or both? If tracks match, should the containing post still be the result?
3. Are artist and album filters excluded from the first release and considered separately?
4. How should missing metadata, mixed-artist/mixed-album posts, and registered sources participate when a source cannot express matching in SQL?
5. What are the exact matching, normalization, ordering, and query-length rules?
6. Which public URL and REST argument names should carry search and filter state, and how should they interact with the existing `riff` post argument and pagination?
7. What representative catalogue size and measurable query/response budget should guide any future index or cache?

Once these decisions are recorded, the implementation issue can be narrowed to the agreed first slice, with acceptance criteria covering the API contract, server-rendered behavior, progressive enhancement, accessibility, history, and pagination. This proposal does not implement search or filters and does not change Riff's current product promises.
