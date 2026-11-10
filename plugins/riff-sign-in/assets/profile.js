/* The passkeys on a profile: Remove takes one away through the plugin's own route. The button that
 * was pressed goes with its row, so focus is moved on purpose: to the next key's Remove, or to the
 * list's heading when it was the last, and the removal is said through WordPress's live region. A
 * failure is said beside the button, which keeps focus. */
( () => {
	const S = window.riffSignInProfile?.strings || {};
	const speak = ( message ) => window.wp?.a11y?.speak?.( message );
	document.addEventListener( 'click', async ( e ) => {
		const button = e.target.closest( '[data-riff-signin-delete]' );
		const item = button?.closest( 'li' );
		const list = item?.closest( '.riff-signin-passkeys' );
		if ( ! list || ! window.wp?.apiFetch ) {
			return;
		}
		// What an earlier try said, on any row: it is about to be tried again, or outlived.
		list.querySelectorAll( '.riff-signin-error' ).forEach( ( note ) => note.remove() );
		button.disabled = true;
		try {
			await window.wp.apiFetch( { path: window.riffSignInProfile.route + button.dataset.riffSigninDelete, method: 'DELETE' } );
			const next = item.nextElementSibling?.querySelector( '[data-riff-signin-delete]' );
			item.remove();
			( next || document.getElementById( 'riff-signin-passkeys' ) )?.focus();
			if ( ! next ) {
				// The page as the server renders it with no keys: the intro, then the empty list, give way to the note.
				const intro = list.previousElementSibling;
				if ( intro?.tagName === 'P' ) {
					intro.textContent = S.none || '';
				}
				list.remove();
			}
			speak( S.removed || '' );
		} catch ( err ) {
			const error = document.createElement( 'span' );
			error.className = 'riff-signin-error description';
			error.setAttribute( 'role', 'alert' );
			error.textContent = ' ' + ( err?.message || S.failed || '' );
			button.after( error );
			// A disabled button loses focus; enabled again, it takes it back.
			button.disabled = false;
			button.focus();
		}
	} );
} )();
