# Run Riff for a client or a network

Riff has almost nothing to set up, so a site you build for someone else is ready once Riff is active and the Listen page exists. What is left is who may change what, and, on a network or for a host, what every site gets.

## A client's site

1. Install and activate Riff, and make the Listen page, as [Set up the Listen page](listen-page.md) shows.
2. Give the client an Editor account. An editor uploads music, fills in its details in the Media Library, writes album posts, and sees the Dashboard notice that offers to make the Listen page. Settings, then Riff, needs an administrator.
3. Set the Riff block's colours and fonts in the Site Editor under Styles, then Blocks, then Riff, so they follow the client's theme.

For a band's or a label's site that only its own people should hear, tick Private site under Settings, then Reading. Only people with an account on the site can reach it, its audio and video files are protected too, and search engines are asked to stay away. Images, such as covers, keep their public addresses. Where anyone can register, anyone can make an account.

## A network

Activate Riff for the whole network from Network Admin, then Plugins, or on each site, and each site keeps its own library, Listen page and settings.

The features Riff ships with, such as Riff Lyrics, are on for every site unless one is turned off. Each site turns them on or off under Settings, then Riff. Network Admin, then Settings, then Riff, sets them for the network: a site chooses for itself unless one is locked there with The same for every site, and a locked one shows Set for every site on the network on each site's own screen.

Deleting Riff cleans up only the site it runs in, which on a network is the main site. Your files, their tags and their images stay, as do listeners' likes, playlists and recently played. On every other site, protected files stay in Riff's protected folder, so before deleting Riff from a network, untick Protected on those sites' files, and Private site where it is on, to move them back.

## A host

A host that gives each customer a player of their own can make the site's address the Listen app, name and colour the app, and leave out an extension, all from a plugin of its own. Each is in Under the hood below.

A host can also keep protected files where its web server never sends them. Riff keeps them in a folder under uploads, which Apache is told to refuse; Nginx ignores that rule, and Riff then warns that protected files can be downloaded directly. Outside the web root, no rule is needed. Name a folder there in wp-config.php:

```php
define( 'RIFF_PROTECTED_PATH', '/srv/example/riff-protected' );
```

or from the host's own plugin, with the [`riff_protected_path`](../hooks.md#riff_protected_path) filter, which starts from the constant:

```php
add_filter( 'riff_protected_path', fn() => dirname( ABSPATH ) . '/riff-protected' );
```

- The path is absolute. Riff makes it when a file is first protected, and keeps each site's files in a folder of its own inside it: the site's ID on a network, so sites never share one, and a random name on a single site. The web server's user has to be able to write to it.
- A path inside WordPress's folder (`ABSPATH`), wp-content, uploads, or the folder holding both WordPress and wp-content (Bedrock's `web/`), is refused, with a notice on the Dashboard, the Media Library, Settings, then Riff, and Site Health, and the files stay under uploads. WP Engine's `_wpeprivate` folder at the site's root is the one exception, as WP Engine never serves it: `ABSPATH . '_wpeprivate/riff-protected'` works there.
- When the path changes, Riff moves the files already protected to the new folder in the background, 25 at a time, or all at once with `wp riff protected move`. Each keeps its address, `?riff-file=ID`, so no post changes. A move cut short is finished the next time, and a file waits, still protected, in the folder it was in. Taking the setting away moves them back under uploads.
- PHP sends the files by default, from wherever they are. [`riff_protected_send`](../hooks.md#riff_protected_send) can hand them to the web server instead: `x-sendfile` names the file's absolute path, so Apache's `XSendFilePath` must allow the folder; `x-accel-redirect` names `/riff-protected/` and the file's path inside the folder, which an internal location maps there: `location /riff-protected/ { internal; alias /srv/example/riff-protected/; }`.
- Riff asks the web server for a probe file in the protected folder about once a day, and when Settings, then Riff, is opened and nobody has for a day, to warn when it is sent to anyone. A folder outside the web root isn't asked about.

## Under the hood

- [`riff_extensions`](../hooks.md#riff_extensions) changes the list of extensions Riff loads: a host can leave one out, or name a plugin it has placed in Riff's `extensions/` folder. [Extensions](../extensions.md) explains how they load.
- [`riff_app_at_root`](../hooks.md#riff_app_at_root), returned true, opens the Listen app at the site's address, as Open the player at the site's address does under Settings, then Riff; the setting then reads Set for this site by a plugin. [`riff_app_manifest`](../hooks.md#riff_app_manifest) names the app and sets its colours and icons.
- The app's own colours are the `--riff-standalone-*` custom properties under [The Listen app](https://source.riffpress.com/css/#listen-app), and the player's under [The player](https://source.riffpress.com/css/#player).
- [`riff_protect_storage`](../hooks.md#riff_protect_storage) is for a plugin that keeps the uploads on object storage, so protected files stay private there.
- [`riff_private_refused`](../hooks.md#riff_private_refused) shows a page of the site's own to a visitor a private site turns away.
- Settings, then Riff, needs `manage_options`, and the network's screen `manage_network_options`. The choices are the `riff_extensions` option on each site and the `riff_extensions_network` network option.
