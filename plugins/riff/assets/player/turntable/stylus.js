/* The tonearm and its stylus: in the groove the music is at (geometry.js), carried there on a
 * hand's path, riding the run-out at a side's end, and picked up and put down by the listener. */
import { angle, playedOf, BASE, REST, ARM, OFFSET } from 'riff-player/turntable/geometry';
import { hand } from 'riff-player/turntable/hand';

export function stylus( P, T ) {
	const { root, $ } = P;

	// ---- The run-out. A side played to its end leaves the stylus to the lead-out groove, which
	// carries it in across the dead wax in half a turn to the locked groove, a closed ring it rides
	// until the arm is lifted. The ring's join clicks once a turn, the same click each time, since
	// it is the same groove: 1.8 s apart at 33⅓. Two turns of it, and then the arm goes back and the
	// record is turned over or changed. Only where the record is seen, and only where the music
	// passes through Web Audio (filament.js), as the click is played there; elsewhere the arm still
	// rides the run-out, in silence. The platter turns on at the music's last speed meanwhile, the
	// music over, and is braked once the arm is lifted.
	const LOCKED = 1.06;
	// Noted before media.js loads the next track on the same event: a capturing listener on the
	// element itself is called before the others there.
	for ( const el of [ P.audio, P.video ] ) {
		el.addEventListener( 'ended', () => ( T.ended = performance.now() ), true );
	}
	function runout( then ) {
		const arm = $( '.riff-arm' );
		const m = P.el();
		const rate = m.playbackRate || 1;
		const once = 60000 / ( ( root.dataset.riffFormat === '7' ? 45 : 100 / 3 ) * rate );
		const id = ++runout.id;
		runout.until = performance.now() + once * 2.5;
		T.coast( rate, rate );
		T.sweep?.pause();
		runout.anim = arm.animate(
			[ { rotate: `${ angle( 1, T.leadOut() ).toFixed( 2 ) }deg` }, { rotate: `${ angle( LOCKED, T.leadOut() ).toFixed( 2 ) }deg` } ],
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
			T.windDown();
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
		T.windDown();
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

	// ---- The tonearm, set up by Baerwald's alignment (geometry.js). Drawn to match, in the
	// drawing's units (the record's hundredths, the base at (6, 4)): the stylus on the line from the
	// base, the headshell turned by β round it, and the tube's S bending into the headshell's back
	// along its line. The grip runs on to the stylus.
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

	// Seconds into the side playing, and its length; null until the album's tracks are known. Until
	// the element holds the new track's file, the track has not begun.
	function where() {
		const album = T.albums.get( T.playing );
		const t = P.track();
		const on = T.sideOf( t );
		if ( ! on ) {
			return null;
		}
		const m = P.el();
		const file = m.getAttribute( 'src' );
		const into = file && ( file === t.src || file === t.video?.src ) ? m.currentTime || 0 : 0;
		const at = album.ids.indexOf( String( t.id ) );
		return { now: Math.min( on.length, album.starts[ at ] - on.start + into ), length: on.length, key: `${ T.playing }:${ on.name }`, m };
	}

	// The sweep: one animation of the arm's turn across the whole album, its keyframes the angle at
	// each point of it, its clock held to the music's. It runs on the compositor, so the arm moves
	// every frame without a line of script, and pauses, seeks and changes speed with the music.
	// Where the music jumps, a new track or a seek, the arm is carried there on a hand's path (its
	// tube turns from where the arm was to nothing) rather than leaping.
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
		delete arm?.dataset.riffUp;
		if ( T.sweep && arm ) {
			const from = shown( arm );
			T.sweep.cancel();
			swing( arm, from, REST );
		}
		runout.anim?.cancel();
		runout.anim = null;
		T.sweep = null;
		swept = '';
	}
	function needle( at = false ) {
		const arm = $( '.riff-arm' );
		const w = where();
		// In the hand, it is where the hand holds it; in the run-out, where the groove takes it.
		if ( ! arm || ! w || 'riffHeld' in arm.dataset || runout.until ) {
			return;
		}
		if ( P.reduce() || ! ( 'riffDown' in arm.dataset ) ) {
			arm.style.setProperty( '--riff-arm', `${ angle( w.now / w.length, T.leadOut() ).toFixed( 2 ) }deg` );
			return;
		}
		const { key } = w;
		const ms = w.now * 1000;
		if ( ! T.sweep || swept !== key ) {
			const from = shown( arm );
			T.sweep?.cancel();
			const frames = [];
			for ( let i = 0; i <= 96; i++ ) {
				frames.push( { rotate: `${ angle( i / 96, T.leadOut() ).toFixed( 3 ) }deg` } );
			}
			T.sweep = arm.animate( frames, { duration: w.length * 1000, fill: 'both' } );
			swept = key;
			T.sweep.currentTime = ms;
			if ( ! at ) {
				swing( arm, from, angle( w.now / w.length, T.leadOut() ) );
			}
		} else if ( Math.abs( T.sweep.currentTime - ms ) > 300 ) {
			const from = shown( arm );
			T.sweep.currentTime = ms;
			swing( arm, from, angle( w.now / w.length, T.leadOut() ) );
		}
		if ( T.sweep.playbackRate !== ( w.m.playbackRate || 1 ) ) {
			T.sweep.updatePlaybackRate( w.m.playbackRate || 1 );
		}
		if ( w.m.paused ) {
			T.sweep.pause();
		} else if ( T.sweep.playState !== 'running' ) {
			T.sweep.play();
		}
	}

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
	// In the hand: turned by as much as the hand has turned round the base since it took the arm,
	// from its rest to the end of the side.
	let grip = null;
	function take( x, y ) {
		grip = { deg: shown( tonearm ), at: around( x, y ) };
	}
	function hold( x, y ) {
		T.sweep?.cancel();
		T.sweep = null;
		swept = '';
		tonearm.dataset.riffHeld = '';
		delete tonearm.dataset.riffDown;
		grip.now = Math.min( angle( 1, T.leadOut() ), Math.max( REST, grip.deg + around( x, y ) - grip.at ) );
		tonearm.style.setProperty( '--riff-arm', `${ grip.now.toFixed( 2 ) }deg` );
	}
	// The band a moment of the side is in, and how far into it.
	function bandAt( played ) {
		const album = T.albums.get( T.playing );
		const on = T.sideOf( P.track() );
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
		const album = T.albums.get( T.playing );
		const id = String( album.ids[ k ] );
		const m = P.el();
		if ( id === String( P.track().id ) ) {
			m.currentTime = into;
		} else {
			const i = P.order.findIndex( ( q ) => String( P.queue[ q ].id ) === id );
			if ( i >= 0 ) {
				const play = ! m.paused || T.held();
				P.stopAll();
				P.pos = i;
				P.load( { play, at: into } );
			}
		}
		needle();
	}
	// The slider's value: the band playing, by its number on the side.
	function bands() {
		const album = T.albums.get( T.playing );
		const on = T.sideOf( P.track() );
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
			const { k, into } = bandAt( playedOf( grip.now, T.leadOut() ) );
			grip = null;
			land( k, into );
		};
		tonearm.addEventListener( 'pointerdown', ( e ) => {
			if ( ! T.sideOf( P.track() ) || carried ) {
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
			const on = T.sideOf( P.track() );
			if ( ! on ) {
				return;
			}
			const k = T.albums.get( T.playing ).ids.indexOf( String( P.track().id ) );
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

	return { runout, stopRunout, lift, needle, bands };
}
