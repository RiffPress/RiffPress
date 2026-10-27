=== Riff Sign In ===
Contributors: joefusco
Tags: passkeys, login, passwordless, music, player
Requires at least: 7.1
Tested up to: 7.1
Requires PHP: 8.1
Requires Plugins: riff
Stable tag: 0.2.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Listeners sign in to Riff with a passkey, or a code sent to their email, from a sheet inside the player. No passwords, and the music keeps playing.

== Description ==

Riff Sign In gives a site's listeners a way in that asks nothing to remember.

* A listener types their email and gets a six-digit code, with a one-tap link in the same email. The code works for ten minutes and allows five tries.
* After the first sign-in the player offers to save a passkey: Face ID, Touch ID, a fingerprint or a security key. From then on the browser offers the passkey from the email field itself.
* It all happens in a sheet inside the player, on the page the listener is on, so the music keeps playing; nobody sees wp-login.php.
* Listeners are ordinary WordPress users, signed in with the same cookie as everyone else, and new accounts are made only when the site lets anyone register (Settings › General › Membership).
* Nothing is stored but each passkey's public key, in the user's own meta. The passkeys are on the listener's profile to remove, and in the personal data export and erasure.
* It meets WCAG 2.2's rule for accessible authentication: no puzzle, no memory test, and the code field takes a paste and the browser's own fill.
* Codes are limited per address and per network address. Site Health says whether the site's mail reaches anyone; most hosts' own mail does not, so an SMTP plugin is recommended.

Admins and editors keep signing in as they always have; this is for listeners.

== Changelog ==

= 0.2.0 =
* Riff Lyrics and Riff Sign In say which Riff they need, Requires Riff in their headers, stay out of the way on an older one, and CI holds each to the hooks it uses.

= 0.1.1 =
* Fixed: the sheet takes Riff's tokens from the player, so it is drawn in the player's surface, font and amber in the installed app and on every other page, with a visible field, a filled Continue and a close button in its corner.

= 0.1.0 =
* Riff Sign In: listeners sign in with a passkey or an email code, from a sheet inside the player.

= 0.1.0 =
* Riff Sign In: passkeys and email codes for listeners, in a sheet inside the player.

Every release, with the full list of changes, is on [GitHub](https://github.com/RiffPress/RiffPress/releases).
