/* Riff Chords: fills the Chords view of Now Playing, registered on the server as Riff registers its
 * own (riff_register_view()), with the chord chart kept on the track's file,
 * from the media REST route, and gives the listener what they need to play along: the chord being
 * played, drawn as a guitar or ukulele fingering or on a piano's keys, with the next one; the speed, slower or faster with the
 * pitch kept, through window.riff.speed(); transpose and capo, which change the chords' names and
 * fingerings and not the music; and a loop, from A to B or around one section of the song, through
 * window.riff.seek(). It listens to the player's riff:view, riff:track, riff:time, riff:play and
 * riff:pause events, which Riff dispatches on its own element for any script. The chart is read by
 * chart.js, and the song followed through timing.js, which it shares with Riff Lyrics and Riff
 * Sing, both loaded before it. */
( () => {
	const config = window.riffChords || {};
	const chart = window.riffChordsChart;
	const timing = window.riffTiming; // timing.js, loaded before it.
	const cache = new Map();
	let showing = false;
	let turn = 0; // So a slow answer for an earlier track cannot replace the current one's.
	let song = null; // The chart showing: { id, read, chords: [{ time, piece, el, line }] }.
	let current = -1;
	// A wheel or a finger on the chart is the listener's scrolling, which the following gives way to.
	const scrolled = timing.scrolling( ( target ) => song && target.closest?.( '.riff-chords-chart' ) );
	// The listener's choices for the song showing; a new song starts afresh.
	const practice = { id: 0, steps: 0, capo: 0, capoFor: 0, slowed: false };
	const loop = { a: null, b: null, on: false, last: 0, frame: 0 };
	let duration = 0;

	// The instrument the chords are drawn for, which the listener chooses and this browser keeps.
	const INSTRUMENTS = [ 'guitar', 'ukulele', 'piano' ];
	const KEPT = 'riff-chords:instrument';
	let instrument = 'guitar';
	try {
		instrument = INSTRUMENTS.includes( localStorage.getItem( KEPT ) ) ? localStorage.getItem( KEPT ) : 'guitar';
	} catch {}

	// Until the player starts, window.riff is the #riff element, by its id.
	const player = () => ( typeof window.riff?.seek === 'function' ? window.riff : null );
	const canSlow = () => typeof player()?.speed === 'function';
	const fill = ( text, ...values ) =>
		values.reduce( ( out, v, i ) => out.replace( `%${ i + 1 }$s`, v ), String( text || '' ) ).replace( '%s', values[ 0 ] );
	const el = ( tag, className, text ) => {
		const node = document.createElement( tag );
		if ( className ) {
			node.className = className;
		}
		if ( text !== undefined ) {
			node.textContent = text;
		}
		return node;
	};
	const button = ( className, text, label, run ) => {
		const b = el( 'button', className, text );
		b.type = 'button';
		if ( label ) {
			b.setAttribute( 'aria-label', label );
		}
		b.addEventListener( 'click', run );
		return b;
	};
	const clock = ( s ) => {
		const whole = Math.max( 0, Math.floor( s ) );
		return `${ Math.floor( whole / 60 ) }:${ String( whole % 60 ).padStart( 2, '0' ) }`;
	};

	// The chart for a track that is a Media Library file; an empty string for none.
	function chartFor( track ) {
		const id = Number( track?.id );
		if ( ! Number.isInteger( id ) || id <= 0 ) {
			return Promise.resolve( '' );
		}
		if ( ! cache.has( id ) ) {
			const url = new URL( String( id ), config.media );
			url.searchParams.set( '_fields', 'riff_chords' );
			const asked = fetch( url, {
				credentials: 'same-origin',
				headers: {
					Accept: 'application/json',
					...( config.nonce ? { 'X-WP-Nonce': config.nonce } : {} ),
				},
			} )
				.then( ( r ) => {
					if ( ! r.ok ) {
						throw new Error( String( r.status ) );
					}
					return r.json();
				} )
				.then( ( data ) => String( data?.riff_chords || '' ).trim() );
			asked.catch( () => cache.delete( id ) );
			cache.set( id, asked );
		}
		return cache.get( id );
	}
	// ---- Names and fingerings, moved for transpose and capo. The chart's chords are fingered as
	// written with its own capo ({capo: 2}); a capo moved from there, or the song transposed, moves
	// the fingering by the difference, and the key is spelled for where the song now is. A piano has
	// no capo, so for one the chords are named as they sound.
	const chartCapo = () => Math.max( 0, Math.min( 11, parseInt( song?.read.meta.capo, 10 ) || 0 ) );
	const capoOn = () => ( instrument === 'piano' ? 0 : practice.capo );
	const shift = () => practice.steps - ( capoOn() - chartCapo() );
	const firstChord = () => song?.chords[ 0 ]?.piece.chord || '';
	// The key the chords are in, which on a piano, named as they sound, is the key they are named in.
	const keyNow = () => {
		const key = song?.read.meta.key || firstChord();
		return key ? chart.transpose( key, instrument === 'piano' ? shift() : practice.steps ) : '';
	};
	const shapesKey = () => {
		const key = song?.read.meta.key || firstChord();
		return key ? chart.transpose( key, shift() ) : '';
	};
	const named = ( chord ) => chart.transpose( chord, shift(), shapesKey() );

	// A chord as a diagram for the instrument chosen: its fingering on a guitar or a ukulele, or
	// its keys on a piano. Its name says the same in words.
	const SVG = 'http://www.w3.org/2000/svg';
	function diagram( name ) {
		const fig = el( 'figure', 'riff-chords-shape' );
		const svg = instrument === 'piano' ? keyboard( name ) : fretboard( name );
		fig.append( svg || el( 'figcaption', 'riff-chords-shape-none', fill( config.noShape, name ) ) );
		return fig;
	}
	function drawing( viewBox, label ) {
		const svg = document.createElementNS( SVG, 'svg' );
		svg.setAttribute( 'viewBox', viewBox );
		svg.setAttribute( 'role', 'img' );
		svg.setAttribute( 'aria-label', label );
		const draw = ( tag, attrs, text ) => {
			const node = document.createElementNS( SVG, tag );
			for ( const [ k, v ] of Object.entries( attrs ) ) {
				node.setAttribute( k, String( v ) );
			}
			if ( text !== undefined ) {
				node.textContent = text;
			}
			svg.append( node );
		};
		return { svg, draw };
	}

	// A fingering: a line for each of the instrument's strings, four frets, a dot where each finger
	// goes, and above the nut an o for an open string and an x for one not played. Its name gives
	// the frets from a guitar's low string, or from a ukulele's G string.
	function fretboard( name ) {
		const uke = instrument === 'ukulele';
		const frets = uke ? chart.ukulele( name ) : chart.shape( name );
		if ( ! frets ) {
			return null;
		}
		const wide = ( frets.length - 1 ) * 10;
		const fretted = frets.filter( ( f ) => f );
		const base = fretted.length && Math.max( ...fretted ) > 4 ? Math.min( ...fretted ) : 1;
		const { svg, draw } = drawing(
			`-14 0 ${ wide + 24 } 66`,
			fill(
				uke ? config.ukeFrets : config.fingering,
				name,
				frets.map( ( f ) => ( f === null ? config.muted : f === 0 ? config.open : String( f ) ) ).join( ', ' )
			)
		);
		const x = ( string ) => 5 + string * 10;
		frets.forEach( ( _, s ) => draw( 'line', { x1: x( s ), y1: 14, x2: x( s ), y2: 62, class: 'riff-chords-string' } ) );
		for ( let f = 0; f <= 4; f++ ) {
			draw( 'line', { x1: 5, y1: 14 + f * 12, x2: 5 + wide, y2: 14 + f * 12, class: f === 0 && base === 1 ? 'riff-chords-nut' : 'riff-chords-fret' } );
		}
		if ( base > 1 ) {
			draw( 'text', { x: -2, y: 24, 'text-anchor': 'end', class: 'riff-chords-base' }, String( base ) );
		}
		frets.forEach( ( f, s ) => {
			if ( f === null ) {
				draw( 'text', { x: x( s ), y: 10, 'text-anchor': 'middle', class: 'riff-chords-mark' }, '×' );
			} else if ( f === 0 ) {
				draw( 'circle', { cx: x( s ), cy: 7, r: 2.8, class: 'riff-chords-open' } );
			} else {
				draw( 'circle', { cx: x( s ), cy: 14 + ( f - base + 0.5 ) * 12, r: 3.8, class: 'riff-chords-dot' } );
			}
		} );
		return svg;
	}

	// The keys: two octaves from C, with the chord's notes, stacked up from its root, filled in. Its
	// name gives the notes.
	const WHITE = [ 0, 2, 4, 5, 7, 9, 11 ];
	function keyboard( name ) {
		const down = chart.keys( name );
		if ( ! down ) {
			return null;
		}
		const { svg, draw } = drawing( '0 0 99 46', fill( config.pianoKeys, name, down.map( ( k ) => k.note ).join( ', ' ) ) );
		svg.classList.add( 'riff-chords-keys' );
		const pressed = new Set( down.map( ( k ) => k.key ) );
		const white = [];
		const black = [];
		for ( let k = 0; k < 24; k++ ) {
			const octave = Math.floor( k / 12 ) * 7;
			const at = WHITE.indexOf( k % 12 );
			const key = { k, white: at >= 0 };
			// A black key sits across the line after the white key below it.
			key.x = key.white ? 0.5 + ( octave + at ) * 7 : 0.5 + ( octave + WHITE.indexOf( ( k % 12 ) - 1 ) + 1 ) * 7 - 2.25;
			( key.white ? white : black ).push( key );
		}
		// The white keys first, so the black ones sit over them; a dot on each key the chord plays,
		// as a fingering has one where each finger goes.
		for ( const key of [ ...white, ...black ] ) {
			const width = key.white ? 7 : 4.5;
			const height = key.white ? 45 : 28;
			draw( 'rect', { x: key.x, y: 0.5, width, height, rx: 1, class: `riff-chords-piano-key${ key.white ? '' : ' is-black' }` } );
			if ( pressed.has( key.k ) ) {
				draw( 'circle', { cx: key.x + width / 2, cy: height - 5, r: 2.2, class: `riff-chords-dot${ key.white ? '' : ' is-black' }` } );
			}
		}
		return svg;
	}

	// ---- The panel's parts.
	const ICON =
		'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>';

	// The panel with no chart in it: its message in the middle, and for someone who can edit the
	// Media Library, the way to the track's Chords field.
	function say( where, text, id = 0 ) {
		const box = el( 'div', 'riff-chords-empty' );
		box.innerHTML = ICON;
		box.append( el( 'p', 'riff-chords-note', text ) );
		if ( id > 0 && config.edit ) {
			const add = el( 'a', 'riff-chords-add', config.add || '' );
			add.href = config.edit + id;
			box.append( add );
		}
		where.replaceChildren( box );
	}

	// A control that steps a value down and up, with the value between: Speed, Transpose, Capo.
	function stepper( name, label, down, up, read ) {
		const group = el( 'div', 'riff-chords-stepper' );
		group.setAttribute( 'role', 'group' );
		group.setAttribute( 'aria-label', label );
		group.dataset.riffChords = name;
		const out = el( 'output', 'riff-chords-value' );
		out.setAttribute( 'aria-live', 'polite' );
		group.append(
			el( 'span', 'riff-chords-label', label ),
			button( 'riff-chords-step', '−', down.label, () => ( down.run(), paintTools() ) ),
			out,
			button( 'riff-chords-step', '+', up.label, () => ( up.run(), paintTools() ) )
		);
		group.paint = () => {
			out.textContent = read();
		};
		return group;
	}

	let tools = null;
	function practiceTools() {
		const box = el( 'div', 'riff-chords-tools' );
		box.setAttribute( 'role', 'group' );
		box.setAttribute( 'aria-label', config.practice || '' );
		const steppers = [];
		if ( canSlow() ) {
			const set = ( by ) => {
				const now = Math.round( player().speed() * 100 );
				const to = Math.min( 150, Math.max( 50, Math.round( ( now + by ) / 5 ) * 5 ) );
				player().speed( to / 100 );
				practice.slowed = to !== 100;
			};
			steppers.push(
				stepper( 'speed', config.speed, { label: config.slower, run: () => set( -5 ) }, { label: config.faster, run: () => set( 5 ) }, () => `${ Math.round( player().speed() * 100 ) }%` )
			);
		}
		steppers.push(
			stepper(
				'transpose',
				config.transpose,
				{ label: config.down, run: () => ( practice.steps = Math.max( -11, practice.steps - 1 ) ) },
				{ label: config.up, run: () => ( practice.steps = Math.min( 11, practice.steps + 1 ) ) },
				() => ( practice.steps > 0 ? `+${ practice.steps }` : String( practice.steps ) )
			),
			stepper(
				'capo',
				config.capo,
				{ label: config.capoDown, run: () => ( practice.capo = Math.max( 0, practice.capo - 1 ) ) },
				{ label: config.capoUp, run: () => ( practice.capo = Math.min( 11, practice.capo + 1 ) ) },
				() => String( practice.capo )
			)
		);
		box.append( ...steppers );
		const capo = steppers.at( -1 );
		// The instrument the chords are drawn for, one of three, kept for the next visit.
		const picker = el( 'div', 'riff-chords-instrument' );
		picker.setAttribute( 'role', 'group' );
		picker.setAttribute( 'aria-label', config.instrument || '' );
		picker.append( el( 'span', 'riff-chords-label', config.instrument ) );
		const picks = INSTRUMENTS.map( ( id ) => {
			const pick = button( 'riff-chords-pick', config.instruments?.[ id ] || id, '', () => {
				instrument = id;
				try {
					localStorage.setItem( KEPT, id );
				} catch {}
				paintTools();
			} );
			pick.dataset.riffChordsInstrument = id;
			return pick;
		} );
		picker.append( ...picks );
		box.prepend( picker );
		// The loop: A where it starts, B where it ends, and Loop to turn it on and off.
		const looper = el( 'div', 'riff-chords-loop' );
		looper.setAttribute( 'role', 'group' );
		looper.setAttribute( 'aria-label', config.loop || '' );
		const a = button( 'riff-chords-ab', 'A', config.loopFrom, () => {
			loop.a = player()?.time() ?? 0;
			if ( loop.b !== null && loop.b <= loop.a + 0.5 ) {
				loop.b = null;
				loop.on = false;
			}
			paintTools();
		} );
		const b = button( 'riff-chords-ab', 'B', config.loopTo, () => {
			const at = player()?.time() ?? 0;
			if ( loop.a !== null && at > loop.a + 0.5 ) {
				loop.b = at;
				loop.on = true;
				loop.last = at;
				watch();
			}
			paintTools();
		} );
		const toggle = button( 'riff-chords-loop-toggle', config.loop, '', () => {
			loop.on = ! loop.on && loop.a !== null && loop.b !== null;
			loop.last = player()?.time() ?? 0;
			watch();
			paintTools();
		} );
		looper.append( a, b, toggle );
		box.append( looper );
		box.paint = () => {
			steppers.forEach( ( s ) => s.paint() );
			// A piano has no capo.
			capo.hidden = instrument === 'piano';
			picks.forEach( ( p ) => p.setAttribute( 'aria-pressed', String( p.dataset.riffChordsInstrument === instrument ) ) );
			a.textContent = loop.a === null ? 'A' : `A ${ clock( loop.a ) }`;
			b.textContent = loop.b === null ? 'B' : `B ${ clock( loop.b ) }`;
			b.disabled = loop.a === null;
			toggle.disabled = loop.a === null || loop.b === null;
			toggle.setAttribute( 'aria-pressed', String( loop.on ) );
		};
		return box;
	}

	// Everything that shows the listener's choices, drawn again after one changes.
	function paintTools() {
		tools?.paint();
		if ( ! song ) {
			return;
		}
		for ( const c of song.all ) {
			c.el.textContent = named( c.piece.chord );
		}
		const key = song.root.querySelector( '.riff-chords-key' );
		if ( key ) {
			key.textContent = keyNow() && song.read.meta.key ? fill( config.key, keyNow() ) : '';
		}
		paintNow( true );
	}

	// The chord being played and the one after it, or, for a chart without times, every chord in it.
	function paintNow( again = false ) {
		const now = song?.root.querySelector( '.riff-chords-now' );
		if ( ! now ) {
			return;
		}
		if ( ! song.read.timed ) {
			if ( again || ! now.childElementCount ) {
				const seen = [ ...new Set( song.all.map( ( c ) => named( c.piece.chord ) ) ) ];
				now.replaceChildren(
					...seen.map( ( name ) => {
						const fig = diagram( name );
						fig.prepend( el( 'p', 'riff-chords-name', name ) );
						return fig;
					} )
				);
			}
			return;
		}
		const at = Math.max( 0, current );
		const chord = song.chords[ at ];
		const next = song.chords[ at + 1 ];
		const name = named( chord.piece.chord );
		const fig = diagram( name );
		const words = el( 'div', 'riff-chords-now-words' );
		words.append( el( 'p', 'riff-chords-name', name ) );
		if ( next ) {
			words.append( el( 'p', 'riff-chords-next', fill( config.next, named( next.piece.chord ) ) ) );
		}
		now.classList.toggle( 'is-waiting', current < 0 );
		now.replaceChildren( fig, words );
	}

	function show( where, id, text ) {
		const read = chart.parse( text );
		// The chart's own capo is where its fingerings are written for; the listener moves it from there.
		if ( practice.capoFor !== id ) {
			practice.capoFor = id;
			practice.capo = Math.max( 0, Math.min( 11, parseInt( read.meta.capo, 10 ) || 0 ) );
		}
		const root = el( 'div', 'riff-chords' );
		const head = el( 'div', 'riff-chords-head' );
		head.append( el( 'div', 'riff-chords-now' ) );
		const meta = el( 'p', 'riff-chords-meta' );
		meta.append( el( 'span', 'riff-chords-key' ) );
		if ( read.meta.tempo ) {
			meta.append( el( 'span', 'riff-chords-tempo', fill( config.tempo, read.meta.tempo ) ) );
		}
		meta.hidden = ! read.meta.key && ! read.meta.tempo;
		head.append( meta );
		tools = practiceTools();
		head.append( tools );
		root.append( head );

		const list = el( 'ol', 'riff-chords-chart' );
		const all = [];
		read.sections.forEach( ( section, n ) => {
			const li = el( 'li', 'riff-chords-section' );
			const name = section.label || config.sections?.[ section.kind ] || '';
			if ( name ) {
				const heading = el( 'p', 'riff-chords-heading' );
				if ( section.time !== null ) {
					heading.append( button( 'riff-chords-jump', name, '', () => player()?.seek( section.time ) ) );
					const end = read.sections.slice( n + 1 ).find( ( s ) => s.time !== null && s.time > section.time )?.time ?? null;
					heading.append(
						button( 'riff-chords-loop-section', config.loop, fill( config.loopSection, name ), () => {
							const last = end ?? ( duration ? duration - 0.3 : null );
							if ( last === null || last <= section.time ) {
								return;
							}
							Object.assign( loop, { a: section.time, b: last, on: true, last: section.time } );
							player()?.seek( section.time );
							watch();
							paintTools();
						} )
					);
				} else {
					heading.textContent = name;
				}
				li.append( heading );
			}
			const lines = el( 'ol', 'riff-chords-lines' );
			for ( const line of section.lines ) {
				const row = el( 'li', `riff-chords-line is-${ line.kind }` );
				if ( line.gapAfter ) {
					row.classList.add( 'riff-chords-gap' );
				}
				if ( line.kind !== 'lyrics' ) {
					row.textContent = line.text;
					lines.append( row );
					continue;
				}
				const start = line.time ?? line.pieces.find( ( p ) => p.time !== null )?.time ?? null;
				const holder = start === null ? row : el( 'button', 'riff-chords-seek' );
				if ( start !== null ) {
					holder.type = 'button';
					holder.addEventListener( 'click', () => player()?.seek( start ) );
					row.append( holder );
				}
				for ( const piece of line.pieces ) {
					const span = el( 'span', 'riff-chords-piece' );
					if ( piece.chord !== null ) {
						const c = el( 'span', 'riff-chords-chord' );
						span.append( c );
						all.push( { piece, el: c, row } );
					}
					span.append( el( 'span', 'riff-chords-words', piece.text || ( piece.chord !== null ? ' ' : '' ) ) );
					holder.append( span );
				}
				lines.append( row );
			}
			li.append( lines );
			list.append( li );
		} );
		root.append( list );
		where.replaceChildren( root );
		const byPiece = new Map( all.map( ( c ) => [ c.piece, c ] ) );
		song = {
			id,
			read,
			root,
			all,
			chords: read.chords.map( ( c ) => ( { ...byPiece.get( c.piece ), time: c.piece.time } ) ),
		};
		current = -1;
		paintTools();
		follow( timing.now() );
	}

	// Marks the chord being played, and keeps its line in the middle of the chart, unless the
	// listener has just scrolled the chart themselves.
	function follow( time ) {
		if ( ! song?.read.timed ) {
			return;
		}
		const i = timing.at( song.chords, time );
		if ( i === current ) {
			return;
		}
		const was = song.chords[ current ];
		was?.el.classList.remove( 'is-current' );
		was?.row.removeAttribute( 'aria-current' );
		current = i;
		const now = song.chords[ i ];
		now?.el.classList.add( 'is-current' );
		now?.row.setAttribute( 'aria-current', 'true' );
		paintNow();
		if ( now && showing && ! scrolled() && now.row !== was?.row ) {
			timing.centre( now.row, now.row.closest( '.riff-chords-chart' ) );
		}
	}

	// ---- The loop: when the music crosses B it goes back to A. Watched every frame while it plays,
	// so it turns where it should, and on riff:time too, which keeps time while the page is hidden.
	// A seek past B by the listener is theirs; the loop waits for the music to come round to it.
	function check( time ) {
		if ( ! loop.on || loop.a === null || loop.b === null ) {
			return;
		}
		if ( loop.last < loop.b && time >= loop.b ) {
			player()?.seek( loop.a );
			loop.last = loop.a;
			return;
		}
		loop.last = time;
	}
	function watch() {
		cancelAnimationFrame( loop.frame );
		if ( ! loop.on || ! player()?.playing() ) {
			return;
		}
		const tick = () => {
			check( player()?.time() ?? 0 );
			if ( loop.on ) {
				loop.frame = requestAnimationFrame( tick );
			}
		};
		loop.frame = requestAnimationFrame( tick );
	}

	// A new song starts afresh: no loop, no transpose, the chart's own capo, and the music's own
	// speed if it was this view that changed it.
	function startAfresh( id ) {
		if ( id === practice.id ) {
			return;
		}
		practice.id = id;
		practice.steps = 0;
		practice.capo = 0;
		practice.capoFor = 0;
		if ( practice.slowed && canSlow() ) {
			player().speed( 1 );
		}
		practice.slowed = false;
		Object.assign( loop, { a: null, b: null, on: false, last: 0 } );
		cancelAnimationFrame( loop.frame );
	}

	async function load( where, track ) {
		if ( ! where ) {
			return;
		}
		const mine = ++turn;
		song = null;
		tools = null;
		current = -1;
		if ( ! track ) {
			say( where, config.idle || '' );
			return;
		}
		try {
			const text = await chartFor( track );
			if ( mine !== turn ) {
				return;
			}
			if ( text ) {
				startAfresh( Number( track.id ) );
				show( where, Number( track.id ), text );
			} else {
				say( where, config.none || '', Number( track.id ) );
			}
		} catch {
			if ( mine === turn ) {
				say( where, config.error || '' );
			}
		}
	}

	if ( ! chart ) {
		return;
	}
	// The view, filled as it opens and again as the track changes while it is open.
	document.addEventListener( 'riff:view', ( e ) => {
		if ( e.detail?.id !== 'chords' ) {
			return;
		}
		showing = !! e.detail.open;
		if ( showing ) {
			load( e.detail.view, e.detail.track );
		}
	} );
	document.addEventListener( 'riff:track', ( e ) => {
		startAfresh( Number( e.detail?.track?.id ) || 0 );
		duration = 0;
	} );
	timing.listen( ( time, detail ) => {
		duration = Number( detail.duration ) || duration;
		check( time );
		follow( time );
	} );
	document.addEventListener( 'riff:play', watch );
	document.addEventListener( 'riff:pause', () => cancelAnimationFrame( loop.frame ) );
} )();
