# Let listeners sign in

Anyone can listen without an account, and a visitor's likes and recently played stay in their own browser. A listener who signs in keeps them on their account, on every device, and can make playlists of their own. Riff uses WordPress's own accounts for this, so a listener is a user of your site.

Riff Sign In makes signing in fit the player: no password, a code by email and then a passkey, in a sheet over the page the listener is on.

## Install Riff Sign In

Riff Sign In is a plugin of its own, not part of Riff. Install and activate it as you would any plugin; it needs Riff to be active.

Codes go out by email, so the site's mail has to arrive. Tools, then Site Health, says whether Riff Sign In sends through a mail service or the server's own mail, which on many hosts is slow or never arrives. An SMTP plugin, or a transactional mail service, fixes that.

## Who can sign in

1. To let new listeners make an account, go to Settings, then General, and tick Anyone can register under Membership. New accounts get the New User Default Role from the same screen. With it unticked, only people who already have an account can sign in.
2. To keep listeners out of the dashboard, tick Listeners stay in the player under Listeners on the same screen. People who cannot write posts then sign in and sign up in the player, see no toolbar or dashboard, and the registration form at `wp-login.php` is closed. Admins and editors sign in as before.
3. Save Changes.

## What listeners see

The Sign in button on the Listen page, and any link to `wp-login.php` on the site, opens a sheet in the player. The listener types their email and presses Continue. A six-digit code arrives by email; they type it, or tap the link in the email. Once they are in, the sheet offers to save a passkey, and next time Face ID, Touch ID or a fingerprint signs them in with no code to wait for.

A code works for 10 minutes. The link in the email signs in at once in the browser that asked for it; opened anywhere else, it asks first, so a mail scanner that opens the link doesn't use up the code.

A listener sees and removes their passkeys on their own profile, and Tools, then Export Personal Data and Erase Personal Data, include them.

## Under the hood

- A listener's likes and recently played are kept on their account and read and written through [`/riff/v1/users/{user}/likes`](https://source.riffpress.com/rest/#riff-v1-users-user-likes) and [`/riff/v1/users/{user}/history`](https://source.riffpress.com/rest/#riff-v1-users-user-history), and their playlists through [`/riff/v1/users/{user}/playlists`](https://source.riffpress.com/rest/#riff-v1-users-user-playlists). What a browser kept before signing in joins the account the first time the player loads after.
- Riff Sign In's own routes are under `riff-sign-in/v1`: `/code` and `/code/verify` for the email code, `/assertion/options` and `/assertion` for a passkey, and `/passkeys` for a listener's own. Its code is in [plugins/riff-sign-in](../../plugins/riff-sign-in/).
- It fires the `riff_sign_in_code` action when a code is made and the `riff_sign_in_registered` action for a new account, and the `riff_sign_in_send` filter, returned false, leaves the email to a plugin of your own. Signing in fires WordPress's own `wp_login`.
- Passkeys are WebAuthn, through the browser's Credential Management API, and the browser offers a saved one from the email field. Each is used only where the browser has it.
- A passkey belongs to the site's host. The `riff_sign_in_rp_id` filter, given the relying party ID and the host, may return a parent domain instead, such as `example.com` for `open.example.com`, so passkeys keep working when the site moves to another subdomain. Anything that isn't the host or a parent domain of it falls back to the host, and the browser's origin is still checked against the host itself.
