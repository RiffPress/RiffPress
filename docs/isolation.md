# Isolation

Most WordPress vulnerabilities are in plugins. [EmDash](https://blog.cloudflare.com/emdash-wordpress/) answers that by running each plugin in a sandbox of its own: the plugin gets only the capabilities its manifest declares, and has no direct access to the database or the filesystem. Riff takes the same principle as far as WordPress honestly allows, for its own plugins (Riff and every plugin under `plugins/`), and holds it with checks in CI rather than promises.

## What this is and isn't

PHP plugins share one process. Each can call any function, read any global, and open any file the web server can. Nothing in this document stops a plugin that sets out to do harm: it can read `wp-config.php`, rewrite another plugin's options or call out to any host, and no check can prevent that from inside the same process. What these rules do is catch **mistakes and regressions** in Riff's own plugins: a key written in another plugin's space, a REST route left open, a call to a host nobody meant, a write outside uploads, one extension's bug taking the player down.

EmDash's isolates are stronger where it matters: a plugin there can't reach what it wasn't given, because it is not in the same process. The sandboxed runtime at the end of this document is the nearest WordPress gets to that, for the work it suits.

## The manifest

Every plugin has an `isolation.json` beside its main file, and [`isolation.schema.json`](isolation.schema.json) describes it:

| Key | What it declares |
| --- | --- |
| `plugin` | Its slug, the folder's name. |
| `namespace` | An extension's own namespace under `Riff\`, the only one of Riff's it may name. |
| `data.options` | Prefixes of the options, site options and transients it owns. |
| `data.meta` | Prefixes of the post, user, term and comment meta it owns, user options included. |
| `data.shared` | WordPress's own keys it writes on purpose, each with why (`_thumbnail_id`, a cover). |
| `data.keep` | Keys under its prefixes that uninstall leaves, each with why (a listener's likes). |
| `rest.namespaces` | The REST namespaces it registers. |
| `rest.fields` | The fields it adds to WordPress's routes, as `object.field`. |
| `rest.public` | Routes anyone may write to, each with why and what limits it. Only Riff Sign In has any: signing in is what a stranger does. |
| `capabilities` | Every capability it checks. |
| `hosts` | The hosts it may call: a name, `*.name`, or `self`. |
| `spawn` | The programs it runs: Riff's `ffmpeg`, from WP-CLI only. |
| `riff` | An extension's use of Riff: the `hooks`, `functions`, player `events` and `window.riff` members (`api`) it uses. |
| `scripts`, `modules` | The script handles and script modules it registers. |
| `sandbox` | Experimental: for the sandboxed runtime below. |

## The principles, and what holds each

**Least privilege.** Each plugin declares what it needs, and nothing more: the check fails a capability, script or Riff hook that is declared and never used, as well as one used and not declared.

**A narrow interface.** An extension reaches Riff only through what Riff makes public: the hooks in [hooks.md](hooks.md), the functions in `src/functions.php`, the REST routes, `window.riff` and the player's actions in [javascript.md](javascript.md). It names no Riff class but its own namespace, and imports none of Riff's modules. *Static.*

**Data isolation.** Every option, transient and meta key a plugin writes is under a prefix it owns. The longest prefix owns a key, so `riff_sign_in_listeners` is Riff Sign In's though Riff owns `riff_`, and Riff writing it fails as surely as another extension would. Reading another plugin's key fails too; reading WordPress's own (`date_format`) is fine. *Static*, for keys written literally or as constants; a key built from a variable is beyond reading.

**REST routes.** Every route has a `permission_callback`. One that lets anyone write (`__return_true`, directly or through a variable) fails unless `rest.public` names it with the reason. *Static.*

**A network allowlist.** A plugin calls only the hosts it declares. *Static* for literal URLs in PHP and scripts; a URL built at runtime is for the runtime guard (in progress, see below).

**No dangerous primitives.** PHPCS fails `eval()`, `create_function()`, `extract()` and SQL not built with `$wpdb->prepare()` (the WordPress standard already does), and `phpcs.xml.dist` makes running a program (`exec()`, `shell_exec()`, `system()`, `passthru()`, `proc_open()`, `popen()`) and `unserialize()` errors, each saying what to do instead. The isolation check adds what PHPCS has no sniff for: a filesystem write, a program run, or an `include` of a path from a variable must say on the line why, as `// isolation: write -- under uploads/riff-art`, so each is visible in review; an iframe must carry `sandbox`. *Static.*

**Failure isolation.** One broken extension must never break the player. *In progress*: catching a throwing view, control or action in the player's JavaScript, reported once with the plugin's name and skipped, and catching `Throwable` around the render and registry callbacks Riff calls in PHP, with a deliberately broken test extension in PHPUnit and Playwright.

**Browser containment.** No plugin here renders a third-party embed today, and the check fails an iframe without `sandbox`. *In progress*: an opt-in Content Security Policy the player works under (`script-src` with nonces, no inline handlers), tested in Playwright with the header on.

**Supply chain.** Riff's PHP has no Composer dependencies at runtime, and its player no npm ones: what ships is the code in this repository. Dependabot proposes updates monthly, and every action in the workflows is pinned to a commit.

## Running the check

```bash
node .github/scripts/isolation.js --check   # fails, saying how to fix each problem
node .github/scripts/isolation.js --found   # what each plugin's code uses, to write a manifest from
npm run lint:php                            # the primitives PHPCS catches
```

CI runs both on every pull request. `.github/scripts/isolation.test.js` shows each rule failing the code it is meant to fail.

## Runtime guards (in progress)

- **Outbound requests.** A `pre_http_request` guard in Riff that refuses a Riff plugin's request to a host its manifest doesn't declare, attributing it by the call stack. Logged in debug mode, blocked in tests and CI, and off in production by default, as a host's option, so a self-hoster is never surprised.
- **Uninstall.** Each plugin's `uninstall.php` removes exactly what its manifest declares, and a test activates, uses and uninstalls each, then finds none of its keys left. On multisite, Riff's `uninstall.php` today cleans the current site only, so protected files on the other sites stay where they were moved; it should go through every site.

## A sandboxed extension runtime

For the work it suits, an untrusted extension can run outside WordPress's process altogether: ordinary WordPress PHP, run in its own [php-wasm](https://github.com/WordPress/wordpress-playground) instance. This is experimental; the spike is in `experiments/sandbox/`.

**The model.** The host boots a fresh PHP for each job and gives it stubs of the WordPress and Riff functions the manifest grants (`get_post_meta()`, `update_post_meta()`, `wp_remote_get()`, `riff_register_view()`, a track). Each stub is a call across a bridge, a message channel (`post_message_to_js()`), to the real site, and the host checks each call against the manifest before the site is asked: read track 7, write `_riff_sample_tags` under the extension's prefix, register a view.

**What it can reach is decided before PHP starts.**

- **Network:** php-wasm's WebSocket relay, PHP's only way to a socket, is shut, and every socket PHP opens closes at once. A fetch goes through the bridge to a declared host, and the host makes it.
- **Programs:** the functions that run one are disabled, and php-wasm's spawn handler refuses anything that still reaches it, the way LexBunker's allows only named programs and never a shell.
- **Files:** PHP's filesystem is memory holding the stubs, the extension and `/tmp`. Nothing of the site's or the machine's is mounted.
- **Limits:** `memory_limit` is the manifest's and `ini_set()` is disabled; a job past its time has its thread or Worker ended. Each job has its own PHP, thrown away after.

**Where it runs.**

1. **The browser, first.** As [phpcompat](https://github.com/josephfusco/phpcompat) runs PHP_CodeSniffer in php-wasm in a Web Worker in the admin's browser, safe on shared hosting with no sidecar and no server extension. The site exposes only manifest-granted data through capability-checked REST routes (`POST /riff-sandbox/v1/call`, which checks the manifest again, so a call refused in the browser stays refused at the site, and one sent without the page at all is refused there too); it hands the browser work in batches and takes results back through one route that checks them against the manifest before storing them, keyed by the extension's files and the input, so unchanged work isn't done twice. The worker has no DOM and does no fetching of its own; to keep the session cookie out of its reach entirely, it would run in a sandboxed iframe of its own origin. It suits admin-triggered work (an import, tagging, waveforms, scans, enrichment) and player-side extensions in the listener's own browser. It doesn't suit server rendering on a page view with no browser in the loop.
2. **A Node sidecar**, or a container beside the site, as [LexBunker](https://github.com/josephfusco/lexbunker) runs WordPress on php-wasm with a spawn bridge, a shut relay and a PHP instance per job. Riff Cloud could run it on Cloudflare Containers; a Worker's script size limit is far below php-wasm's tens of megabytes.
3. **Never required.** A host without either runs only trusted extensions, in process, as today.

**What suits it:** event hooks and render callbacks whose output is cached or asynchronous: after an upload, an import source, a view's server-rendered HTML. **What doesn't:** filters that run on every request.

**The costs, measured.** On an Apple Silicon Mac with Node 24 and PHP 8.3 (`npm run bench` in the spike): a job end to end, a thread, a fresh PHP and the sample extension's event, takes about **184 ms**, of which booting PHP is about **62 ms** and the job **51 ms**; a call across the bridge takes about **0.15 ms**. PHP's WebAssembly is about **17 MB** for the browser and **30 MB** for Node, per PHP version and build, and only the extensions compiled into php-wasm are there. Keeping runtimes warm between jobs would take most of the boot away, at the cost of sharing an instance.

**The spike shows**, in `node --test`: the declared calls work, and an undeclared meta write, a fetch to an undeclared host, `exec()`, a read of a file outside its mount, raising its own limits and an event it doesn't declare are each refused; an infinite loop is cut off at its time limit, and running out of memory ends the job, not the host.

**Next:** the browser host end to end against wp-env in Playwright (the Worker and REST pieces are written, not yet run), then calling the runtime from Riff's PHP.

## Prior art

- [EmDash](https://blog.cloudflare.com/emdash-wordpress/), Cloudflare: plugins in isolates, with capability manifests.
- [phpcompat](https://github.com/josephfusco/phpcompat): PHP in a Web Worker in the admin's browser, fed in batches by the site's REST API, its results checked and cached by the files they came from.
- [LexBunker](https://github.com/josephfusco/lexbunker): WordPress on php-wasm in Node, its network and programs decided at the host.
