/* Share: the system sheet where there is one, the clipboard elsewhere, the same link in both. The
 * link is the track's post with the track named, so it opens on that track. Loaded on demand, at
 * the first press of Share. */

// Strings are WordPress translations of this module (wp_set_script_module_translations()).
// Core prints wp.i18n only when there are translations, so without it the strings are the
// English they are written in.
const __ = window.wp?.i18n?.__ || ( ( english ) => english );

export default function share( P ) {
	async function run() {
		const t = P.track();
		let url = location.href;
		if ( t?.post?.url ) {
			const u = new URL( t.post.url, location.href );
			if ( t.id ) {
				u.searchParams.set( P.SHARED, t.id );
			}
			url = u.toString();
		}
		if ( navigator.share ) {
			try {
				await navigator.share( {
					title: t?.title || document.title,
					url,
				} );
				return;
			} catch ( e ) {
				// Dismissing the sheet is not a failure. Anything else tries the clipboard.
				if ( e?.name === 'AbortError' ) {
					return;
				}
			}
		}
		try {
			await navigator.clipboard.writeText( url );
			P.toast( __( 'Link copied', 'riff' ) );
		} catch {
			P.toast( __( 'The link could not be shared.', 'riff' ) );
		}
	}
	return { share: run };
}
