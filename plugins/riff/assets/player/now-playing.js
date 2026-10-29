/* Now Playing. A dialog over the page: the page goes inert, Escape and the browser's back close
 * it, and focus goes back where it was. Up next on a phone is a handle peeking at the bottom, then
 * a split view with the art above the list, then the list on its own under a one-row player. The
 * tabs beside it are Up next and any a plugin adds through riff_now_playing_tabs. Its background
 * takes its colour from the artwork, darkened so text stays legible. The record beside the cover
 * is cut as an LP is: a band of grooves for each of the album's tracks, as wide as the track is
 * long. It turns at 33⅓, faster or slower with the music's speed as a turntable's pitch would, and
 * its tonearm tracks the album from the outside in. */
import { average, hsl, largest, route, time } from 'riff-player/helpers';

// Strings are WordPress translations of this module (wp_set_script_module_translations()).
// Core prints wp.i18n only when there are translations, so without it the strings are the
// English they are written in.
const __ = window.wp?.i18n?.__ || ( ( english ) => english );

export function nowPlaying( P ) {
	const { root, np, $, $$, queueList, emit } = P;

	let opener = null;
	function open() {
		if ( ! P.track() || ! np.hidden ) {
			return;
		}
		// Safari doesn't focus a button on click, so after a click the active element is the body;
		// focus then goes back to the bar's title, the control that opens Now Playing. So it does
		// after the chevron, which is out of the tree.
		const active = document.activeElement;
		opener =
			active && active !== document.body && ! active.matches( '.riff-chevron' )
				? active
				: $( '.riff-bar-info' );
		np.hidden = false;
		root.classList.add( 'is-open' );
		P.syncWakeLock?.();
		// Everything but the dialog is inert: the rest of the page, and on a phone the player's own
		// bar and toast, which the dialog covers there and which would otherwise still take focus.
		// On a wide screen the dialog opens above the bar and the bar stays the control surface,
		// unless the whole screen is the turntable, which covers the bar as a phone's does.
		const wide = window.matchMedia( '(min-width: 900px)' ).matches && ! wholeDeck();
		const covered = wide ? [] : [ $( '.riff-bar' ), $( '.riff-toast' ) ];
		// Modal only where it covers the bar: a screen reader keeps to a modal dialog, and on a wide
		// screen the bar beside it is still how the music is controlled.
		np.setAttribute( 'aria-modal', String( ! wide ) );
		for ( const node of [ ...document.body.children, ...covered ] ) {
			if (
				node &&
				node !== root &&
				! node.id.startsWith( 'a11y-speak' ) &&
				! node.inert
			) {
				node.inert = true;
				node.dataset.riffInert = '';
			}
		}
		for ( const b of $$( '.riff-chevron' ) ) {
			b.setAttribute( 'aria-expanded', 'true' );
		}
		history.pushState( { ...history.state, riff: 'open' }, '' );
		requestAnimationFrame( () => {
			np.classList.add( 'is-in' );
			$( '[data-riff-action="close"]' ).focus( { preventScroll: true } );
			if ( P.reduce() ) {
				hidePage();
			} else {
				np.addEventListener( 'transitionend', slidIn );
			}
		} );
	}

	// Once Now Playing has slid over the page, the page is neither styled nor painted. Each element
	// keeps its height, so the page's scroll position holds, and it is all back before Now Playing
	// slides away and focus returns to it.
	function slidIn( event ) {
		if ( event.target === np ) {
			np.removeEventListener( 'transitionend', slidIn );
			hidePage();
		}
	}

	function hidePage() {
		if ( np.hidden || ! np.classList.contains( 'is-in' ) ) {
			return;
		}
		const nodes = [ ...document.querySelectorAll( 'body > [data-riff-inert]' ) ];
		const heights = nodes.map( ( node ) => {
			const s = getComputedStyle( node );
			return (
				node.getBoundingClientRect().height -
				parseFloat( s.paddingTop ) -
				parseFloat( s.paddingBottom ) -
				parseFloat( s.borderTopWidth ) -
				parseFloat( s.borderBottomWidth )
			);
		} );
		nodes.forEach( ( node, i ) => {
			node.style.containIntrinsicHeight = `${ Math.max( 0, heights[ i ] ) }px`;
			node.dataset.riffCovered = '';
		} );
	}

	function showPage() {
		for ( const node of document.querySelectorAll( '[data-riff-covered]' ) ) {
			node.removeAttribute( 'data-riff-covered' );
			node.style.removeProperty( 'contain-intrinsic-height' );
		}
	}

	function close( { fromHistory = false } = {} ) {
		if ( np.hidden ) {
			return;
		}
		np.removeEventListener( 'transitionend', slidIn );
		showPage();
		np.classList.remove( 'is-in' );
		sheet( 'none' );
		np.style.removeProperty( 'transform' );
		root.classList.remove( 'is-open' );
		for ( const node of document.querySelectorAll( '[data-riff-inert]' ) ) {
			node.inert = false;
			node.removeAttribute( 'data-riff-inert' );
		}
		for ( const b of $$( '.riff-chevron' ) ) {
			b.setAttribute( 'aria-expanded', 'false' );
		}
		const done = () => {
			np.hidden = true;
			P.syncWakeLock?.();
		};
		if ( P.reduce() ) {
			done();
		} else {
			np.addEventListener( 'transitionend', done, { once: true } );
			setTimeout( done, 400 );
		}
		if ( ! fromHistory && history.state?.riff === 'open' ) {
			history.back();
		}
		if ( opener && document.contains( opener ) ) {
			opener.focus( { preventScroll: true } );
		}
	}

	window.addEventListener( 'popstate', () => {
		if ( ! np.hidden && history.state?.riff !== 'open' ) {
			close( { fromHistory: true } );
		}
	} );

	// ---- Up next on a phone. Tap the handle or drag it to move.
	P.sheetState = 'none';
	const peek = $( '.riff-peek' );
	function sheet( to ) {
		P.sheetState = to;
		np.dataset.sheet = to;
		peek.setAttribute( 'aria-expanded', String( to !== 'none' ) );
		if ( to !== 'none' ) {
			queueList
				.querySelector( '[aria-current]' )
				?.scrollIntoView( { block: 'nearest' } );
		}
	}

	// ---- Tabs beside Now Playing. Picking one shows its panel and fires riff.tab, so a plugin
	// fills its panel when it is seen. The keys follow the ARIA tabs pattern: arrows move and
	// pick, Home and End jump.
	const tabs = $$( '.riff-tab' );
	function pickTab( id, focus = false ) {
		const tab = tabs.find( ( t ) => t.dataset.riffTab === id );
		if ( ! tab ) {
			return;
		}
		for ( const t of tabs ) {
			t.setAttribute( 'aria-selected', String( t === tab ) );
			t.tabIndex = t === tab ? 0 : -1;
		}
		for ( const panel of $$( '[data-riff-panel]' ) ) {
			panel.hidden = panel.dataset.riffPanel !== id;
		}
		if ( focus ) {
			tab.focus();
		}
		/**
		 * Fires when a tab beside Now Playing is shown, including Up next. A plugin that added a
		 * tab fills its panel here, and again on `riff.track` while its tab is showing.
		 *
		 * @since 4.16.0
		 *
		 * @param {Object}      detail       What changed.
		 * @param {string}      detail.id    The tab's slug.
		 * @param {HTMLElement} detail.panel The tab's panel, `[data-riff-panel="<slug>"]`.
		 * @param {Object|null} detail.track The track playing.
		 * @param {Object}      api          `window.riff`.
		 */
		emit( 'tab', {
			id,
			panel: $( `[data-riff-panel="${ id }"]` ),
			track: P.track() || null,
		} );
	}
	// In Riff's desktop app Now Playing is Tidal's: the art on its own, and a tab opens its panel
	// beside it. Pressed again while its panel is open, the tab closes it.
	function drawer( tab ) {
		if ( ! document.documentElement.classList.contains( 'riff-desktop' ) ) {
			return true;
		}
		if (
			np.dataset.riffDrawer === 'open' &&
			tab.getAttribute( 'aria-selected' ) === 'true'
		) {
			delete np.dataset.riffDrawer;
			tab.setAttribute( 'aria-expanded', 'false' );
			return false;
		}
		np.dataset.riffDrawer = 'open';
		for ( const t of tabs ) {
			t.setAttribute( 'aria-expanded', String( t === tab ) );
		}
		return true;
	}
	for ( const t of tabs ) {
		t.addEventListener( 'click', () => {
			if ( drawer( t ) ) {
				pickTab( t.dataset.riffTab );
			}
		} );
		t.addEventListener( 'keydown', ( e ) => {
			const i = tabs.indexOf( t );
			const back = document.dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
			const ahead = document.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
			const to = {
				[ back ]: ( i - 1 + tabs.length ) % tabs.length,
				[ ahead ]: ( i + 1 ) % tabs.length,
				Home: 0,
				End: tabs.length - 1,
			}[ e.key ];
			if ( to !== undefined ) {
				e.preventDefault();
				pickTab( tabs[ to ].dataset.riffTab, true );
			}
		} );
	}

	// ---- The background's colour, from the artwork, and the record's label printed on paper of
	// the cover's own colour, its average: dark words on a light colour, light on a dark one, so
	// they read on either. Only for the artwork still showing once it has been read.
	const LABEL = {
		'--riff-label-ink': [ '#141414', '#fff' ],
		'--riff-label-halo': [ 'rgb(255 255 255 / 0.4)', 'rgb(0 0 0 / 0.35)' ],
	};
	function tint( src ) {
		const clear = () => {
			for ( const name of [ '--riff-tint', '--riff-label-paper', ...Object.keys( LABEL ) ] ) {
				root.style.removeProperty( name );
			}
		};
		if ( ! src ) {
			clear();
			return;
		}
		average( src ).then( ( c ) => {
			if ( largest( P.track()?.art ) !== src && P.track()?.video?.poster !== src ) {
				return;
			}
			if ( ! c ) {
				clear();
				return;
			}
			const [ h, sat ] = hsl( c.r, c.g, c.b );
			root.style.setProperty(
				'--riff-tint',
				`hsl(${ Math.round( h ) } ${ Math.round( Math.min( sat, 0.55 ) * 100 ) }% 22%)`
			);
			root.style.setProperty(
				'--riff-label-paper',
				`rgb(${ Math.round( c.r ) } ${ Math.round( c.g ) } ${ Math.round( c.b ) })`
			);
			for ( const [ name, [ onLight, onDark ] ] of Object.entries( LABEL ) ) {
				root.style.setProperty( name, c.light ? onLight : onDark );
			}
		} );
	}

	// ---- How the album is pressed, from its whole track list on the library route, asked for once
	// an album and kept. A release of one or two tracks and ten minutes at most is a 7-inch single
	// at 45, a track a side. Anything longer is LPs at 33⅓: sides of 24 minutes at most, as an LP
	// side holds before its grooves crowd, each as near the same length as the album's order
	// allows, two to a record, A and B on the first, C and D on the second. Until the track list
	// arrives the record has plain grooves.
	const SIDE = 24 * 60;
	function press( lengths ) {
		const length = lengths.reduce( ( a, b ) => a + b, 0 );
		const single = lengths.length <= 2 && length <= 600;
		const count = single ? lengths.length : Math.max( 1, Math.ceil( length / SIDE ) );
		const sides = [];
		let from = 0;
		let start = 0;
		for ( let k = 0; k < count; k++ ) {
			const target = ( length - start ) / ( count - k );
			let to = from;
			let side = 0;
			// A track joins the side while the side, with half of it, is within the side's share,
			// and enough tracks are left for the sides still to come.
			while (
				to < lengths.length &&
				( to === from || k === count - 1 || ( side + lengths[ to ] / 2 <= target && lengths.length - to > count - k - 1 ) )
			) {
				side += lengths[ to++ ];
			}
			sides.push( { from, to, start, length: side, name: String.fromCharCode( 65 + k ) } );
			from = to;
			start += side;
		}
		return { format: single ? '7' : '12', sides };
	}

	// ---- The record's grooves: between the lead-out and the lead-in at 97% of its radius, a band
	// for each of the side's tracks, wider as the track is longer, since a record's grooves keep one
	// pitch and one speed, so its playing time runs evenly across the radius. A glossy ring parts
	// each band from the next, as on a pressed record. Drawn once a side, as a background; the
	// label says the side and the speed.
	const LEAD_IN = 0.97;
	const leadOut = () => ( root.dataset.riffFormat === '7' ? 0.56 : 0.4 );
	const albums = new Map();
	let playing = null;
	// The deck's speed, as chosen on its board (null: the record's own), and its pitch, in percent.
	let chosen = null;
	let pitch = 0;
	let side = null;
	function groove( t ) {
		const album = t?.post?.id || null;
		if ( album !== playing ) {
			if ( playing !== null ) {
				change();
			}
			playing = album;
			side = null;
			// A new record plays at its own speed; the pitch stays where the hand left it.
			chosen = null;
		}
		place( t );
		if ( albums.has( album ) || ! album || ! P.data.library || navigator.connection?.saveData ) {
			return;
		}
		albums.set( album, null );
		const url = route( P.data.library, String( album ) );
		url.searchParams.set( '_fields', 'tracks' );
		P.internal
			.request( url )
			.then( ( r ) => ( r.ok ? r.json() : null ) )
			.then( ( post ) => {
				const tracks = post?.tracks || [];
				const lengths = tracks.map( ( q ) => Number( q.duration ) || 0 );
				let length = 0;
				const starts = lengths.map( ( l ) => ( length += l ) - l );
				if ( ! length ) {
					albums.delete( album );
					return;
				}
				albums.set( album, {
					ids: tracks.map( ( q ) => String( q.id ) ),
					titles: tracks.map( ( q ) => q.title || '' ),
					lengths,
					starts,
					length,
					...press( lengths ),
				} );
				if ( playing === album ) {
					place( P.track() );
				}
			} )
			.catch( () => albums.delete( album ) );
	}

	// The side the track is on, and the record it is on: a new side of the same record turns the
	// record over, another record of the set comes out of the sleeve in its place.
	function sideOf( t ) {
		const album = albums.get( playing );
		const at = album && t ? album.ids.indexOf( String( t.id ) ) : -1;
		return at < 0 ? null : album.sides.find( ( s ) => at >= s.from && at < s.to ) || null;
	}
	function place( t ) {
		const album = albums.get( playing );
		const next = sideOf( t );
		const show = () => {
			root.dataset.riffFormat = album?.format || '12';
			strobe();
			cut( next ? album.lengths.slice( next.from, next.to ) : [] );
			label( next );
			needle();
			bands();
		};
		if ( ! side || ! next || next === side ) {
			side = next;
			show();
			return;
		}
		const sameRecord = Math.floor( album.sides.indexOf( side ) / 2 ) === Math.floor( album.sides.indexOf( next ) / 2 );
		side = next;
		if ( sameRecord ) {
			flip( show );
		} else {
			change();
			show();
		}
	}
	// The label says the side and the speed, and lists the side's tracks as a pressed label does:
	// A1, A2 and on, each with its time.
	function label( on ) {
		const small = $( '.riff-label small' );
		if ( small ) {
			const speed = root.dataset.riffFormat === '7' ? '45' : '33⅓';
			small.textContent = on ? `${ on.name } · ${ speed }` : speed;
		}
		// And the side's matrix number in the run-out, as a pressing plant scratches it.
		const etch = $( '[data-riff-etch]' );
		if ( etch ) {
			etch.textContent = on ? `RIFF-${ playing }-${ on.name }1` : '';
		}
		const list = $( '.riff-label-tracks' );
		const album = albums.get( playing );
		if ( ! list ) {
			return;
		}
		list.replaceChildren(
			...( on && album ? album.titles.slice( on.from, on.to ) : [] ).map( ( title, k ) => {
				const li = document.createElement( 'li' );
				li.textContent = `${ on.name }${ k + 1 }  ${ title }  ${ time( album.lengths[ on.from + k ] ) }`;
				return li;
			} )
		);
	}

	// ---- A new side of the same record: the needle goes back to its rest, the record is turned
	// over, and the needle drops at the new side's lead-in. The music waits for it (turn()).
	const FLIP = 850;
	function flip( show ) {
		const record = $( '.riff-record' );
		const arm = $( '.riff-arm' );
		if ( ! seen() || ! record ) {
			show();
			return;
		}
		delete arm?.dataset.riffDown;
		lift();
		flip.until = performance.now() + FLIP;
		record
			.animate( [ { rotate: 'y 0deg' }, { rotate: 'y 90deg' } ], { duration: 300, delay: 250, easing: 'ease-in' } )
			.finished.then( () => {
				show();
				return record.animate( [ { rotate: 'y -90deg' }, { rotate: 'y 0deg' } ], { duration: 300, easing: 'ease-out' } ).finished;
			} )
			.then( () => {
				if ( arm && root.dataset.riffDeck === 'out' ) {
					arm.dataset.riffDown = '';
					needle();
				}
			} )
			.catch( () => {} );
	}

	// ---- A new album, or the next record of a set: the needle goes back to its rest, the record
	// back into its sleeve, the two leave, and the new sleeve comes in with its record inside, which
	// then slides out onto the platter. The turntable stays where it is. What leaves is a copy of the old cover
	// and record, made before the new artwork is painted, so it is the old album that leaves. All of
	// it moves by transform and opacity, on the compositor, and only where it is seen.
	function change() {
		const stage = $( '.riff-stage' );
		if ( np.hidden || P.reduce() || P.mode === 'video' || ! stage || ! roomy() ) {
			return;
		}
		const leaving = document.createElement( 'div' );
		leaving.className = 'riff-leaving';
		leaving.setAttribute( 'aria-hidden', 'true' );
		for ( const el of [ $( '.riff-record' ), $( '.riff-cover' ) ] ) {
			const copy = el.cloneNode( true );
			for ( const n of [ copy, ...copy.querySelectorAll( '*' ) ] ) {
				n.removeAttribute( 'data-riff-art' );
				n.removeAttribute( 'data-riff-text' );
				n.removeAttribute( 'id' );
			}
			copy.alt = '';
			leaving.append( copy );
		}
		stage.append( leaving );
		// The real record goes back in its sleeve, unseen while the new sleeve comes in.
		deck( false );
		const sleeve = leaving.querySelector( '.riff-record' );
		const out = getComputedStyle( $( '.riff-record' ) ).translate;
		const ease = 'cubic-bezier(0.4, 0, 0.2, 1)';
		sleeve.animate( [ { translate: out }, { translate: '0 0' } ], { duration: 250, delay: 200, easing: ease, fill: 'both' } );
		leaving
			.animate(
				[ { transform: 'none', opacity: 1 }, { transform: 'translateX(-40%)', opacity: 0 } ],
				{ duration: 300, delay: 400, easing: ease, fill: 'forwards' }
			)
			.finished.then( () => leaving.remove() );
		root.dataset.riffArriving = '';
		clearTimeout( change.done );
		change.until = performance.now() + ARRIVE;
		change.done = setTimeout( () => {
			delete root.dataset.riffArriving;
			// The new record comes out, for the music waiting on it or already playing.
			if ( ! P.el().paused || 'riffCued' in root.dataset ) {
				deck( true );
			}
		}, ARRIVE );
	}

	// ---- The strobe on the platter's rim, as the deck's lamp shows it (riff.css): between two of
	// its flashes the platter turns some way, and a row of dots seems to move by only what is left
	// over after the whole dots, so each row turns by that alone, a turn a second for each 360° a
	// second it seems to drift. Still while the platter is.
	const FLASHES = 120;
	function strobe() {
		const m = P.el();
		const turning = 'riffTurning' in root.dataset && root.dataset.riffDeck === 'out' && ! P.reduce();
		const rpm = root.dataset.riffFormat === '7' ? 45 : 100 / 3;
		const step = turning ? ( ( rpm / 60 ) * 360 * ( m.playbackRate || 1 ) ) / FLASHES : 0;
		// The rows' dots, round, at their radii on the rim, the platter's radius 100: drawn once, the
		// two together where the room lights them, and each on its own in the lamp's patch.
		const ROWS = [ [ 216, 95.7 ], [ 160, 97.9 ] ];
		const dots = ( rows ) => {
			let circles = '';
			for ( const [ count, radius ] of rows ) {
				for ( let n = 0; n < count; n++ ) {
					const a = ( n * 2 * Math.PI ) / count;
					circles += `<circle cx="${ ( radius * Math.cos( a ) ).toFixed( 2 ) }" cy="${ ( radius * Math.sin( a ) ).toFixed( 2 ) }" r="0.62"/>`;
				}
			}
			return `<svg viewBox="-100 -100 200 200" focusable="false">${ circles }</svg>`;
		};
		const room = $( '.riff-strobe-room i' );
		if ( room && ! room.firstChild ) {
			room.innerHTML = dots( ROWS );
		}
		$$( '.riff-strobe-lamp i' ).forEach( ( row, k ) => {
			if ( ! row.firstChild ) {
				row.innerHTML = dots( [ ROWS[ k ] ] );
			}
			const dot = 360 / ROWS[ k ][ 0 ];
			const seen = step - dot * Math.round( step / dot );
			if ( ! row.drift ) {
				row.drift = row.animate( [ { rotate: '0deg' }, { rotate: '360deg' } ], { duration: 1000, iterations: Infinity } );
				// Far into its turns, so it can run backwards as long as it needs to: run back from its
				// start, an animation stops there.
				row.drift.currentTime = 1e9;
			}
			row.drift.updatePlaybackRate( ( seen * FLASHES ) / 360 );
		} );
	}

	// The turntable stands only on a stage wider than it is tall, as on a computer or an unfolded
	// phone; on a phone held upright the cover is shown alone, at full size, and the record stays
	// in its sleeve. riff.css's container query says which, so the two never disagree; while Now
	// Playing is closed its stage has no size, so the last answer holds, and before it has ever
	// opened the window's shape stands in, so music playing on a computer already has its record
	// out when Now Playing first opens. Turning the phone, unfolding it or resizing the window
	// brings the record out or puts it back.
	function roomy() {
		const cover = $( '.riff-cover' );
		if ( ! np.hidden && cover ) {
			roomy.last = getComputedStyle( cover ).getPropertyValue( '--riff-deck' ).trim() === '1';
		}
		return roomy.last ?? window.innerWidth >= window.innerHeight * 1.2;
	}
	// Where the whole screen is the turntable (riff.css: an unfolded phone, a phone on its side),
	// opening it brings the record out whether or not it is playing, as setting a record on the
	// platter does; elsewhere it comes out only while it turns.
	const OPENING = 400;
	const wholeDeck = () =>
		getComputedStyle( $( '.riff-cover' ) ).getPropertyValue( '--riff-deck-screen' ).trim() === '1';
	if ( $( '.riff-stage' ) && 'ResizeObserver' in window ) {
		new ResizeObserver( () => {
			const was = roomy.last;
			if ( np.hidden || roomy() === was ) {
				return;
			}
			clearTimeout( deck.opening );
			// Onto the deck its speed and pitch hold; off it the music is at its own speed again.
			retune();
			if ( roomy.last && wholeDeck() && ! P.reduce() ) {
				// Opened: the sleeve settles at the deck's edge first, then the record slides out of it.
				deck.opening = setTimeout( () => deck( roomy() ), OPENING );
				return;
			}
			deck( roomy.last && ( 'riffTurning' in root.dataset || wholeDeck() ) );
		} ).observe( $( '.riff-stage' ) );
	}

	// The record out of its sleeve or back in it; out, the needle drops once it has come clear.
	function deck( out ) {
		const arm = $( '.riff-arm' );
		clearTimeout( deck.drop );
		if ( ! out || ! roomy() ) {
			delete root.dataset.riffDeck;
			delete arm?.dataset.riffDown;
			lift();
			strobe();
			stand( false );
			return;
		}
		if ( root.dataset.riffDeck === 'out' ) {
			return;
		}
		root.dataset.riffDeck = 'out';
		stand( true );
		needle();
		strobe();
		deck.drop = setTimeout( () => {
			if ( arm ) {
				arm.dataset.riffDown = '';
				needle();
			}
		}, P.reduce() ? 0 : DROP );
	}

	// ---- Starting and stopping, as a turntable does where the record is seen: Now Playing open on
	// a song, with motion. To start, the record comes out of its sleeve if it is in it (after a new
	// album has come in), the needle drops, and only then does the platter start, the music with
	// it: the platter's speed is the music's, from a crawl up to 33⅓, the pitch rising with it as
	// a record's does, the platter's turn and the arm's sweep following the same rate. To stop, it
	// winds down, the pitch falling, and then stops. Moving on to the next track, it keeps turning.
	// Where the record is not seen, the music starts and stops at once. The browser's own speed
	// change does the bending (preservesPitch off), on the element's own clock.
	const ARRIVE = 850;
	const DROP = 450;
	const LAND = 250;
	const CRAWL = 0.3;
	let ramping = 0;
	let stowing = 0;
	const seen = () =>
		! np.hidden && ! document.hidden && ! P.reduce() && P.mode !== 'video' && roomy();
	function bend( m, to, ms ) {
		const from = m.playbackRate || 1;
		const id = ++ramping;
		P.ramping = true;
		m.preservesPitch = m.webkitPreservesPitch = false;
		return new Promise( ( done ) => {
			const t0 = performance.now();
			const step = ( now ) => {
				if ( id !== ramping ) {
					return done( false );
				}
				const k = Math.min( 1, ( now - t0 ) / ms );
				// Up, a motor pulling the platter to speed, quick and then settling; down, friction,
				// at an even rate.
				const eased = to > from ? 1 - ( 1 - k ) * ( 1 - k ) : k;
				const rate = from + ( to - from ) * eased;
				if ( k < 1 ) {
					m.playbackRate = rate;
					requestAnimationFrame( step );
					return;
				}
				P.ramping = false;
				m.playbackRate = to;
				done( true );
			};
			requestAnimationFrame( step );
		} );
	}
	function settle( m ) {
		ramping++;
		P.ramping = false;
		const to = deckRate();
		m.playbackRate = m.defaultPlaybackRate = to;
		m.preservesPitch = m.webkitPreservesPitch = to === 1;
	}
	function cued( on ) {
		root.toggleAttribute( 'data-riff-cued', on );
	}
	function turn( m ) {
		clearTimeout( turn.wait );
		stowing++;
		const turning = root.dataset.playing === 'true' && root.dataset.riffDeck === 'out' && ! ( 'riffCued' in root.dataset );
		const flipping = flip.until > performance.now();
		if ( ! seen() || ( turning && ! P.ramping && ! flipping ) ) {
			cued( false );
			settle( m );
			m.play().catch( P.paint );
			return;
		}
		let wait = 0;
		if ( root.dataset.riffDeck === 'out' && m.paused && ! flipping && ! ( 'riffArriving' in root.dataset ) ) {
			// The arm is up: it comes down onto the record, and the platter starts once the stylus
			// is in the groove.
			wait = LOWER;
		} else if ( flipping ) {
			wait = flip.until - performance.now() + LAND;
		} else if ( 'riffArriving' in root.dataset ) {
			wait = Math.max( 0, change.until - performance.now() ) + DROP + LAND;
		} else if ( root.dataset.riffDeck !== 'out' ) {
			deck( true );
			wait = DROP + LAND;
		}
		cued( true );
		P.paint();
		const start = () => {
			cued( false );
			if ( P.el() !== m ) {
				return;
			}
			const from = m.paused ? CRAWL : m.playbackRate;
			m.playbackRate = from;
			m.preservesPitch = m.webkitPreservesPitch = false;
			m.play()
				.then( () => bend( m, deckRate(), 1100 * Math.abs( deckRate() - from ) ) )
				.then( ( whole ) => whole && settle( m ) )
				.catch( P.paint );
		};
		if ( wait ) {
			turn.wait = setTimeout( start, wait );
		} else {
			start();
		}
	}
	function halt( m ) {
		clearTimeout( turn.wait );
		if ( 'riffCued' in root.dataset ) {
			cued( false );
			P.paint();
			return;
		}
		if ( ! seen() || m.paused ) {
			settle( m );
			m.pause();
			return;
		}
		halt.going = m;
		bend( m, CRAWL, 900 * ( m.playbackRate || 1 ) ).then( ( whole ) => {
			halt.going = null;
			if ( whole ) {
				m.pause();
				settle( m );
			}
		} );
		P.paint();
	}
	// Whether play has been pressed and the music is waiting on the needle, or is winding down: the
	// controls show what was asked for.
	const held = () => 'riffCued' in root.dataset;

	// How long the arm takes to come down onto the record (riff.css, the tube's shadow).
	const LOWER = 300;
	const stopping = () => !! halt.going && P.ramping;

	// ---- Out of the sleeve once the album plays, and not while a new one is arriving; it stays
	// out when paused. The arm follows the music wherever it goes, and the platter its speed: 33⅓
	// at the music's own, faster or slower with it, as a turntable's pitch changes both, one rate
	// set on the animation, which keeps it on the compositor.
	for ( const el of [ P.audio, P.video ] ) {
		el.addEventListener( 'playing', () => {
			if ( el === P.el() ) {
				root.dataset.riffTurning = '';
				strobe();
			}
			if ( ! ( 'riffArriving' in root.dataset ) ) {
				deck( true );
			}
		} );
		el.addEventListener( 'pause', () => {
			if ( el === P.el() ) {
				delete root.dataset.riffTurning;
				strobe();
			}
		} );
		el.addEventListener( 'ratechange', () => {
			for ( const turns of $$( '.riff-turns' ) ) {
				for ( const a of turns.getAnimations() ) {
					a.updatePlaybackRate( el.playbackRate || 1 );
				}
			}
			strobe();
		} );
		for ( const type of [ 'timeupdate', 'pause', 'playing', 'seeked', 'ratechange' ] ) {
			el.addEventListener( type, () => needle() );
		}
	}

	// ---- The tonearm: its stylus on the groove as far in as the side has played, from the
	// lead-in to the lead-out, so each angle is one moment of the side
	// and the arm creeps inward through every track, as a stylus tracking the groove does. The arm
	// turns on a base just off the record's corner (riff.css): in the record's own width, the base
	// at (1.05, 0.05), the arm 0.78 long and pointing down at no turn, the centre at (0.5, 0.5). The
	// turn that puts the stylus at a distance from the centre is found by halving, since the stylus
	// only comes nearer the centre as the arm turns in.
	const BASE = [ 1.05, 0.05 ];
	const ARM = 0.78;
	const REST = -14;
	// How far from the centre, as a share of the radius, the groove is once a share of the album
	// has played: playing time runs evenly across the radius.
	const groovedAt = ( played ) => LEAD_IN - ( LEAD_IN - leadOut() ) * played;
	function angle( played ) {
		const want = 0.5 * groovedAt( played );
		const away = ( deg ) => {
			const r = ( deg * Math.PI ) / 180;
			return Math.hypot( BASE[ 0 ] - ARM * Math.sin( r ) - 0.5, BASE[ 1 ] + ARM * Math.cos( r ) - 0.5 );
		};
		let lo = 0;
		let hi = 50;
		for ( let i = 0; i < 20; i++ ) {
			const mid = ( lo + hi ) / 2;
			if ( away( mid ) > want ) {
				lo = mid;
			} else {
				hi = mid;
			}
		}
		return lo;
	}

	// Seconds into the side playing, and its length; null until the album's tracks are known. Until
	// the element holds the new track's file, the track has not begun.
	function where() {
		const album = albums.get( playing );
		const t = P.track();
		const on = sideOf( t );
		if ( ! on ) {
			return null;
		}
		const m = P.el();
		const file = m.getAttribute( 'src' );
		const into = file && ( file === t.src || file === t.video?.src ) ? m.currentTime || 0 : 0;
		const at = album.ids.indexOf( String( t.id ) );
		return { now: Math.min( on.length, album.starts[ at ] - on.start + into ), length: on.length, key: `${ playing }:${ on.name }`, m };
	}

	// The sweep: one animation of the arm's turn across the whole album, its keyframes the angle at
	// each point of it, its clock held to the music's. It runs on the compositor, so the arm moves
	// every frame without a line of script, and pauses, seeks and changes speed with the music.
	// Where the music jumps, a new track or a seek, the arm swings there on its spring (its tube
	// turns from where the arm was to nothing) rather than leaping.
	let sweep = null;
	let swept = '';
	const shown = ( arm ) => parseFloat( getComputedStyle( arm ).rotate ) || 0;
	function swing( arm, from, to ) {
		if ( Math.abs( from - to ) < 0.2 || P.reduce() ) {
			return;
		}
		arm.querySelector( '.riff-arm-tube' )?.animate(
			[ { rotate: `${ ( from - to ).toFixed( 2 ) }deg` }, { rotate: '0deg' } ],
			{ duration: 600, easing: getComputedStyle( root ).getPropertyValue( '--riff-spring' ).trim() || 'ease-out', composite: 'add' }
		);
	}
	function lift() {
		const arm = $( '.riff-arm' );
		if ( sweep && arm ) {
			const from = shown( arm );
			sweep.cancel();
			swing( arm, from, REST );
		}
		sweep = null;
		swept = '';
	}
	function needle() {
		const arm = $( '.riff-arm' );
		const w = where();
		// In the hand, it is where the hand holds it.
		if ( ! arm || ! w || 'riffHeld' in arm.dataset ) {
			return;
		}
		if ( P.reduce() || ! ( 'riffDown' in arm.dataset ) ) {
			arm.style.setProperty( '--riff-arm', `${ angle( w.now / w.length ).toFixed( 2 ) }deg` );
			return;
		}
		const { key } = w;
		const ms = w.now * 1000;
		if ( ! sweep || swept !== key ) {
			const from = shown( arm );
			sweep?.cancel();
			const frames = [];
			for ( let i = 0; i <= 96; i++ ) {
				frames.push( { rotate: `${ angle( i / 96 ).toFixed( 3 ) }deg` } );
			}
			sweep = arm.animate( frames, { duration: w.length * 1000, fill: 'both' } );
			swept = key;
			sweep.currentTime = ms;
			swing( arm, from, angle( w.now / w.length ) );
		} else if ( Math.abs( sweep.currentTime - ms ) > 300 ) {
			const from = shown( arm );
			sweep.currentTime = ms;
			swing( arm, from, angle( w.now / w.length ) );
		}
		if ( sweep.playbackRate !== ( w.m.playbackRate || 1 ) ) {
			sweep.updatePlaybackRate( w.m.playbackRate || 1 );
		}
		if ( w.m.paused ) {
			sweep.pause();
		} else if ( sweep.playState !== 'running' ) {
			sweep.play();
		}
	}

	// ---- The parts at hand. Tapping the sleeve puts the record away, as a hand does: the arm back
	// on its rest, the platter wound down, the record into the sleeve. Tapped again, the record
	// comes out and plays. Pressing play anywhere does the same once it is away.
	const sleeve = $( '.riff-sleeve' );
	function stand( out ) {
		$( '.riff-mount' )?.toggleAttribute( 'inert', ! out );
		if ( sleeve ) {
			sleeve.textContent = out ? __( 'Put the record away' ) : __( 'Play the record' );
		}
	}
	function stow() {
		const m = P.el();
		if ( root.dataset.riffDeck !== 'out' ) {
			turn( m );
			return;
		}
		const token = ++stowing;
		delete $( '.riff-arm' )?.dataset.riffDown;
		lift();
		const away = () => token === stowing && deck( false );
		if ( m.paused || held() ) {
			halt( m );
			away();
			return;
		}
		m.addEventListener( 'pause', away, { once: true } );
		halt( m );
	}
	sleeve?.addEventListener( 'click', stow );
	$( '.riff-cover' )?.addEventListener( 'click', () => {
		if ( sleeve?.checkVisibility() ) {
			stow();
		}
	} );

	// The arm, picked up and put down anywhere on the side: the stylus lands in the groove under
	// it, at the moment of the side that groove holds, the inverse of angle(). Dragged, it turns on
	// its base under the hand, keeping the point it was taken by; clicked, it is picked up and follows the pointer until the next click puts it down,
	// so a single pointer can move it without dragging (WCAG 2.5.7). For a keyboard it is a slider
	// over the side's bands: the arrows put it at the lead-in of the band before or after, Home
	// and End at the first and last.
	const tonearm = $( '.riff-arm' );
	// Where a point on the screen lies around the arm's base, as the arm's own angle: 0 straight
	// down, turning towards the record as it grows.
	function around( x, y ) {
		const r = $( '.riff-record' ).getBoundingClientRect();
		const dx = x - r.left - BASE[ 0 ] * r.width;
		const dy = y - r.top - BASE[ 1 ] * r.width;
		return ( Math.atan2( -dx, dy ) * 180 ) / Math.PI;
	}
	// The share of the side under the stylus with the arm at an angle, from its distance to the
	// record's centre.
	function playedOf( deg ) {
		const r = ( deg * Math.PI ) / 180;
		const out = Math.hypot( BASE[ 0 ] - ARM * Math.sin( r ) - 0.5, BASE[ 1 ] + ARM * Math.cos( r ) - 0.5 ) / 0.5;
		return Math.min( 1, Math.max( 0, ( LEAD_IN - out ) / ( LEAD_IN - leadOut() ) ) );
	}
	// In the hand: turned by as much as the hand has turned round the base since it took the arm,
	// from its rest to the end of the side.
	let grip = null;
	function take( x, y ) {
		grip = { deg: shown( tonearm ), at: around( x, y ) };
	}
	function hold( x, y ) {
		sweep?.cancel();
		sweep = null;
		swept = '';
		tonearm.dataset.riffHeld = '';
		delete tonearm.dataset.riffDown;
		grip.now = Math.min( angle( 1 ), Math.max( REST, grip.deg + around( x, y ) - grip.at ) );
		tonearm.style.setProperty( '--riff-arm', `${ grip.now.toFixed( 2 ) }deg` );
	}
	// The band a moment of the side is in, and how far into it.
	function bandAt( played ) {
		const album = albums.get( playing );
		const on = sideOf( P.track() );
		const s = played * on.length;
		let k = on.from;
		while ( k + 1 < on.to && album.starts[ k + 1 ] - on.start <= s ) {
			k++;
		}
		return { k, into: Math.max( 0, s - ( album.starts[ k ] - on.start ) ) };
	}
	// The needle down on a band: the track playing moves; another in the queue is loaded there,
	// playing if the music was. A band whose track is not in the queue leaves the music alone.
	function land( k, into = 0 ) {
		delete tonearm.dataset.riffHeld;
		if ( root.dataset.riffDeck === 'out' ) {
			tonearm.dataset.riffDown = '';
		}
		const album = albums.get( playing );
		const id = String( album.ids[ k ] );
		const m = P.el();
		if ( id === String( P.track().id ) ) {
			m.currentTime = into;
		} else {
			const i = P.order.findIndex( ( q ) => String( P.queue[ q ].id ) === id );
			if ( i >= 0 ) {
				const play = ! m.paused || held();
				P.stopAll();
				P.pos = i;
				P.load( { play, at: into } );
			}
		}
		needle();
	}
	// The slider's value: the band playing, by its number on the side.
	function bands() {
		const album = albums.get( playing );
		const on = sideOf( P.track() );
		if ( ! tonearm || ! on ) {
			return;
		}
		const k = album.ids.indexOf( String( P.track().id ) );
		tonearm.setAttribute( 'aria-valuemax', String( on.to - on.from ) );
		tonearm.setAttribute( 'aria-valuenow', String( k - on.from + 1 ) );
		tonearm.setAttribute( 'aria-valuetext', `${ on.name }${ k - on.from + 1 } ${ album.titles[ k ] }` );
	}
	if ( tonearm ) {
		let from = null;
		let carried = false;
		const follow = ( e ) => hold( e.clientX, e.clientY );
		const put = ( e ) => {
			document.removeEventListener( 'pointermove', follow );
			hold( e.clientX, e.clientY );
			const { k, into } = bandAt( playedOf( grip.now ) );
			grip = null;
			land( k, into );
		};
		tonearm.addEventListener( 'pointerdown', ( e ) => {
			if ( ! sideOf( P.track() ) || carried ) {
				return;
			}
			e.stopPropagation();
			e.preventDefault();
			tonearm.setPointerCapture( e.pointerId );
			from = { x: e.clientX, y: e.clientY, moved: false };
			take( e.clientX, e.clientY );
		} );
		tonearm.addEventListener( 'pointermove', ( e ) => {
			if ( ! from ) {
				return;
			}
			if ( Math.hypot( e.clientX - from.x, e.clientY - from.y ) > 4 ) {
				from.moved = true;
			}
			if ( from.moved ) {
				follow( e );
			}
		} );
		tonearm.addEventListener( 'pointerup', ( e ) => {
			if ( ! from ) {
				return;
			}
			const { moved } = from;
			from = null;
			if ( moved ) {
				put( e );
				return;
			}
			// Clicked: carried until the next press, wherever it is.
			carried = true;
			hold( e.clientX, e.clientY );
			document.addEventListener( 'pointermove', follow );
			document.addEventListener(
				'pointerdown',
				( down ) => {
					down.stopPropagation();
					down.preventDefault();
					carried = false;
					put( down );
				},
				{ capture: true, once: true }
			);
		} );
		tonearm.addEventListener( 'keydown', ( e ) => {
			const on = sideOf( P.track() );
			if ( ! on ) {
				return;
			}
			const k = albums.get( playing ).ids.indexOf( String( P.track().id ) );
			const back = document.dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
			const ahead = document.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
			const to = {
				[ back ]: k - 1,
				ArrowDown: k - 1,
				[ ahead ]: k + 1,
				ArrowUp: k + 1,
				Home: on.from,
				End: on.to - 1,
			}[ e.key ];
			if ( to === undefined ) {
				return;
			}
			e.preventDefault();
			if ( to >= on.from && to < on.to && to !== k ) {
				land( to );
			}
		} );
	}

	// ---- The deck's own controls, where the whole screen is the turntable: the two speeds and the
	// pitch fader. The music plays at the speed chosen over the record's own (an LP at 45 runs
	// fast, as on a deck), times the pitch, ±8%; its pitch moves with it, as a record's does, and
	// the platter, the strobe and the arm follow the one rate (ratechange, above). Anywhere else
	// the music plays at its own speed.
	const RPM = { 33: 100 / 3, 45: 45 };
	const own = () => ( root.dataset.riffFormat === '7' ? '45' : '33' );
	function deckRate() {
		if ( ! $( '.riff-cover' ) || ! wholeDeck() ) {
			return 1;
		}
		return ( RPM[ chosen ?? own() ] / RPM[ own() ] ) * ( 1 + pitch / 100 );
	}
	const board = $( '.riff-deck-board' );
	const fader = $( '[data-riff-pitch]' );
	function paintDeck() {
		if ( ! board ) {
			return;
		}
		for ( const b of board.querySelectorAll( '[data-riff-speed]' ) ) {
			const on = b.dataset.riffSpeed === ( chosen ?? own() );
			b.setAttribute( 'aria-checked', String( on ) );
			b.tabIndex = on ? 0 : -1;
		}
		const readout = `${ pitch > 0 ? '+' : '' }${ pitch.toFixed( 1 ) }`;
		fader.value = String( pitch );
		fader.setAttribute( 'aria-valuetext', `${ readout }%` );
		board.querySelector( 'output' ).textContent = readout;
	}
	// The motor pulls the platter to the new speed while it turns; stopped, it starts there.
	function retune() {
		paintDeck();
		const m = P.el();
		if ( m.paused || held() || P.ramping ) {
			m.defaultPlaybackRate = deckRate();
			return;
		}
		bend( m, deckRate(), 450 ).then( ( whole ) => whole && settle( m ) );
	}
	if ( board ) {
		board.addEventListener( 'click', ( e ) => {
			const speed = e.target.closest( '[data-riff-speed]' );
			if ( speed ) {
				chosen = speed.dataset.riffSpeed;
				retune();
			}
		} );
		// The speeds are a radio group: the arrows move between them.
		board.querySelector( '.riff-speeds' ).addEventListener( 'keydown', ( e ) => {
			if ( ! [ 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown' ].includes( e.key ) ) {
				return;
			}
			e.preventDefault();
			chosen = ( chosen ?? own() ) === '33' ? '45' : '33';
			retune();
			board.querySelector( `[data-riff-speed="${ chosen }"]` ).focus();
		} );
		fader.addEventListener( 'input', () => {
			const v = Number( fader.value );
			// It clicks into the middle, as a fader's centre detent does.
			pitch = Math.abs( v ) < 0.3 ? 0 : v;
			retune();
		} );
		fader.addEventListener( 'dblclick', () => {
			pitch = 0;
			retune();
		} );
		paintDeck();
	}

	function cut( lengths ) {
		const record = $( '.riff-record' );
		const whole = lengths.reduce( ( a, b ) => a + b, 0 );
		if ( ! record || lengths.length < 2 || ! whole ) {
			record?.style.removeProperty( '--riff-bands' );
			return;
		}
		const stops = [];
		let played = 0;
		for ( const length of lengths.slice( 0, -1 ) ) {
			played += length;
			const at = 100 * groovedAt( played / whole );
			stops.unshift(
				`transparent ${ ( at - 0.35 ).toFixed( 2 ) }%, rgb(255 255 255 / 0.09) ${ ( at - 0.35 ).toFixed( 2 ) }% ${ ( at + 0.35 ).toFixed( 2 ) }%, transparent ${ ( at + 0.35 ).toFixed( 2 ) }%`
			);
		}
		record.style.setProperty(
			'--riff-bands',
			`radial-gradient(circle closest-side, ${ stops.join( ', ' ) })`
		);
	}

	return { open, close, sheet, pickTab, tint, groove, deck, turn, halt, held, stopping };
}
