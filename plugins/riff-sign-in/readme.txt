=== Riff Sign In ===
Contributors: joefusco
Tags: passkeys, login, passwordless, music, player
Requires at least: 7.1
Tested up to: 7.1
Requires PHP: 8.1
Requires Plugins: riff
Stable tag: 0.7.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Listeners sign in to Riff with a passkey, or a code sent to their email, from a sheet inside the player. No passwords, and the music keeps playing.

== Description ==

Riff Sign In gives a site's listeners a way in that asks nothing to remember.

* A listener types their email and gets a six-digit code, with a one-tap link in the same email. The code works for ten minutes and allows five tries. The link signs in at once in the browser that asked for the code; anywhere else it asks first, so a mail service that opens every link to scan it uses nothing up.
* After the first sign-in the player offers to save a passkey: Face ID, Touch ID, a fingerprint or a security key. From then on the browser offers the passkey from the email field itself.
* It all happens in a sheet inside the player, on the page the listener is on, so the music keeps playing; nobody sees wp-login.php.
* Listeners are ordinary WordPress users, signed in with the same cookie as everyone else, and new accounts are made only when the site lets anyone register (Settings › General › Membership).
* Nothing is stored but each passkey's public key, in the user's own meta. The passkeys are on the listener's profile to remove, and in the personal data export and erasure.
* It meets WCAG 2.2's rule for accessible authentication: no puzzle, no memory test, and the code field takes a paste and the browser's own fill.
* Listeners can stay in the player: with Settings › General › Listeners on, people who cannot write posts keep their profile but see no dashboard or toolbar, and the registration form at wp-login.php is closed, so the player is the only way to sign up.
* Codes are limited per address and per network address, a hundred times as many on a local site, and an address allows twenty wrong codes a day across all its codes (riff_sign_in_failed_codes). Passkey sign-ins are limited per network address. A host that limits requests at its edge can add `/wp-json/riff-sign-in/v1/code` and `/wp-json/riff-sign-in/v1/assertion/options`, the two routes anyone may call without a code or a passkey. Site Health says whether the site's mail reaches anyone; most hosts' own mail does not, so an SMTP plugin is recommended.
* Passkeys belong to the site's host. A site that will move between subdomains can keep them working by returning a parent domain from riff_sign_in_rp_id, such as example.com for open.example.com; anything that isn't the host or a parent of it is ignored, and the browser's origin is still checked against the host itself.
* The sheet is drawn in the player's colours. A theme or host can change its shape with CSS custom properties set on #riff: --riff-signin-radius, --riff-signin-field-radius, --riff-signin-field-height, --riff-signin-field-bg, --riff-signin-button-height and --riff-signin-button-radius (8px, say, for buttons that aren't pills).

Admins and editors keep signing in as they always have; this is for listeners.

== Changelog ==

= 0.7.0 =
* A host may keep passkeys across subdomains by setting a parent domain as the relying party ID, through riff_sign_in_rp_id.

= 0.6.1 =
* Fixed: signing in takes JSON from the site's own pages, the email link names its account, and nothing answers differently for a member.

= 0.6.0 =
* A local site raises the code request limits a hundredfold, through riff_sign_in_limits.
* Fixed: removing a passkey on the profile moves focus on and says so.

= 0.5.1 =
* Fixed: each sign-in attempt is counted in one step.

= 0.5.0 =
* Each plugin declares what it needs in isolation.json, and CI fails code that reaches past it.

Every release, with the full list of changes, is on [GitHub](https://github.com/RiffPress/RiffPress/releases).
