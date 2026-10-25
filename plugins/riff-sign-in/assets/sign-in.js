/* Riff Sign In: the sheet. On every page the player renders, a sign-in link (the Listen app's
 * Sign in, "Sign in to add to a playlist" in a track's menu, the library's note) opens a dialog
 * inside the page instead of wp-login.php, so the music keeps playing. The dialog asks for an
 * email, sends a code, takes the code (or a passkey, which the browser offers from the email field
 * where it has one), and once the listener is in, offers to save a passkey for next time. Then the
 * page is opened again, as a navigation and not a reload, so the player picks the music up with
 * the account's likes and playlists. The dialog is a native <dialog>: Escape, the backdrop and
 * focus are the browser's, as WCAG's authentication rule (3.3.8) wants no puzzle and the code
 * field takes a paste and the browser's own one-time-code fill. */
( () => {
	const config = window.riffSignIn || {};
	const S = config.strings || {};
	if ( config.signedIn || typeof HTMLDialogElement === 'undefined' ) {
		return;
	}
	const speak = ( message ) => window.wp?.a11y?.speak?.( message );
	const fmt = ( pattern, value ) => String( pattern || '%s' ).replace( '%s', value );
	const hasPasskeys = !! window.PublicKeyCredential;
	let dialog = null;
	let email = '';
	let token = '';
	let conditional = null; // The passkey request the email field keeps open (conditional UI).

	// ---- Base64url, as WebAuthn passes bytes.
	const toB64 = ( buffer ) =>
		btoa( String.fromCharCode( ...new Uint8Array( buffer ) ) )
			.replace( /\+/g, '-' )
			.replace( /\//g, '_' )
			.replace( /=+$/, '' );
	const fromB64 = ( text ) =>
		Uint8Array.from( atob( text.replace( /-/g, '+' ).replace( /_/g, '/' ) ), ( c ) => c.charCodeAt( 0 ) );

	async function call( path, body, nonce = '' ) {
		const response = await fetch( config.rest + path, {
			method: 'POST',
			credentials: 'same-origin',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
				...( nonce ? { 'X-WP-Nonce': nonce } : {} ),
			},
			body: JSON.stringify( body ),
		} );
		const data = await response.json().catch( () => ( {} ) );
		if ( ! response.ok ) {
			throw new Error( data?.message || S.failed || 'failed' );
		}
		return data;
	}

	// ---- The dialog.
	function el( tag, props = {}, children = [] ) {
		const node = document.createElement( tag );
		Object.assign( node, props );
		for ( const child of children ) {
			node.append( child );
		}
		return node;
	}
	// The sheet is drawn in Riff's tokens, which are set on the player's root, #riff, as a theme
	// sets them too. It cannot sit inside the player, which is hidden until a track loads, and a
	// dialog in a hidden element is never drawn; so it sits in the body and takes the tokens'
	// values from the player each time it opens. Without them every colour in its stylesheet
	// falls back to nothing, and in the Listen app's own document, where no theme sets a font,
	// the text falls back to the browser's serif.
	const TOKENS = [ '--riff-bg', '--riff-surface', '--riff-fg', '--riff-fg-2', '--riff-fg-3', '--riff-line', '--riff-hover', '--riff-accent' ];
	function dress() {
		const root = document.getElementById( 'riff' );
		if ( ! root ) {
			return;
		}
		const style = getComputedStyle( root );
		for ( const name of TOKENS ) {
			const value = style.getPropertyValue( name ).trim();
			if ( value ) {
				dialog.style.setProperty( name, value );
			}
		}
		dialog.style.fontFamily = style.fontFamily;
		dialog.style.colorScheme = style.colorScheme;
	}
	function build() {
		dialog = el( 'dialog', { className: 'riff-signin' } );
		dialog.setAttribute( 'aria-labelledby', 'riff-signin-title' );
		dialog.addEventListener( 'close', () => {
			conditional?.abort();
			conditional = null;
		} );
		document.body.append( dialog );
	}
	function show( parts, focus ) {
		const close = el( 'button', { type: 'button', className: 'riff-signin-close' } );
		close.setAttribute( 'aria-label', S.close || 'Close' );
		close.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
		close.addEventListener( 'click', () => dialog.close() );
		dialog.replaceChildren( close, ...parts );
		if ( ! dialog.open ) {
			dress();
			dialog.showModal();
		}
		( focus || dialog.querySelector( 'input, button.riff-signin-main' ) )?.focus();
	}
	const title = ( text ) => el( 'h2', { id: 'riff-signin-title', textContent: text } );
	const note = ( text, error = false ) => el( 'p', { className: 'riff-signin-note' + ( error ? ' riff-signin-error' : '' ), textContent: text, role: error ? 'alert' : null } );
	const help = () => {
		const p = el( 'p', { className: 'riff-signin-note' } );
		p.append( el( 'a', { href: config.login, textContent: S.help || 'Sign in with a password instead' } ) );
		return p;
	};

	// ---- Step one: the email, and a passkey from the field itself.
	function askEmail( message = '' ) {
		conditional?.abort();
		const form = el( 'form' );
		const label = el( 'label', { htmlFor: 'riff-signin-email', textContent: S.email || 'Email' } );
		const input = el( 'input', { id: 'riff-signin-email', type: 'email', name: 'email', required: true, value: email } );
		input.setAttribute( 'autocomplete', hasPasskeys ? 'username webauthn' : 'username' );
		input.setAttribute( 'inputmode', 'email' );
		const row = el( 'div', { className: 'riff-signin-row' } );
		const go = el( 'button', { type: 'submit', className: 'riff-signin-main', textContent: S.continue || 'Continue' } );
		row.append( go );
		if ( hasPasskeys ) {
			const key = el( 'button', { type: 'button', textContent: S.passkey || 'Sign in with a passkey' } );
			key.addEventListener( 'click', () => passkey( input.value.trim(), false ) );
			row.append( key );
		}
		form.append( label, input, row );
		form.addEventListener( 'submit', async ( e ) => {
			e.preventDefault();
			email = input.value.trim();
			go.disabled = true;
			try {
				const sent = await call( 'code', { email, redirect: location.href } );
				token = sent.token;
				askCode();
			} catch ( err ) {
				askEmail( err.message );
			}
		} );
		show( [ title( S.title || 'Sign in' ), el( 'p', { textContent: S.intro || '' } ), ...( message ? [ note( message, true ) ] : [] ), form, help() ], input );
		if ( hasPasskeys && PublicKeyCredential.isConditionalMediationAvailable ) {
			PublicKeyCredential.isConditionalMediationAvailable().then( ( yes ) => yes && passkey( '', true ) );
		}
	}

	// ---- A passkey: asked for from the button, or kept open by the email field.
	async function passkey( who, quiet ) {
		try {
			const { session, publicKey } = await call( 'assertion/options', { email: who } );
			conditional?.abort();
			conditional = quiet ? new AbortController() : null;
			const credential = await navigator.credentials.get( {
				publicKey: {
					...publicKey,
					challenge: fromB64( publicKey.challenge ),
					allowCredentials: ( publicKey.allowCredentials || [] ).map( ( c ) => ( { ...c, id: fromB64( c.id ) } ) ),
				},
				...( quiet ? { mediation: 'conditional', signal: conditional.signal } : {} ),
			} );
			if ( ! credential ) {
				return;
			}
			await call( 'assertion', {
				session,
				credential: {
					id: credential.id,
					response: {
						clientDataJSON: toB64( credential.response.clientDataJSON ),
						authenticatorData: toB64( credential.response.authenticatorData ),
						signature: toB64( credential.response.signature ),
						userHandle: credential.response.userHandle ? toB64( credential.response.userHandle ) : '',
					},
				},
			} );
			done();
		} catch ( err ) {
			if ( err?.name === 'AbortError' ) {
				return;
			}
			if ( ! quiet ) {
				askEmail( err?.name === 'NotAllowedError' ? S.cancelled || '' : err.message );
			}
		}
	}

	// ---- Step two: the code.
	function askCode( message = '' ) {
		const form = el( 'form' );
		const label = el( 'label', { htmlFor: 'riff-signin-code', textContent: S.code || 'Code' } );
		const input = el( 'input', { id: 'riff-signin-code', type: 'text', name: 'code', className: 'riff-signin-code', required: true, maxLength: 7 } );
		input.setAttribute( 'autocomplete', 'one-time-code' );
		input.setAttribute( 'inputmode', 'numeric' );
		input.setAttribute( 'pattern', '[0-9 ]*' );
		const row = el( 'div', { className: 'riff-signin-row' } );
		const go = el( 'button', { type: 'submit', className: 'riff-signin-main', textContent: S.signIn || 'Sign in' } );
		const again = el( 'button', { type: 'button', textContent: S.again || 'Send another code' } );
		const back = el( 'button', { type: 'button', textContent: S.back || 'Use a different email' } );
		again.addEventListener( 'click', async () => {
			again.disabled = true;
			try {
				token = ( await call( 'code', { email, redirect: location.href } ) ).token;
				askCode();
				speak( fmt( S.sent, email ) );
			} catch ( err ) {
				askCode( err.message );
			}
		} );
		back.addEventListener( 'click', () => askEmail() );
		row.append( go, again, back );
		form.append( label, input, row );
		form.addEventListener( 'submit', async ( e ) => {
			e.preventDefault();
			go.disabled = true;
			try {
				const result = await call( 'code/verify', { token, code: input.value } );
				if ( hasPasskeys && ! result.passkeys ) {
					offerPasskey( result.nonce );
				} else {
					done();
				}
			} catch ( err ) {
				askCode( err.message );
			}
		} );
		show( [ title( S.title || 'Sign in' ), el( 'p', { textContent: fmt( S.sent, email ) } ), ...( message ? [ note( message, true ) ] : [] ), form, help() ], input );
	}

	// ---- Signed in: a passkey for next time, then the page again.
	function offerPasskey( nonce ) {
		const row = el( 'div', { className: 'riff-signin-row' } );
		const yes = el( 'button', { type: 'button', className: 'riff-signin-main', textContent: S.saveYes || 'Save a passkey' } );
		const no = el( 'button', { type: 'button', textContent: S.saveNo || 'Not now' } );
		no.addEventListener( 'click', done );
		yes.addEventListener( 'click', async () => {
			yes.disabled = true;
			try {
				const options = await call( 'passkeys/options', {}, nonce );
				const credential = await navigator.credentials.create( {
					publicKey: {
						...options,
						challenge: fromB64( options.challenge ),
						user: { ...options.user, id: fromB64( options.user.id ) },
						excludeCredentials: ( options.excludeCredentials || [] ).map( ( c ) => ( { ...c, id: fromB64( c.id ) } ) ),
					},
				} );
				await call(
					'passkeys',
					{
						credential: {
							id: credential.id,
							response: {
								clientDataJSON: toB64( credential.response.clientDataJSON ),
								attestationObject: toB64( credential.response.attestationObject ),
								transports: credential.response.getTransports?.() || [],
							},
						},
						name: navigator.platform || '',
					},
					nonce
				);
				speak( S.saved || '' );
				done();
			} catch ( err ) {
				if ( err?.name === 'NotAllowedError' || err?.name === 'AbortError' ) {
					done();
					return;
				}
				show( [ title( S.done || '' ), note( err.message, true ), row ], no );
			}
		} );
		row.append( yes, no );
		show( [ title( S.done || 'You are signed in.' ), el( 'p', { textContent: S.save || '' } ), note( S.saveWhy || '' ), row ], yes );
		speak( S.done || '' );
	}
	function done() {
		speak( S.done || '' );
		dialog.close();
		// Opened again as a navigation, not a reload: the player resumes the music, as it does
		// after a link, and reads the account's likes and playlists from the fresh page.
		location.assign( location.href.split( '#' )[ 0 ] );
	}

	// ---- Any sign-in link on the page opens the sheet instead.
	document.addEventListener( 'click', ( e ) => {
		const link = e.target.closest?.( 'a[href]' );
		if ( ! link || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0 ) {
			return;
		}
		let url;
		try {
			url = new URL( link.href, location.href );
		} catch {
			return;
		}
		if ( ! url.pathname.endsWith( '/wp-login.php' ) || url.searchParams.has( 'action' ) ) {
			return;
		}
		e.preventDefault();
		if ( ! dialog ) {
			build();
		}
		askEmail();
	} );
} )();
