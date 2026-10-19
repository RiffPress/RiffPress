# wp-api-coverage

Point it at a plugin folder and it tells you which WordPress APIs the plugin uses, and which ones it hasn't used yet, grouped by area: Media, REST API, Blocks, Interactivity API, Abilities, HTML API, Script Modules, i18n, Options, and so on.

It's meant for finding things WordPress already does that your plugin could use instead of its own code.

```
npx @riffpress/wp-api-coverage path/to/my-plugin
```

The package isn't on npm yet. From this repository, run `node packages/wp-api-coverage/bin/wp-api-coverage.js path/to/my-plugin`, or `npm run api-coverage` for Riff.

## What it looks at

In PHP files:

- The WordPress functions the plugin calls, including ones passed by name as callbacks, like `'__return_false'`.
- The core classes it uses with `new`, `extends`, `implements`, type declarations or static calls.
- The core hooks it passes to `add_action()`, `add_filter()` and the other hook functions. A concrete name like `save_post_attachment` counts as the dynamic hook `save_post_{$post->post_type}`.
- Script handles like `wp-api-fetch` and module IDs like `@wordpress/interactivity` in strings, which covers dependency arrays and `*.asset.php` files.

In JavaScript files:

- Imports of `@wordpress/*` packages and script modules, with `import`, `import()` or `require()`.
- `wp.*` globals, such as `wp.blocks.registerBlockType` or `const { element } = wp`.

In `block.json` files:

- The block supports the block declares, two levels deep, such as `color` and `color.background`.

It skips comments, string contents, method calls on objects, and the `node_modules`, `vendor`, `tests` and `test` folders.

## What it reports

For each area, the report shows how many of its public APIs the plugin uses, what they are, and what's left. The unused list puts the newest APIs first, and among those, the ones defined in a core file the plugin already calls into. Each one links to the developer reference.

It also lists any deprecated APIs the plugin still calls, and any private ones. Private means core marks it `@access private`, prefixes it with an underscore, or it's an `__experimental` block support. Neither kind is ever suggested.

```
WordPress API coverage for riff, against WordPress 7.1.3
Scanned 27 PHP files, 4 JavaScript files and 1 block.json files.
Uses 247 of 5996 public APIs (4.1%).

Area                           Used  Available  Coverage
Posts and queries                43        565      7.6%
...

Script Modules: 1 of 18 used
  Used: wp_enqueue_script_module
  Not used yet:
    wp_set_script_module_translations (function, since 7.0.0) https://developer.wordpress.org/reference/functions/wp_set_script_module_translations/
    ...
```

Options:

| Option | What it does |
| --- | --- |
| `--json` | Prints the whole report as JSON, for CI or another tool. |
| `--limit <n>` | How many unused APIs to list per area. The default is 5. |
| `--area <name>` | Shows only this area. Repeat it for more than one. |
| `--all` | Also lists the areas the plugin doesn't touch at all. |
| `--ignore <names>` | Comma-separated folder names to skip, in place of the default list. |
| `--catalog <file>` | Uses another catalog, such as one built for a different WordPress version. |

As a library:

```js
const { coverage, formatText } = require( '@riffpress/wp-api-coverage' );

const report = coverage( 'path/to/my-plugin' );
console.log( formatText( report, { limit: 3 } ) );
```

## The catalog

`catalog/wordpress.json` lists what one WordPress release offers. `scripts/build-catalog.js` builds it from the release zip on downloads.wordpress.org, after checking the zip against the SHA-1 published next to it:

- functions and classes, from every PHP file in `wp-admin` and `wp-includes`, leaving out the third-party libraries core bundles and the PHP polyfills in `compat.php`;
- actions and filters, from every `do_action()` and `apply_filters()` call, with the `@since` from the docblock above it;
- the `@wordpress/*` packages, from `wp-includes/assets/script-loader-packages.php`;
- script modules, from `wp-includes/assets/script-modules-packages.php`;
- block supports, from the `block.json` of every core block.

Each API's area comes from the core file it's defined or fired in, with a few exceptions by name: attachment functions live in `post.php`, but they're listed under Media.

The WordPress version is pinned in the script as `PINNED`. To follow a new release, change it and run:

```
npm run catalog --workspace=packages/wp-api-coverage
```

It needs `curl` and `unzip`. Set `WP_API_COVERAGE_CACHE` to a folder to keep the download between runs.

## Limits

- The scan is static. A function called through a variable, or a hook name built at runtime, isn't seen.
- A script handle can't be told apart from a style handle with the same name, so enqueueing the `wp-block-library` stylesheet counts as using the `@wordpress/block-library` package.
- Class methods aren't in the catalog, so calling `$processor->next_tag()` counts as using `WP_HTML_Tag_Processor`, not as using that method.
- REST routes aren't in the catalog yet, since core registers them at runtime.

## Tests

```
npm test --workspace=packages/wp-api-coverage
```

The tests use `node --test` and the small plugin in `test/fixtures/sample-plugin/`.

## License

GPL-2.0-or-later, like WordPress.
