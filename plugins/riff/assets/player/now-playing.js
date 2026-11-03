/* Now Playing. A dialog over the page: the page goes inert, Escape and the browser's back close
 * it, and focus goes back where it was. It is the track on its own: Up next and the other panels
 * are their own things, opened beside it or over it (registry.js). Its background takes its colour
 * from the artwork, darkened so text stays legible. The record beside the cover is cut as an LP
 * is: a band of grooves for each of the album's tracks, as wide as the track is long. It turns at
 * 33⅓, faster or slower with the music's speed as a turntable's pitch would, and its tonearm
 * tracks the album from the outside in. */
import { average, hsl, largest, read, route, time, write } from 'riff-player/helpers';

// Strings are WordPress translations of this module (wp_set_script_module_translations()).
// Core prints wp.i18n only when there are translations, so without it the strings are the
// English they are written in.
const __ = window.wp?.i18n?.__ || ( ( english ) => english );

export function nowPlaying( P ) {
	const { root, np, $, $$ } = P;

	let opener = null;
	// The view showing: the album, the cover on its own, until the listener opens another.
	P.showing = 'album';
	// Whether the turntable showing was the screen's shape's doing (reshape()), not the listener's.
	let unfolded = false;
	const TURNTABLE = 'riff:turntable';
	const screen = ( id ) => P.views?.get( id )?.place === 'screen';

	// The view Now Playing opens to when none is named: the turntable where the whole screen is
	// one, as an unfolded iPhone Duo is, since that is what the shape is for; the turntable for a
	// listener who last chose it; otherwise the album.
	function opening() {
		if ( ! P.views?.has( 'turntable' ) ) {
			return 'album';
		}
		if ( shapedAsDeck() ) {
			return 'turntable';
		}
		return read( localStorage, TURNTABLE ) === 'on' ? 'turntable' : 'album';
	}

	// A view in Now Playing's place: its region shown and the others hidden, or the stage, with
	// the record out on the deck for the turntable and the cover on its own for the album. Quiet,
	// for the screen changing shape under it, it keeps the listener's choice and their focus.
	function setView( id, { quiet = false } = {} ) {
		if ( ! screen( id ) ) {
			return;
		}
		const was = P.showing;
		const shown = ! np.hidden;
		if ( ! quiet ) {
			unfolded = false;
		}
		P.showing = id;
		root.dataset.riffShowing = id;
		const stage = !! P.views.get( id ).stage;
		np.dataset.riffScreen = stage ? 'stage' : 'own';
		for ( const [ other, v ] of P.views ) {
			if ( v.place === 'screen' && v.el ) {
				v.el.hidden = other !== id;
			}
		}
		if ( turntable() ) {
			delete root.dataset.riffTurntable;
		} else {
			root.dataset.riffTurntable = 'off';
		}
		// The listener's choice of the album or the turntable, kept for the next time.
		if ( stage && P.views.has( 'turntable' ) && ! shapedAsDeck() && ! quiet ) {
			write( localStorage, TURNTABLE, id === 'turntable' ? 'on' : 'off' );
		}
		roomy.last = undefined;
		clearTimeout( deck.opening );
		// Not a press of the listener's: changing the view doesn't stop following someone.
		retune( false );
		markRoom();
		deck( roomy() && ( 'riffTurning' in root.dataset || wholeDeck() ) );
		if ( shown && was !== id ) {
			P.viewOpened?.( was, false );
		}
		if ( shown ) {
			P.viewOpened?.( id, true );
			if ( ! quiet ) {
				focusView();
			}
		}
		P.drawControls?.();
	}

	// Focus into the view: its own region, or Now Playing's close button for the stage.
	function focusView() {
		const own = P.views?.get( P.showing );
		( own && ! own.stage && own.el ? own.el : $( '[data-riff-action="close"]' ) )?.focus( {
			preventScroll: true,
		} );
	}

	function open( id ) {
		if ( ! P.track() ) {
			return;
		}
		// Open, and not sliding away: the view changes in place.
		if ( ! np.hidden && root.classList.contains( 'is-open' ) ) {
			setView( screen( id ) ? id : opening() );
			return;
		}
		// Where the whole screen is a turntable, as an unfolded iPhone Duo is, Now Playing opens to
		// it, from the album's button too; a view of its own, such as the lyrics, opens as named.
		const own = screen( id ) && ! P.views.get( id ).stage;
		const view =
			! own && shapedAsDeck() && P.views?.has( 'turntable' )
				? 'turntable'
				: screen( id ) ? id : opening();
		// Safari doesn't focus a button on click, so after a click the active element is the body;
		// focus then goes back to the view's button in the bar.
		const active = document.activeElement;
		opener =
			active && active !== document.body
				? active
				: $( `[data-riff-control="${ view }"]` ) || $( '[data-riff-control="album"]' );
		setView( view );
		// Opened again while it slid away: it stays.
		clearTimeout( closing.timer );
		np.removeEventListener( 'transitionend', closing.done );
		closing.done = null;
		np.hidden = false;
		root.classList.add( 'is-open' );
		P.syncWakeLock?.();
		// Everything but the dialog is inert: the rest of the page, and on a phone the player's own
		// bar and toast, which the dialog covers there and which would otherwise still take focus.
		// On a wide screen the dialog opens above the bar and the bar stays the control surface,
		// unless it is a touch screen on its side, where Now Playing covers the bar as a phone's
		// does, the turntable or not (riff.css).
		coverPage();
		history.pushState( { ...history.state, riff: 'open' }, '' );
		P.viewOpened?.( view, true );
		P.drawControls?.();
		requestAnimationFrame( () => {
			np.classList.add( 'is-in' );
			focusView();
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

	// Whether it covers the bar, as riff.css lays it out (--riff-np-covers), so the shapes are
	// written down once; asked again as the screen changes shape while it is open.
	function coverPage() {
		for ( const node of document.querySelectorAll( '[data-riff-inert]' ) ) {
			node.inert = false;
			node.removeAttribute( 'data-riff-inert' );
		}
		const wide =
			getComputedStyle( np ).getPropertyValue( '--riff-np-covers' ).trim() === '0';
		const covered = wide ? [] : [ $( '.riff-bar' ), $( '.riff-toast' ) ];
		// Modal only where it covers the bar: a screen reader keeps to a modal dialog, and on a wide
		// screen the bar beside it is still how the music is controlled.
		np.setAttribute( 'aria-modal', String( ! wide ) );
		for ( const node of [ ...document.body.children, ...covered ] ) {
			// The track menu is left alone, as the panels leave it: opened from the page before
			// anything played, it sits in the body, and it moves into Up next or Now Playing when
			// opened there, taking an inert set here with it.
			if (
				node &&
				node !== root &&
				! node.classList.contains( 'riff-menu' ) &&
				! node.id.startsWith( 'a11y-speak' ) &&
				! node.inert
			) {
				node.inert = true;
				node.dataset.riffInert = '';
			}
		}
	}
	window.addEventListener( 'resize', () => {
		if ( root.classList.contains( 'is-open' ) && ! P.panelOpen ) {
			coverPage();
		}
	} );

	// Now Playing sliding away: what hides it once it has, which opening it again cancels.
	const closing = { done: null, timer: 0 };
	function close( { fromHistory = false } = {} ) {
		// Closed, or already sliding away (the back button's popstate after a close of its own).
		if ( np.hidden || ! root.classList.contains( 'is-open' ) ) {
			return;
		}
		clearTimeout( closing.timer );
		np.removeEventListener( 'transitionend', closing.done );
		np.removeEventListener( 'transitionend', slidIn );
		showPage();
		np.classList.remove( 'is-in' );
		np.style.removeProperty( 'transform' );
		root.classList.remove( 'is-open' );
		for ( const node of document.querySelectorAll( '[data-riff-inert]' ) ) {
			node.inert = false;
			node.removeAttribute( 'data-riff-inert' );
		}
		P.viewOpened?.( P.showing, false );
		// Hidden once it has slid away, unless it was opened again first.
		const done = () => {
			clearTimeout( closing.timer );
			np.removeEventListener( 'transitionend', closing.done );
			closing.done = null;
			if ( ! root.classList.contains( 'is-open' ) ) {
				np.hidden = true;
				P.syncWakeLock?.();
			}
		};
		if ( P.reduce() ) {
			done();
		} else {
			closing.done = done;
			np.addEventListener( 'transitionend', done, { once: true } );
			closing.timer = setTimeout( done, 400 );
		}
		if ( ! fromHistory && history.state?.riff === 'open' ) {
			history.back();
		}
		// The button that opened it, or, hidden since (its view had nothing for the next track),
		// the button of the view showing.
		const back = [ opener, $( `[data-riff-control="${ P.showing }"]` ) ].find(
			( node ) => node && document.contains( node ) && ! node.hidden
		);
		back?.focus( { preventScroll: true } );
		P.drawControls?.();
	}

	window.addEventListener( 'popstate', () => {
		if ( ! np.hidden && history.state?.riff !== 'open' ) {
			close( { fromHistory: true } );
		}
	} );

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
	// allows, two to a record, A and B on the first, C and D on the second. Where the files' tags
	// say which disc of a set each track is on, and name more than one, each disc is a record of
	// its own (or more, should it run longer than two sides hold), its sides worked out from its
	// own tracks, so no side runs from one disc onto the next. Until the track list arrives the
	// record has plain grooves.
	const SIDE = 24 * 60;
	function split( lengths, at, start, count ) {
		const length = lengths.reduce( ( a, b ) => a + b, 0 );
		const sides = [];
		let from = 0;
		let into = 0;
		for ( let k = 0; k < count; k++ ) {
			const target = ( length - into ) / ( count - k );
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
			if ( to > from ) {
				sides.push( { from: at + from, to: at + to, start: start + into, length: side } );
			}
			from = to;
			into += side;
		}
		return sides;
	}
	function press( lengths, discs = [] ) {
		const length = lengths.reduce( ( a, b ) => a + b, 0 );
		const single = lengths.length <= 2 && length <= 600;
		const named = discs.length === lengths.length && discs.every( ( d ) => d > 0 ) && new Set( discs ).size > 1;
		// The runs of tracks on one disc, in the album's order; the whole album as one, where the
		// tags don't say.
		const runs = [];
		for ( let k = 0; k < lengths.length; k++ ) {
			if ( k && named && discs[ k ] === discs[ k - 1 ] ) {
				runs[ runs.length - 1 ].to = k + 1;
			} else if ( ! k || named ) {
				runs.push( { from: k, to: k + 1 } );
			} else {
				runs[ 0 ].to = k + 1;
			}
		}
		const sides = [];
		let start = 0;
		let record = 0;
		for ( const run of runs ) {
			const part = lengths.slice( run.from, run.to );
			const span = part.reduce( ( a, b ) => a + b, 0 );
			const count = single ? part.length : Math.max( 1, Math.ceil( span / SIDE ) );
			const pressed = split( part, run.from, start, count );
			pressed.forEach( ( s, k ) => sides.push( { ...s, record: record + Math.floor( k / 2 ) } ) );
			record += Math.ceil( pressed.length / 2 );
			start += span;
		}
		sides.forEach( ( s, k ) => ( s.name = String.fromCharCode( 65 + k ) ) );
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
			stopRunout();
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
					levels: tracks.map( ( q ) => ( typeof q.levels === 'string' ? q.levels : '' ) ),
					...press( lengths, tracks.map( ( q ) => Number( q.disc ) || 0 ) ),
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
		// Moved on while the stylus rides the run-out: the side still up is the one it was in.
		if ( runout.until ) {
			side = runout.from;
			stopRunout();
		}
		const show = () => {
			root.dataset.riffFormat = album?.format || '12';
			strobe();
			cut( next );
			label( next );
			needle();
			bands();
		};
		if ( ! side || ! next || next === side ) {
			side = next;
			show();
			return;
		}
		const sameRecord = side.record === next.record;
		const was = side;
		side = next;
		const over = () => {
			if ( sameRecord ) {
				flip( show );
			} else {
				change();
				show();
			}
		};
		// Played to its end, the side leaves the stylus in its run-out first.
		if ( performance.now() - ended < 1500 && seen() && 'riffDown' in ( $( '.riff-arm' )?.dataset || {} ) ) {
			ended = 0;
			runout.from = was;
			runout( over );
		} else {
			over();
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

	// ---- The run-out. A side played to its end leaves the stylus to the lead-out groove, which
	// carries it in across the dead wax in half a turn to the locked groove, a closed ring it rides
	// until the arm is lifted. The ring's join clicks once a turn, the same click each time, since
	// it is the same groove: 1.8 s apart at 33⅓. Two turns of it, and then the arm goes back and the
	// record is turned over or changed. Only where the record is seen, and only where the music
	// passes through Web Audio (filament.js), as the click is played there; elsewhere the arm still
	// rides the run-out, in silence. The platter turns on at the music's last speed meanwhile, the
	// music over, and is braked once the arm is lifted.
	const LOCKED = 1.06;
	let ended = 0;
	// Noted before media.js loads the next track on the same event: a capturing listener on the
	// element itself is called before the others there.
	for ( const el of [ P.audio, P.video ] ) {
		el.addEventListener( 'ended', () => ( ended = performance.now() ), true );
	}
	function runout( then ) {
		const arm = $( '.riff-arm' );
		const m = P.el();
		const rate = m.playbackRate || 1;
		const once = 60000 / ( ( root.dataset.riffFormat === '7' ? 45 : 100 / 3 ) * rate );
		const id = ++runout.id;
		runout.until = performance.now() + once * 2.5;
		coast( rate, rate );
		sweep?.pause();
		runout.anim = arm.animate(
			[ { rotate: `${ angle( 1 ).toFixed( 2 ) }deg` }, { rotate: `${ angle( LOCKED ).toFixed( 2 ) }deg` } ],
			{ duration: once / 2, easing: 'ease-in', fill: 'forwards' }
		);
		// Woken once the ended event is through: filament.js suspends the context on it, after this.
		const ctx = P.analyser?.context;
		setTimeout( () =>
			ctx?.resume()
				.then( () => {
					if ( id === runout.id ) {
						click( ctx, once / 2 - 50 );
						click( ctx, once * 1.5 - 50 );
					}
				} )
				.catch( () => {} )
		);
		runout.done = setTimeout( () => {
			if ( id !== runout.id ) {
				return;
			}
			runout.until = 0;
			if ( ctx && P.el().paused ) {
				ctx.suspend().catch( () => {} );
			}
			windDown();
			then();
		}, once * 2.5 );
	}
	runout.id = 0;
	runout.until = 0;
	// A side changed some other way while the stylus rides the run-out: it is lifted from there.
	function stopRunout() {
		if ( ! runout.until ) {
			return;
		}
		runout.id++;
		runout.until = 0;
		clearTimeout( runout.done );
		runout.anim?.cancel();
		runout.anim = null;
		// The platter, turning on for the run-out, is braked; music that starts takes it first.
		windDown();
	}
	// The click: the groove's join under the stylus, a tick of a millisecond and a half over a
	// low thump of the cartridge, soft. Drawn once, from a fixed sequence, so every turn is the
	// same click, as every turn is the same groove.
	function click( ctx, after ) {
		if ( ! click.sound || click.sound.sampleRate !== ctx.sampleRate ) {
			const rate = ctx.sampleRate;
			const sound = ctx.createBuffer( 1, Math.round( rate * 0.03 ), rate );
			const data = sound.getChannelData( 0 );
			let seed = 7;
			for ( let n = 0; n < data.length; n++ ) {
				seed = ( seed * 1103515245 + 12345 ) % 2147483648;
				const s = n / rate;
				data[ n ] =
					( ( seed / 1073741824 - 1 ) * Math.exp( -s / 0.0015 ) ) / 2 +
					Math.sin( 2 * Math.PI * 70 * s ) * Math.exp( -s / 0.006 );
			}
			click.sound = sound;
		}
		const source = ctx.createBufferSource();
		const gain = ctx.createGain();
		source.buffer = click.sound;
		gain.gain.value = 0.12;
		source.connect( gain ).connect( ctx.destination );
		source.start( ctx.currentTime + after / 1000 );
	}

	// ---- What a hand moves (the record out of its sleeve and turned over, the sleeve set down,
	// the arm carried), it moves as a hand does: on the minimum-jerk path, x = 10τ³ − 15τ⁴ + 6τ⁵
	// for τ from 0 to 1 (Flash and Hogan, 1985), which reaching movements follow, setting off and
	// arriving with neither speed nor acceleration. As an easing, the whole of it or the part from
	// a to b, drawn with linear() where a browser has it; elsewhere the nearest curve. riff.css has
	// the whole of it as --riff-hand.
	const jerk = ( t ) => t * t * t * ( 10 - 15 * t + 6 * t * t );
	const linear = !! window.CSS?.supports?.( 'animation-timing-function', 'linear(0, 1)' );
	function hand( a = 0, b = 1 ) {
		if ( ! linear && a === 0 && b === 1 ) {
			return 'cubic-bezier(0.5, 0, 0.5, 1)';
		}
		if ( ! linear ) {
			return a === 0 ? 'ease-in' : 'ease-out';
		}
		const points = [];
		for ( let i = 0; i <= 20; i++ ) {
			points.push( ( ( jerk( a + ( ( b - a ) * i ) / 20 ) - jerk( a ) ) / ( jerk( b ) - jerk( a ) ) ).toFixed( 3 ) );
		}
		return `linear(${ points.join( ', ' ) })`;
	}

	// ---- The record set down on the platter: carried there from the sleeve a few millimetres
	// above the mat, and let go, it falls those last millimetres under gravity, h = ½gt², so in
	// t = √(2h/g), 29 ms from 4 mm, and lands with a bounce or two, each keeping a share of the
	// speed it landed with, until it lies still. Seen from above, its height is its size: a thing h
	// nearer the eye than the mat, from D away, looks D / (D − h) as large.
	const FALL = 4;
	const EYE = 500;
	const G = 9.81e-3;
	const KEEP = 0.3;
	// Falling from rest, the distance grows as t²; rising to a stop, as 1 − (1 − t)². Each is a
	// cubic Bézier exactly.
	const FALLING = 'cubic-bezier(0.3333, 0, 0.6667, 0.3333)';
	const RISING = 'cubic-bezier(0.3333, 0.6667, 0.6667, 1)';
	function lay() {
		const record = $( '.riff-record' );
		const carry = record ? parseFloat( getComputedStyle( record ).transitionDuration ) * 1000 : 0;
		if ( ! carry || ! seen() ) {
			return;
		}
		const up = ( h ) => ( { transform: `scale(${ ( EYE / ( EYE - h ) ).toFixed( 5 ) })` } );
		const frames = [
			{ ...up( 0 ), at: 0, easing: hand() },
			{ ...up( FALL ), at: carry, easing: FALLING },
		];
		let t = carry + Math.sqrt( ( 2 * FALL ) / G );
		frames.push( { ...up( 0 ), at: t } );
		for ( let h = FALL * KEEP * KEEP; h > 0.05; h *= KEEP * KEEP ) {
			const rise = Math.sqrt( ( 2 * h ) / G );
			frames[ frames.length - 1 ].easing = RISING;
			frames.push( { ...up( h ), at: t + rise, easing: FALLING } );
			t += 2 * rise;
			frames.push( { ...up( 0 ), at: t } );
		}
		record.animate(
			frames.map( ( { at, ...frame } ) => ( { ...frame, offset: at / t } ) ),
			{ duration: t }
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
			.animate( [ { rotate: 'y 0deg' }, { rotate: 'y 90deg' } ], { duration: 300, delay: 250, easing: hand( 0, 0.5 ) } )
			.finished.then( () => {
				show();
				return record.animate( [ { rotate: 'y -90deg' }, { rotate: 'y 0deg' } ], { duration: 300, easing: hand( 0.5, 1 ) } ).finished;
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
		const ease = hand();
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
		const turning = ( 'riffTurning' in root.dataset || coasting !== null ) && root.dataset.riffDeck === 'out' && ! P.reduce();
		const rpm = root.dataset.riffFormat === '7' ? 45 : 100 / 3;
		const step = turning ? ( ( rpm / 60 ) * 360 * ( coasting ?? ( m.playbackRate || 1 ) ) ) / FLASHES : 0;
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
	// The turntable is a view of its own, opened from its button (registry.js); the album, the
	// cover on its own, is what Now Playing opens to. A site that turned the turntable off
	// (Settings › Media) registers no such view.
	const turntable = () => P.showing === 'turntable' && !! P.views?.has( 'turntable' );
	function roomy() {
		if ( ! turntable() ) {
			return false;
		}
		const cover = $( '.riff-cover' );
		if ( ! np.hidden && cover ) {
			roomy.last = getComputedStyle( cover ).getPropertyValue( '--riff-deck' ).trim() === '1';
		}
		return roomy.last ?? window.innerWidth >= window.innerHeight * 1.2;
	}
	// In the turntable's view the record comes out whether or not it is playing, as setting a record
	// on the platter does. Where the whole screen is the turntable (riff.css: an unfolded phone, a
	// phone on its side), the deck has its own controls too.
	const OPENING = 400;
	const wholeDeck = turntable;
	const shapedAsDeck = () =>
		!! $( '.riff-cover' ) &&
		getComputedStyle( $( '.riff-cover' ) ).getPropertyValue( '--riff-deck-screen' ).trim() === '1';
	const deckScreen = () => turntable() && shapedAsDeck();
	// Whether the stage has room for the sleeve beside the deck, as riff.css's container query
	// answers it, for the stylesheet: without it the turntable's view is the record alone.
	const markRoom = () => root.toggleAttribute( 'data-riff-room', roomy() );
	// Unfolding the phone, or turning it on its side, while the album shows makes the screen the
	// turntable, as opening Now Playing there would; folding it again goes back to the album.
	function reshape() {
		if ( np.hidden || ! P.views?.has( 'turntable' ) ) {
			return;
		}
		if ( shapedAsDeck() && P.showing === 'album' ) {
			unfolded = true;
			setView( 'turntable', { quiet: true } );
		} else if ( ! shapedAsDeck() && unfolded && P.showing === 'turntable' ) {
			unfolded = false;
			setView( 'album', { quiet: true } );
		}
	}
	if ( $( '.riff-stage' ) && 'ResizeObserver' in window ) {
		new ResizeObserver( () => {
			reshape();
			const was = roomy.last;
			if ( np.hidden || roomy() === was ) {
				return;
			}
			markRoom();
			clearTimeout( deck.opening );
			// Onto the deck its speed and pitch hold; off it the music is at its own speed again.
			retune( false );
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
			stopRunout();
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
		lay();
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
	// it: the platter's speed is the music's, the pitch rising with it as a record's does, the
	// platter's turn and the arm's sweep following the same rate. To stop, it winds down, the pitch
	// falling, and then stops. Moving on to the next track, it keeps turning. Where the record is
	// not seen, the music starts and stops at once. The browser's own speed change does the bending
	// (preservesPitch off), on the element's own clock.
	//
	// The platter moves as a direct-drive deck's does. Its motor pulls with a constant torque, so
	// its speed rises at a constant rate, in a straight line: from rest to 33⅓ in 0.7 s. Its brake
	// slows it at a constant rate too, from 33⅓ to rest in 0.9 s. A new speed or pitch while it
	// turns is the same pull, for as long as the change takes. The music is heard from a crawl up,
	// as slow as the player lets it go; below that the platter turns with the music silent
	// (coast()).
	const ARRIVE = 850;
	const DROP = 450;
	const LAND = 250;
	const CRAWL = 0.3;
	// In revolutions a minute, each millisecond.
	const TORQUE = 100 / 3 / 700;
	const BRAKE = 100 / 3 / 900;
	// How long the platter takes from one rate to another, the rates as shares of the record's own
	// speed.
	const pull = ( from, to ) =>
		( Math.abs( to - from ) * ( root.dataset.riffFormat === '7' ? 45 : 100 / 3 ) ) / ( to > from ? TORQUE : BRAKE );
	let ramping = 0;
	let stowing = 0;
	const seen = () =>
		! np.hidden && ! P.away() && ! P.reduce() && P.mode !== 'video' && roomy();
	function bend( m, to ) {
		const from = m.playbackRate || 1;
		const ms = pull( from, to );
		const id = ++ramping;
		P.ramping = true;
		m.preservesPitch = m.webkitPreservesPitch = false;
		return new Promise( ( done ) => {
			const t0 = performance.now();
			const step = ( now ) => {
				if ( id !== ramping ) {
					return done( false );
				}
				const k = ms ? Math.min( 1, ( now - t0 ) / ms ) : 1;
				if ( k < 1 ) {
					m.playbackRate = from + ( to - from ) * k;
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
		// The deck's speed moves the pitch, as a record's does; the listener's own keeps it.
		m.preservesPitch = m.webkitPreservesPitch = deckOnly() === 1;
	}
	// The listener's own speed, from window.riff.speed(): set on both elements, so it holds when
	// the song hands over to its video and for every track after. While the platter is being
	// pulled up to speed or wound down, the music settles at the new speed once it gets there.
	function respeed( rate ) {
		P.speed = rate;
		const m = P.el();
		for ( const other of [ P.audio, P.video ] ) {
			if ( other !== m ) {
				other.playbackRate = other.defaultPlaybackRate = deckRate();
				other.preservesPitch = other.webkitPreservesPitch = deckOnly() === 1;
			}
		}
		if ( ! P.ramping ) {
			settle( m );
		}
	}

	// The platter's speed while it turns with the music silent: coming up to a crawl before the
	// music starts, or on down to rest after it has stopped. Its turn and the strobe follow this
	// rate in place of the music's (platter()); null while they follow the music.
	let coasting = null;
	let coasts = 0;
	function platter( rate ) {
		for ( const turns of $$( '.riff-turns' ) ) {
			for ( const a of turns.getAnimations() ) {
				a.updatePlaybackRate( rate );
			}
		}
		strobe();
	}
	function coast( from, to ) {
		const id = ++coasts;
		const ms = pull( from, to );
		const t0 = performance.now();
		coasting = from;
		root.dataset.riffCoasting = '';
		const step = ( now ) => {
			if ( id !== coasts ) {
				return;
			}
			const k = ms ? Math.min( 1, ( now - t0 ) / ms ) : 1;
			coasting = from + ( to - from ) * k;
			platter( coasting );
			if ( k < 1 ) {
				requestAnimationFrame( step );
			} else if ( ! to ) {
				release();
			}
		};
		requestAnimationFrame( step );
	}
	// The music has the platter again, or the platter has come to rest.
	function release() {
		coasts++;
		coasting = null;
		delete root.dataset.riffCoasting;
		platter( P.el().playbackRate || 1 );
	}
	const windDown = () => coasting !== null && coast( coasting, 0 );

	function cued( on ) {
		root.toggleAttribute( 'data-riff-cued', on );
	}
	function turn( m ) {
		// A followed host's start is made by Listen Together, when it is due.
		if ( P.holds( m, true ) ) {
			return;
		}
		clearTimeout( turn.wait );
		clearTimeout( turn.spin );
		stowing++;
		// The stylus is in the run-out: the record is seen to once it has been lifted from there.
		if ( runout.until > performance.now() && seen() ) {
			cued( true );
			P.paint();
			turn.wait = setTimeout( () => turn( m ), runout.until - performance.now() + 20 );
			return;
		}
		const turning = root.dataset.playing === 'true' && root.dataset.riffDeck === 'out' && ! ( 'riffCued' in root.dataset );
		const flipping = flip.until > performance.now();
		// At the listener's own speed the music keeps its pitch, which a platter coming up to speed
		// would bend, so it starts at once.
		if ( ! seen() || P.speed !== 1 || ( turning && ! P.ramping && ! flipping ) ) {
			cued( false );
			if ( coasting !== null ) {
				release();
			}
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
				windDown();
				return;
			}
			const from = m.paused ? CRAWL : m.playbackRate;
			m.playbackRate = from;
			m.preservesPitch = m.webkitPreservesPitch = false;
			m.play()
				.then( () => bend( m, deckRate() ) )
				.then( ( whole ) => whole && settle( m ) )
				.catch( () => {
					// Unless another start has the platter by now.
					if ( ! held() ) {
						windDown();
					}
					P.paint();
				} );
		};
		if ( m.paused ) {
			// From rest, the platter is pulled up to a crawl by the moment the stylus is in the
			// groove, so the music starts there, at the speed the platter has reached. Still turning
			// as it winds down, it is pulled up from where it is, at once, unless the record is
			// being turned over or changed meanwhile.
			const up = pull( coasting ?? 0, CRAWL );
			if ( coasting !== null && ! flipping && ! ( 'riffArriving' in root.dataset ) ) {
				coast( coasting, CRAWL );
			} else {
				turn.spin = setTimeout( () => coast( coasting ?? 0, CRAWL ), Math.max( 0, wait - up ) );
			}
			wait = Math.max( wait, up );
		}
		if ( wait ) {
			turn.wait = setTimeout( start, wait );
		} else {
			start();
		}
	}
	function halt( m ) {
		// A followed host's stop is made by Listen Together, when it is due.
		if ( P.holds( m, false ) ) {
			return;
		}
		clearTimeout( turn.wait );
		clearTimeout( turn.spin );
		if ( 'riffCued' in root.dataset ) {
			cued( false );
			windDown();
			P.paint();
			return;
		}
		if ( ! seen() || m.paused || P.speed !== 1 ) {
			settle( m );
			m.pause();
			return;
		}
		halt.going = m;
		bend( m, CRAWL ).then( ( whole ) => {
			halt.going = null;
			if ( whole ) {
				m.pause();
				settle( m );
				// The music stops at a crawl, and the platter turns on down to rest.
				coast( CRAWL, 0 );
			}
		} );
		P.paint();
	}
	// Whether play has been pressed and the music is waiting on the needle, or is winding down: the
	// controls show what was asked for.
	const held = () => 'riffCued' in root.dataset;

	// How long the cue lever takes to lower the arm onto the record: its silicone damping lets the
	// arm sink at one even speed, 8 mm a second, from 4 mm up, as a weight sinks through oil once it
	// has reached the speed the oil allows it, which takes it a millisecond. riff.css draws it with
	// the shadow under the arm coming in at that one speed.
	const LOWER = ( 4 / 8 ) * 1000;
	const stopping = () => !! halt.going && P.ramping;

	// ---- Out of the sleeve once the album plays, and not while a new one is arriving; it stays
	// out when paused. The arm follows the music wherever it goes, and the platter its speed: 33⅓
	// at the music's own, faster or slower with it, as a turntable's pitch changes both, one rate
	// set on the animation, which keeps it on the compositor.
	for ( const el of [ P.audio, P.video ] ) {
		el.addEventListener( 'playing', () => {
			if ( el === P.el() ) {
				root.dataset.riffTurning = '';
				release();
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
			if ( coasting === null ) {
				platter( el.playbackRate || 1 );
			}
		} );
		for ( const type of [ 'timeupdate', 'pause', 'playing', 'seeked', 'ratechange' ] ) {
			el.addEventListener( type, () => needle() );
		}
	}

	// ---- The tonearm: its stylus on the groove as far in as the side has played, from the
	// lead-in to the lead-out, so each angle is one moment of the side
	// and the arm creeps inward through every track, as a stylus tracking the groove does. The arm
	// turns on a base just off the record's corner (riff.css): in the record's own width, the base
	// at (1.05, 0.05), the arm pointing down at no turn, the centre at (0.5, 0.5). The turn that
	// puts the stylus at a distance from the centre is found by halving, since the stylus only
	// comes nearer the centre as the arm turns in.
	const BASE = [ 1.05, 0.05 ];
	const REST = -14;
	// The arm's length and its headshell's angle, set up as a deck's are, by Baerwald's alignment:
	// no tracking error where the stylus is 66 and 120.9 mm from the spindle. With the stylus r
	// from the spindle on an arm L long that turns d from it, the arm meets the groove's tangent
	// at the angle whose sine is (r² + L² − d²) / 2rL, and a headshell turned in by β puts the
	// stylus along the groove where that sine is sin β: where r² − 2rL·sin β + L² − d² = 0. The
	// nulls are its two roots, so r₁·r₂ = L² − d² and r₁ + r₂ = 2L·sin β. The base fixes d, so
	// L = √(d² + r₁r₂) and β = asin((r₁ + r₂) / 2L): with a 12-inch record 302 mm across, d is
	// 214.6 mm, L 232.5 mm (17.8 mm of overhang past the spindle) and β 23.7°.
	const MM = 302;
	const NULLS = [ 66, 120.9 ];
	const SPAN = Math.hypot( BASE[ 0 ] - 0.5, BASE[ 1 ] - 0.5 ) * MM;
	const LENGTH = Math.sqrt( SPAN * SPAN + NULLS[ 0 ] * NULLS[ 1 ] );
	const OFFSET = Math.asin( ( NULLS[ 0 ] + NULLS[ 1 ] ) / ( 2 * LENGTH ) );
	const ARM = LENGTH / MM;
	// Drawn to match, in the drawing's units (the record's hundredths, the base at (6, 4)): the
	// stylus on the line from the base, the headshell turned by β round it, and the tube's S
	// bending into the headshell's back along its line. The grip runs on to the stylus.
	function drawArm() {
		const tube = $( '.riff-arm-tube' );
		if ( ! tube ) {
			return;
		}
		const at = [ 6, 4 + 100 * ARM ];
		const along = [ -Math.sin( OFFSET ), Math.cos( OFFSET ) ];
		const back = ( k ) => [ at[ 0 ] - k * along[ 0 ], at[ 1 ] - k * along[ 1 ] ].map( ( n ) => n.toFixed( 2 ) ).join( ' ' );
		const path = `M6 -3V4C6 28 8.6 46 8.2 59C8.05 64 ${ back( 11.5 ) } ${ back( 7.5 ) }`;
		tube.querySelector( '.riff-arm-wand' )?.setAttribute( 'd', path );
		tube.querySelector( '.riff-arm-grip' )?.setAttribute( 'd', `${ path }L${ back( 0 ) }` );
		tube.querySelector( '.riff-headshell' )?.setAttribute(
			'transform',
			`translate(${ back( 0 ) }) rotate(${ ( ( OFFSET * 180 ) / Math.PI ).toFixed( 2 ) })`
		);
	}
	drawArm();
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
	// Where the music jumps, a new track or a seek, the arm is carried there on a hand's path (its
	// tube turns from where the arm was to nothing) rather than leaping.
	let sweep = null;
	let swept = '';
	const shown = ( arm ) => parseFloat( getComputedStyle( arm ).rotate ) || 0;
	function swing( arm, from, to ) {
		if ( Math.abs( from - to ) < 0.2 || P.reduce() ) {
			return;
		}
		arm.querySelector( '.riff-arm-tube' )?.animate(
			[ { rotate: `${ ( from - to ).toFixed( 2 ) }deg` }, { rotate: '0deg' } ],
			{ duration: 600, easing: hand(), composite: 'add' }
		);
	}
	function lift() {
		const arm = $( '.riff-arm' );
		if ( sweep && arm ) {
			const from = shown( arm );
			sweep.cancel();
			swing( arm, from, REST );
		}
		runout.anim?.cancel();
		runout.anim = null;
		sweep = null;
		swept = '';
	}
	function needle() {
		const arm = $( '.riff-arm' );
		const w = where();
		// In the hand, it is where the hand holds it; in the run-out, where the groove takes it.
		if ( ! arm || ! w || 'riffHeld' in arm.dataset || runout.until ) {
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
		P.press( 'toggle' );
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
		P.press( 'seek' );
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
	function deckOnly() {
		if ( ! deckScreen() ) {
			return 1;
		}
		return ( RPM[ chosen ?? own() ] / RPM[ own() ] ) * ( 1 + pitch / 100 );
	}
	// The deck's speed times the listener's own (respeed(), above).
	function deckRate() {
		return deckOnly() * P.speed;
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
	// The motor pulls the platter to the new speed while it turns; stopped, it starts there. A
	// listener's own turn of the speed or the pitch is a press; the deck coming or going as the
	// stage changes shape is not, so opening Now Playing doesn't stop following someone.
	function retune( pressed = true ) {
		if ( pressed ) {
			P.press( 'speed' );
		}
		paintDeck();
		const m = P.el();
		if ( m.paused || held() || P.ramping ) {
			m.defaultPlaybackRate = deckRate();
			return;
		}
		bend( m, deckRate() ).then( ( whole ) => whole && settle( m ) );
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

	// The side's grooves: a glossy ring between each of its tracks, and, where something has measured
	// a track's loudness (its levels, a digit from 0 to 9 for each moment of it), the band lighter
	// where the music is loud, as a cut groove is: a loud passage swings the stylus wider, so its
	// walls catch more of the light. At most 24 shades a track, each at the radius its moment is
	// cut at, so a side's gradient stays a few hundred stops.
	function cut( on ) {
		const record = $( '.riff-record' );
		const album = albums.get( playing );
		const lengths = on && album ? album.lengths.slice( on.from, on.to ) : [];
		const whole = lengths.reduce( ( a, b ) => a + b, 0 );
		if ( ! record || ! whole ) {
			record?.style.removeProperty( '--riff-bands' );
			return;
		}
		const pc = ( share ) => `${ ( 100 * groovedAt( share ) ).toFixed( 2 ) }%`;
		const layers = [];
		if ( lengths.length > 1 ) {
			const stops = [];
			let played = 0;
			for ( const length of lengths.slice( 0, -1 ) ) {
				played += length;
				const at = 100 * groovedAt( played / whole );
				stops.unshift(
					`transparent ${ ( at - 0.35 ).toFixed( 2 ) }%, rgb(255 255 255 / 0.09) ${ ( at - 0.35 ).toFixed( 2 ) }% ${ ( at + 0.35 ).toFixed( 2 ) }%, transparent ${ ( at + 0.35 ).toFixed( 2 ) }%`
				);
			}
			layers.push( `radial-gradient(circle closest-side, ${ stops.join( ', ' ) })` );
		}
		// From the lead-out outwards, as a gradient's stops run: the side's last moment first.
		const shades = [];
		let into = whole;
		for ( let k = lengths.length - 1; k >= 0; k-- ) {
			into -= lengths[ k ];
			const levels = album.levels?.[ on.from + k ] || '';
			if ( ! levels ) {
				shades.push( `transparent ${ pc( ( into + lengths[ k ] ) / whole ) } ${ pc( into / whole ) }` );
				continue;
			}
			const n = Math.min( 24, levels.length );
			for ( let j = n - 1; j >= 0; j-- ) {
				// The loudest of the moments this shade stands for.
				const part = levels.slice( Math.floor( ( j * levels.length ) / n ), Math.floor( ( ( j + 1 ) * levels.length ) / n ) );
				const loud = Math.max( ...[ ...part ].map( Number ) ) / 9;
				shades.push( `rgb(255 255 255 / ${ ( 0.06 * loud ).toFixed( 3 ) }) ${ pc( ( into + ( ( j + 0.5 ) * lengths[ k ] ) / n ) / whole ) }` );
			}
		}
		if ( shades.some( ( shade ) => shade.startsWith( 'rgb' ) ) ) {
			layers.push(
				`radial-gradient(circle closest-side, transparent ${ pc( 1 ) }, ${ shades.join( ', ' ) }, transparent ${ pc( 0 ) })`
			);
		}
		if ( layers.length ) {
			record.style.setProperty( '--riff-bands', layers.join( ', ' ) );
		} else {
			record.style.removeProperty( '--riff-bands' );
		}
	}

	return { open, close, setView, tint, groove, deck, turn, halt, held, stopping, respeed };
}
