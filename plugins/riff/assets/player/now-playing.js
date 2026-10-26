/* Now Playing. A dialog over the page: the page goes inert, Escape and the browser's back close
 * it, and focus goes back where it was. Up next on a phone is a handle peeking at the bottom, then
 * a split view with the art above the list, then the list on its own under a one-row player. The
 * tabs beside it are Up next and any a plugin adds through riff_now_playing_tabs. Its background
 * takes its colour from the artwork, darkened so text stays legible. The record beside the cover
 * is cut as an LP is: a band of grooves for each of the album's tracks, as wide as the track is
 * long. It turns at 33⅓, faster or slower with the music's speed as a turntable's pitch would, and
 * its tonearm tracks the album from the outside in. */
import { average, hsl, largest, route } from 'riff-player/helpers';

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
		// On a wide screen the dialog opens above the bar and the bar stays the control surface.
		const wide = window.matchMedia( '(min-width: 900px)' ).matches;
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
		} );
	}

	function close( { fromHistory = false } = {} ) {
		if ( np.hidden ) {
			return;
		}
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

	// ---- The background's colour, from the artwork, and the record's label printed in it: dark
	// words on a light cover, light on a dark one, so they read on either, over a veil, pale under
	// dark words and dark under light ones, so the label reads as one printed colour wherever the
	// cover has light and dark. Only for the artwork still showing once it has been read.
	const LABEL = {
		'--riff-label-ink': [ '#141414', '#fff' ],
		'--riff-label-halo': [ 'rgb(255 255 255 / 0.4)', 'rgb(0 0 0 / 0.35)' ],
		'--riff-label-veil': [ 'rgb(255 255 255 / 0.6)', 'rgb(0 0 0 / 0.35)' ],
	};
	function tint( src ) {
		const clear = () => {
			for ( const name of [ '--riff-tint', ...Object.keys( LABEL ) ] ) {
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
			for ( const [ name, [ onLight, onDark ] ] of Object.entries( LABEL ) ) {
				root.style.setProperty( name, c.light ? onLight : onDark );
			}
		} );
	}

	// ---- The record's grooves: between the lead-out at 40% of its radius and the lead-in at 97%, a
	// band for each of the album's tracks, wider as the track is longer, since an LP's grooves keep
	// one pitch and one speed, so its playing time runs evenly across the radius. A glossy ring parts
	// each band from the next, as on a pressed record. The bands are the album's own, its whole
	// track list from the library route, asked for once an album and kept, with where each track
	// starts; until it arrives the record has plain grooves. Drawn once an album, as a background.
	const LEAD_IN = 0.97;
	const LEAD_OUT = 0.4;
	const albums = new Map();
	let playing = null;
	function groove( t ) {
		const album = t?.post?.id || null;
		if ( album !== playing ) {
			if ( playing !== null ) {
				change();
			}
			playing = album;
			cut( albums.get( album )?.lengths || [] );
		}
		needle();
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
				albums.set( album, { ids: tracks.map( ( q ) => String( q.id ) ), lengths, starts, length } );
				if ( playing === album ) {
					cut( lengths );
					needle();
				}
			} )
			.catch( () => albums.delete( album ) );
	}

	// ---- A new album: the record goes back into its sleeve and the two leave, and the new sleeve
	// comes in with its record inside, which then slides out. What leaves is a copy of the old cover
	// and record, made before the new artwork is painted, so it is the old album that leaves. All of
	// it moves by transform and opacity, on the compositor, and only where it is seen.
	function change() {
		const stage = $( '.riff-stage' );
		if ( np.hidden || P.reduce() || P.mode === 'video' || ! stage ) {
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
		sleeve.animate( [ { translate: out }, { translate: '0 0' } ], { duration: 250, easing: ease, fill: 'forwards' } );
		leaving
			.animate(
				[ { transform: 'none', opacity: 1 }, { transform: 'translateX(-40%)', opacity: 0 } ],
				{ duration: 300, delay: 200, easing: ease, fill: 'forwards' }
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

	// The record out of its sleeve or back in it; out, the needle drops once it has come clear.
	function deck( out ) {
		const arm = $( '.riff-arm' );
		clearTimeout( deck.drop );
		if ( ! out ) {
			delete root.dataset.riffDeck;
			delete arm?.dataset.riffDown;
			lift();
			return;
		}
		if ( root.dataset.riffDeck === 'out' ) {
			return;
		}
		root.dataset.riffDeck = 'out';
		needle();
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
	const ARRIVE = 650;
	const DROP = 450;
	const LAND = 250;
	const CRAWL = 0.3;
	let ramping = 0;
	const seen = () =>
		! np.hidden && ! document.hidden && ! P.reduce() && P.mode !== 'video' && !! $( '.riff-stage' );
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
		m.playbackRate = 1;
		m.preservesPitch = m.webkitPreservesPitch = true;
	}
	function cued( on ) {
		root.toggleAttribute( 'data-riff-cued', on );
	}
	function turn( m ) {
		clearTimeout( turn.wait );
		const turning = root.dataset.playing === 'true' && root.dataset.riffDeck === 'out' && ! ( 'riffCued' in root.dataset );
		if ( ! seen() || ( turning && ! P.ramping ) ) {
			cued( false );
			settle( m );
			m.play().catch( P.paint );
			return;
		}
		let wait = 0;
		if ( 'riffArriving' in root.dataset ) {
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
				.then( () => bend( m, 1, 1100 * ( 1 - from ) ) )
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
	const stopping = () => !! halt.going && P.ramping;

	// ---- Out of the sleeve once the album plays, and not while a new one is arriving; it stays
	// out when paused. The arm follows the music wherever it goes, and the platter its speed: 33⅓
	// at the music's own, faster or slower with it, as a turntable's pitch changes both, one rate
	// set on the animation, which keeps it on the compositor.
	for ( const el of [ P.audio, P.video ] ) {
		el.addEventListener( 'playing', () => {
			if ( el === P.el() ) {
				root.dataset.riffTurning = '';
			}
			if ( ! ( 'riffArriving' in root.dataset ) ) {
				deck( true );
			}
		} );
		el.addEventListener( 'pause', () => {
			if ( el === P.el() ) {
				delete root.dataset.riffTurning;
			}
		} );
		el.addEventListener( 'ratechange', () => {
			for ( const a of $( '.riff-spin' )?.getAnimations() || [] ) {
				a.updatePlaybackRate( el.playbackRate || 1 );
			}
		} );
		for ( const type of [ 'timeupdate', 'pause', 'playing', 'seeked', 'ratechange' ] ) {
			el.addEventListener( type, () => needle() );
		}
	}

	// ---- The tonearm: its stylus on the groove as far in as the album has played, from the
	// lead-in to the lead-out, so each angle is one moment of the album
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
	const groovedAt = ( played ) => LEAD_IN - ( LEAD_IN - LEAD_OUT ) * played;
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

	// Seconds into the album, and its length; null until its tracks are known. Until the element
	// holds the new track's file, the track has not begun.
	function where() {
		const album = albums.get( playing );
		const t = P.track();
		const at = album && t ? album.ids.indexOf( String( t.id ) ) : -1;
		if ( at < 0 ) {
			return null;
		}
		const m = P.el();
		const file = m.getAttribute( 'src' );
		const into = file && ( file === t.src || file === t.video?.src ) ? m.currentTime || 0 : 0;
		return { now: Math.min( album.length, album.starts[ at ] + into ), length: album.length, m };
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
		if ( ! arm || ! w ) {
			return;
		}
		if ( P.reduce() || ! ( 'riffDown' in arm.dataset ) ) {
			arm.style.setProperty( '--riff-arm', `${ angle( w.now / w.length ).toFixed( 2 ) }deg` );
			return;
		}
		const key = `${ playing }:${ w.length }`;
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
