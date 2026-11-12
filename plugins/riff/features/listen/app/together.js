/* Listening now: who else on the site is playing, as a row on Home and as faces on an album's page,
 * of whoever is playing from it. The server draws each hidden, and only when the Presence API is
 * active and the listener is signed in; this asks the room every fifteen seconds while the view
 * shows one and the page is in view, with the version it last had, so a room where nothing has
 * changed costs the server a lookup and nothing more. Pressing someone follows them: the player plays
 * what they play, where they are, and keeps with them. */
import { fmt, route } from 'riff-app/helpers';

// A person, where a listener has no face.
const NO_FACE =
	'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M15.25 8.25A3.25 3.25 0 1 1 8.75 8.25A3.25 3.25 0 0 1 15.25 8.25Z"/><path d="M5.75 19.25V18C5.75 16.2 7.2 14.75 9 14.75H15C16.8 14.75 18.25 16.2 18.25 18V19.25"/></svg>';

export function togetherRow( ctx ) {
	const { api, view, __, tell } = ctx;
	const EVERY = 15000;
	let version = null;
	let listeners = [];
	let elsewhere = []; // Listeners on other sites a host adds (riff_together_elsewhere), on Home.
	let asking = 0; // The ask in flight, by its turn; 0 for none.
	let turn = 0;
	// The address the room was last asked at: Home's, or one album's, each with its own listeners.
	let from = '';

	const spot = () => view.querySelector( '[data-riff-together]' );

	const follows = ( name ) =>
		fmt(
			/* translators: %s: The listener's name. */
			__( 'Listen along with %s', 'riff' ),
			name
		);

	function shelf( row ) {
		// Each listener's card, as the server draws every card.
		const cards = listeners.map( ( l ) => String( l.card || '' ) );
		const into = row.querySelector( '.riff-shelf-row' );
		into.innerHTML = cards.join( '' );
		ctx.fade( into );
		row.hidden = ! cards.length;
		// Under their own heading, each card linking to listen along where they are.
		const others = view.querySelector(
			'[data-riff-shelf="together-elsewhere"]'
		);
		if ( others ) {
			const html = elsewhere.map( ( l ) => String( l.card || '' ) ).join( '' );
			const list = others.querySelector( '.riff-shelf-row' );
			// Drawn again only when it changed, so a link keeps its focus.
			if ( list.dataset.riffDrawn !== html ) {
				list.dataset.riffDrawn = html;
				list.innerHTML = html;
				ctx.fade( list );
			}
			others.hidden = ! elsewhere.length;
		}
	}

	// An album's faces, each a button that follows them. Drawn again only when who is there changes,
	// so a face keeps its focus.
	function faces( holder ) {
		const into = holder.querySelector( '.riff-album-faces' );
		const key = JSON.stringify( listeners.map( ( l ) => l.user ) );
		if ( into.dataset.riffDrawn !== key ) {
			into.dataset.riffDrawn = key;
			into.replaceChildren(
				...listeners.map( ( l ) => {
					const b = document.createElement( 'button' );
					b.type = 'button';
					b.className = 'riff-album-face';
					b.dataset.riffAppAction = 'listen-along';
					b.dataset.riffUser = String( l.user.id );
					b.setAttribute( 'aria-label', follows( l.user.name ) );
					b.title = follows( l.user.name );
					b.innerHTML = NO_FACE;
					if ( l.user.face ) {
						const img = document.createElement( 'img' );
						img.alt = '';
						img.addEventListener( 'error', () => img.remove(), {
							once: true,
						} );
						img.src = l.user.face;
						b.append( img );
					}
					return b;
				} )
			);
		}
		holder.hidden = ! listeners.length;
	}

	function draw() {
		const holder = spot();
		if ( ! holder || holder.dataset.riffTogether !== from ) {
			return;
		}
		if ( holder.dataset.riffShelf ) {
			shelf( holder );
		} else {
			faces( holder );
		}
	}

	async function ask() {
		const holder = spot();
		if ( ! holder || document.hidden ) {
			return;
		}
		const at = holder.dataset.riffTogether;
		// One ask at a time, unless the view has moved on to another room's address.
		if ( asking && at === from ) {
			return;
		}
		if ( at !== from ) {
			from = at;
			version = null;
			listeners = [];
			elsewhere = [];
		}
		const mine = ++turn;
		asking = mine;
		try {
			const u = route( at );
			if ( version ) {
				u.searchParams.set( 'version', version );
			}
			const r = await api.request( u );
			// Another view's answer, once that view has gone, is left.
			if ( r.ok && at === from ) {
				const room = await r.json();
				version = room.version;
				if ( room.changed !== false ) {
					listeners = Array.isArray( room.listeners )
						? room.listeners
						: [];
					elsewhere = Array.isArray( room.elsewhere )
						? room.elsewhere
						: [];
				}
			}
		} catch {
			// Asked again on the next tick.
		} finally {
			if ( asking === mine ) {
				asking = 0;
			}
		}
		draw();
	}

	// A view drawn again, by show() or a quiet redraw, gets its listeners as they were and is asked
	// at once.
	function together() {
		if ( spot() ) {
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
