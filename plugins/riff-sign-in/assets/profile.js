/* The passkeys on a profile: Remove takes one away through the plugin's own route. */
( () => {
	document.addEventListener( 'click', async ( e ) => {
		const button = e.target.closest( '[data-riff-signin-delete]' );
		if ( ! button || ! window.wp?.apiFetch ) {
			return;
		}
		button.disabled = true;
		try {
			await window.wp.apiFetch( { path: window.riffSignInProfile.route + button.dataset.riffSigninDelete, method: 'DELETE' } );
			button.closest( 'li' ).remove();
		} catch {
			button.disabled = false;
		}
	} );
} )();
