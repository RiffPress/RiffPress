/* The record: the album pressed into sides (press.js), the side the track is on, its grooves and
 * its label, and the record set down on the platter, turned over and changed for another. */
import { route, time } from 'riff-player/helpers';
import { press } from 'riff-player/turntable/press';
import { groovedAt } from 'riff-player/turntable/geometry';
import { hand } from 'riff-player/turntable/hand';
import { ARRIVE } from 'riff-player/turntable/motor';

export function vinyl( P, T ) {
	const { root, np, $ } = P;

	// ---- The record's grooves: between the lead-out and the lead-in at 97% of its radius, a band
	// for each of the side's tracks, wider as the track is longer, since a record's grooves keep one
	// pitch and one speed, so its playing time runs evenly across the radius. A glossy ring parts
	// each band from the next, as on a pressed record. Drawn once a side, as a background; the
	// label says the side and the speed.
	const leadOut = () => ( root.dataset.riffFormat === '7' ? 0.56 : 0.4 );
	let side = null;
	function groove( t ) {
		const album = t?.post?.id || null;
		if ( album !== T.playing ) {
			T.stopRunout();
			if ( T.playing !== null ) {
				change();
			}
			T.playing = album;
			side = null;
			// A new record plays at its own speed; the pitch stays where the hand left it.
			T.chosen = null;
		}
		place( t );
		if ( T.albums.has( album ) || ! album || ! P.data.library || navigator.connection?.saveData ) {
			return;
		}
		T.albums.set( album, null );
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
					T.albums.delete( album );
					return;
				}
				T.albums.set( album, {
					ids: tracks.map( ( q ) => String( q.id ) ),
					titles: tracks.map( ( q ) => q.title || '' ),
					lengths,
					starts,
					length,
					levels: tracks.map( ( q ) => ( typeof q.levels === 'string' ? q.levels : '' ) ),
					...press( lengths, tracks.map( ( q ) => Number( q.disc ) || 0 ) ),
				} );
				if ( T.playing === album ) {
					place( P.track() );
				}
			} )
			.catch( () => T.albums.delete( album ) );
	}

	// The side the track is on, and the record it is on: a new side of the same record turns the
	// record over, another record of the set comes out of the sleeve in its place.
	function sideOf( t ) {
		const album = T.albums.get( T.playing );
		const at = album && t ? album.ids.indexOf( String( t.id ) ) : -1;
		return at < 0 ? null : album.sides.find( ( s ) => at >= s.from && at < s.to ) || null;
	}
	function place( t ) {
		const album = T.albums.get( T.playing );
		const next = sideOf( t );
		// Moved on while the stylus rides the run-out: the side still up is the one it was in.
		if ( T.runout.until ) {
			side = T.runout.from;
			T.stopRunout();
		}
		const show = () => {
			root.dataset.riffFormat = album?.format || '12';
			T.strobe();
			cut( next );
			label( next );
			T.needle();
			T.bands();
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
		if ( performance.now() - T.ended < 1500 && T.seen() && 'riffDown' in ( $( '.riff-arm' )?.dataset || {} ) ) {
			T.ended = 0;
			T.runout.from = was;
			T.runout( over );
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
			etch.textContent = on ? `RIFF-${ T.playing }-${ on.name }1` : '';
		}
		const list = $( '.riff-label-tracks' );
		const album = T.albums.get( T.playing );
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
		if ( ! carry || ! T.seen() ) {
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
		if ( ! T.seen() || ! record ) {
			show();
			return;
		}
		delete arm?.dataset.riffDown;
		T.lift();
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
					T.needle();
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
		if ( np.hidden || P.reduce() || P.isVideo() || ! stage || ! T.roomy() ) {
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
		T.deck( false );
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
				T.deck( true );
			}
		}, ARRIVE );
	}

	// The side's grooves: a glossy ring between each of its tracks, and, where something has measured
	// a track's loudness (its levels, a digit from 0 to 9 for each moment of it), the band lighter
	// where the music is loud, as a cut groove is: a loud passage swings the stylus wider, so its
	// walls catch more of the light. At most 24 shades a track, each at the radius its moment is
	// cut at, so a side's gradient stays a few hundred stops.
	function cut( on ) {
		const record = $( '.riff-record' );
		const album = T.albums.get( T.playing );
		const lengths = on && album ? album.lengths.slice( on.from, on.to ) : [];
		const whole = lengths.reduce( ( a, b ) => a + b, 0 );
		if ( ! record || ! whole ) {
			record?.style.removeProperty( '--riff-bands' );
			return;
		}
		const pc = ( share ) => `${ ( 100 * groovedAt( share, leadOut() ) ).toFixed( 2 ) }%`;
		const layers = [];
		if ( lengths.length > 1 ) {
			const stops = [];
			let played = 0;
			for ( const length of lengths.slice( 0, -1 ) ) {
				played += length;
				const at = 100 * groovedAt( played / whole, leadOut() );
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

	return { leadOut, groove, sideOf, lay, flip, change };
}
