/* Install: the browser's own prompt where it has one (Chrome, Edge), the steps where it has none
 * (Safari), and nothing where it cannot install (Firefox) or already has. The card waits for a
 * listener's second visit, and stays away once dismissed. */

export function installOffer( ctx ) {
	const { nav } = ctx;
	let installPrompt = null;
	const ua = navigator.userAgent;
	const ios =
		/iPhone|iPad|iPod/.test( ua ) ||
		( /Macintosh/.test( ua ) && navigator.maxTouchPoints > 1 );
	const safari =
		/^((?!chrome|chromium|crios|fxios|edg|android).)*safari/i.test( ua );
	const installHow = () => {
		if ( installPrompt ) {
			return 'prompt';
		}
		if ( safari ) {
			return ios ? 'ios' : 'mac';
		}
		return '';
	};
	const stored = ( key, value ) => {
		try {
			if ( value !== undefined ) {
				window.localStorage.setItem( key, value );
			}
			return window.localStorage.getItem( key );
		} catch {
			return null;
		}
	};
	let visits = Number( stored( 'riff-visits' ) ) || 0;
	try {
		if ( ! window.sessionStorage.getItem( 'riff-visit' ) ) {
			window.sessionStorage.setItem( 'riff-visit', '1' );
			visits = Number( stored( 'riff-visits', String( visits + 1 ) ) );
		}
	} catch {}
	function installShow() {
		const offer = nav?.querySelector( '[data-riff-install]' );
		if ( ! offer ) {
			return;
		}
		// A site icon whose file is gone shows Riff's own, not a broken image.
		const icon = offer.querySelector( 'img[data-riff-fallback]' );
		if ( icon && ! icon.dataset.riffWatched ) {
			icon.dataset.riffWatched = '1';
			const fall = () => {
				if ( icon.src !== icon.dataset.riffFallback ) {
					icon.src = icon.dataset.riffFallback;
				}
			};
			icon.addEventListener( 'error', fall, { once: true } );
			if ( icon.complete && ! icon.naturalWidth ) {
				fall();
			}
		}
		// A phone has no window to give it or media keys to press: it gets its own line on why.
		const phone =
			ios || window.matchMedia( '(pointer: coarse)' ).matches;
		for ( const why of offer.querySelectorAll( '[data-riff-install-why]' ) ) {
			why.hidden =
				( why.dataset.riffInstallWhy === 'phone' ) !== phone;
		}
		offer.hidden =
			window.matchMedia(
				'(display-mode: standalone), (display-mode: window-controls-overlay)'
			).matches ||
			!! stored( 'riff-install-dismissed' ) ||
			visits < 2 ||
			! installHow();
	}
	window.addEventListener( 'beforeinstallprompt', ( e ) => {
		e.preventDefault();
		installPrompt = e;
		installShow();
	} );
	window.addEventListener( 'appinstalled', () => {
		installPrompt = null;
		stored( 'riff-install-dismissed', '1' );
		installShow();
	} );
	installShow();
	function install( action ) {
		const offer = action.closest( '[data-riff-install]' );
		if ( action.dataset.riffAppAction === 'install-dismiss' ) {
			stored( 'riff-install-dismissed', '1' );
			installShow();
			// The card is gone with the focus in it: the bar it sat in takes it.
			[ ...( nav?.querySelectorAll( 'a[href], button, input' ) || [] ) ]
				.find( ( el ) => el.checkVisibility() )
				?.focus();
			return;
		}
		if ( installPrompt ) {
			installPrompt.prompt();
			installPrompt.userChoice.finally( () => {
				installPrompt = null;
				installShow();
			} );
			return;
		}
		// Safari: the steps take the button's place.
		const how = offer?.querySelector(
			`[data-riff-install-how="${ installHow() }"]`
		);
		if ( how ) {
			how.hidden = false;
			action.hidden = true;
			// The steps replace the focused button, so they take the focus and are read.
			how.tabIndex = -1;
			how.focus();
		}
	}

	return { installShow, install };
}
