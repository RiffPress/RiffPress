# Extensions

An extension is a plugin that ships inside Riff. Each one lives in this repository as a plugin of its own, under `plugins/<name>/`, with its own header, version and tests, and uses Riff only through its public hooks and APIs ([hooks.md](hooks.md), [javascript.md](javascript.md)), as anyone's plugin would. Riff Lyrics is the first.

## How one is bundled

`plugins/riff/extensions.json` names them:

```json
{
	"extensions": [ "riff-lyrics" ]
}
```

A release builds Riff with `.github/scripts/build-riff.sh`, which copies each one named into `riff/extensions/<name>/`, through `.distignore`, as it copies Riff. Every workflow that builds or deploys Riff uses that script. A checkout of the repository has no `extensions/` folder, and Riff finds each extension beside it, in `plugins/<name>/`, so nothing is kept twice.

Riff Sign In is never an extension. It is installed on its own, by whoever runs the site.

## How Riff loads one

As WordPress loads plugins, before `plugins_loaded`, Riff loads each extension's main file, `<name>/<name>.php`, unless:

- it is off, on Settings › Riff, or for the whole network on Network Admin › Settings › Riff, where a network admin can lock it for every site;
- it is installed and active as its own plugin, which WordPress loads instead;
- its `Requires Riff` header names a newer Riff than this one.

The `riff_extensions` filter changes the list: a host can leave one out, or name a plugin it has placed in Riff's `extensions/` folder.

## Writing one

Write a plugin, with a `Requires Riff` header naming the oldest Riff whose hooks it uses. Its main file returns at once if it has already been loaded, so a copy activated as its own plugin while Riff's is running doesn't load it twice:

```php
if ( defined( 'MY_EXTENSION_VERSION' ) ) {
	return;
}
define( 'MY_EXTENSION_VERSION', '1.0.0' );
```

Anything else it needs comes from its own folder (`__FILE__`, `plugin_dir_url( __FILE__ )`), which works wherever it is installed. To ship it inside Riff, add its folder under `plugins/` and its name to `extensions.json`.
