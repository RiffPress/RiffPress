/* Listening now: who else on the site is playing, as a row on Home. The server draws the row hidden,
 * and only when the Presence API is active and the listener is signed in; this asks the room every
 * fifteen seconds while Home shows it and the page is in view, with the version it last had, so a
 * room where nothing has changed costs the server a lookup and nothing more. Pressing someone follows
 * them: the player plays what they play, where they are, and keeps with them. */
import { fmt, route } from 'riff-app/helpers';

export function togetherRow( ctx ) {
	const { api, view, __, tell } = ctx;
	const EVERY = 15000;
	let version = null;
	let listeners = [];
	let asking = false;

	const shelf = () => view.querySelector( '[data-riff-shelf="together"]' );

	function draw() {
		const row = shelf();
		if ( ! row ) {
			return;
		}
		const cards = listeners.map( ( l ) =>
			ctx.makeCard( {
				art: l.track.art,
				title: l.user.name,
				sub: [ l.track.title, l.track.artist ]
					.filter( Boolean )
					.join( ' · ' ),
				href: '',
				play: { action: 'listen-along', data: { user: l.user.id } },
				label: l.user.name,
				says: fmt(
					/* translators: %s: The listener's name. */
					__( 'Follow %s', 'riff' ),
					l.user.name
				),
			} )
		);
		const into = row.querySelector( '.riff-shelf-row' );
		into.innerHTML = cards.join( '' );
		ctx.fade( into );
		row.hidden = ! cards.length;
	}

	async function ask() {
		const row = shelf();
		if ( ! row || asking || document.hidden ) {
			return;
		}
		asking = true;
		try {
			const u = route( row.dataset.riffTogether );
			if ( version ) {
				u.searchParams.set( 'version', version );
			}
			const r = await api.request( u );
			if ( r.ok ) {
				const room = await r.json();
				version = room.version;
				if ( room.changed !== false ) {
					listeners = Array.isArray( room.listeners )
						? room.listeners
						: [];
				}
			}
		} catch {
			// Asked again on the next tick.
		} finally {
			asking = false;
		}
		draw();
	}

	// Home drawn again, by show() or a quiet redraw, gets the row as it was and is asked at once.
	function together() {
		if ( shelf() ) {
			draw();
			ask();
		}
	}
	setInterval( ask, EVERY );
	document.addEventListener( 'visibilitychange', ask );

	// Follows them: the player takes it from here (assets/player/together.js).
	async function listenAlong( button ) {
		if ( button.getAttribute( 'aria-busy' ) === 'true' ) {
			return;
		}
		button.setAttribute( 'aria-busy', 'true' );
		const user = Number( button.dataset.riffUser );
		const name = listeners.find( ( l ) => l.user.id === user )?.user.name;
		let followed = false;
		try {
			followed = await api.follow( user, name || '' );
		} catch ( e ) {
			// A fault, not their leaving: said where it can be looked into.
			// eslint-disable-next-line no-console
			console.error( e );
		} finally {
			button.removeAttribute( 'aria-busy' );
		}
		if ( ! followed ) {
			tell(
				__( 'They have stopped listening, or to something you can’t hear.', 'riff' )
			);
			ask();
		}
	}

	return { together, listenAlong };
}
