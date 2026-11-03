/* Riff Chords: reads a chord chart and names and fingers its chords. Nothing here touches the page
 * or the player; chords.js draws what this reads. It is a script of its own so the reading can be
 * tested without a browser (.github/scripts/riff-chords.test.js).
 *
 * The chart is ChordPro, the format chord sheets are written in: chords in square brackets before
 * the syllable they fall on, and directives in braces for the title, key, capo, tempo, comments and
 * the song's sections ({start_of_verse}, {start_of_chorus: Chorus 2} and the rest). Riff Chords
 * adds time to it the way LRC times a lyric line: a line may start with [mm:ss.xx], when it starts,
 * and a chord may have a time of its own just before it, [mm:ss.xx][G]. A line's first chord
 * without a time of its own is played when the line starts; the others without one are spread
 * evenly between the chords around them whose times are known. */
( () => {
	const timing = window.riffTiming; // timing.js, loaded before it.
	// Pitch classes, by name; flats and sharps both read.
	const PITCH = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
	const SHARPS = [ 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B' ];
	const FLATS = [ 'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B' ];
	// The keys written with flats, major and minor, by pitch class: F, B♭, E♭, A♭, D♭ and their
	// relative minors (D, G, C, F, B♭ minor).
	const FLAT_MAJOR = new Set( [ 5, 10, 3, 8, 1 ] );
	const FLAT_MINOR = new Set( [ 2, 7, 0, 5, 10 ] );

	const CHORD = /^([A-G])([#b]?)([^/\s]*)(?:\/([A-G])([#b]?))?$/;

	const pc = ( letter, accidental ) =>
		( PITCH[ letter ] + ( accidental === '#' ? 1 : 0 ) - ( accidental === 'b' ? 1 : 0 ) + 12 ) % 12;

	/**
	 * A chord's parts, or null for anything in brackets that is not a chord (N.C., a riff's name).
	 *
	 * @param {string} name As written, such as Am7 or D/F#.
	 * @return {{root: number, suffix: string, bass: number|null, flat: boolean}|null} Its parts.
	 */
	function read( name ) {
		const m = String( name ).trim().match( CHORD );
		if ( ! m ) {
			return null;
		}
		return {
			root: pc( m[ 1 ], m[ 2 ] ),
			suffix: m[ 3 ],
			bass: m[ 4 ] ? pc( m[ 4 ], m[ 5 ] ) : null,
			flat: m[ 2 ] === 'b' || m[ 5 ] === 'b',
		};
	}

	// What a suffix is, for its fingering: the chords a first diagram shows. Anything else is named
	// but not drawn.
	const QUALITY = {
		'': '',
		M: '',
		maj: '',
		m: 'm',
		min: 'm',
		'-': 'm',
		7: '7',
		dom7: '7',
		m7: 'm7',
		min7: 'm7',
		'-7': 'm7',
		maj7: 'maj7',
		M7: 'maj7',
		Δ: 'maj7',
		Δ7: 'maj7',
		sus2: 'sus2',
		sus4: 'sus4',
		sus: 'sus4',
	};

	/**
	 * Whether a key is written with flats.
	 *
	 * @param {string} key A key, such as G, Bb or F#m.
	 * @return {boolean} True for flats.
	 */
	function flatKey( key ) {
		const k = read( key );
		if ( ! k ) {
			return false;
		}
		return QUALITY[ k.suffix ] === 'm' ? FLAT_MINOR.has( k.root ) : FLAT_MAJOR.has( k.root );
	}

	/**
	 * A chord moved by some semitones, spelled for a key: with flats in a flat key, sharps in a sharp
	 * one. Not moved, it is left as written; anything that is not a chord is left alone.
	 *
	 * @param {string} name  The chord as written.
	 * @param {number} steps Semitones, up or down.
	 * @param {string} [key] The key it is in after the move, for its spelling.
	 * @return {string} The chord's name.
	 */
	function transpose( name, steps, key = '' ) {
		const c = read( name );
		if ( ! c || ! ( steps % 12 ) ) {
			return String( name ).trim();
		}
		const names = ( key ? flatKey( key ) : c.flat ) ? FLATS : SHARPS;
		const at = ( p ) => names[ ( ( ( p + steps ) % 12 ) + 12 ) % 12 ];
		return at( c.root ) + c.suffix + ( c.bass === null ? '' : '/' + at( c.bass ) );
	}

	// ---- Fingerings, for a guitar in standard tuning: frets low E to high E, null for a string not
	// played. The open shapes a guitarist learns first; every other root is one of them moved up the
	// neck under a barre (the E shape on the sixth string, the A shape on the fifth, the D shape on
	// the fourth), whichever sits lowest. .github/scripts/riff-chords.test.js checks each sounds only
	// its chord's notes.
	const TUNING = [ 4, 9, 2, 7, 11, 4 ];
	const OPEN = {
		C: 'x32010',
		C7: 'x32310',
		Cmaj7: 'x32000',
		Csus2: 'x30013',
		Csus4: 'x33011',
		D: 'xx0232',
		Dm: 'xx0231',
		D7: 'xx0212',
		Dm7: 'xx0211',
		Dmaj7: 'xx0222',
		Dsus2: 'xx0230',
		Dsus4: 'xx0233',
		E: '022100',
		Em: '022000',
		E7: '020100',
		Em7: '022030',
		Emaj7: '021100',
		Esus2: '024400',
		Esus4: '022200',
		Fmaj7: 'xx3210',
		G: '320003',
		G7: '320001',
		Gmaj7: '320002',
		Gsus2: '300033',
		Gsus4: '330013',
		A: 'x02220',
		Am: 'x02210',
		A7: 'x02020',
		Am7: 'x02010',
		Amaj7: 'x02120',
		Asus2: 'x02200',
		Asus4: 'x02230',
		B7: 'x21202',
	};
	// Barres, as frets above the barre, x for a string not played.
	const E_SHAPE = {
		'': '022100',
		m: '022000',
		7: '020100',
		m7: '020000',
		maj7: '0x110x',
		sus4: '022200',
	};
	const A_SHAPE = {
		'': 'x02220',
		m: 'x02210',
		7: 'x02020',
		m7: 'x02010',
		maj7: 'x02120',
		sus2: 'x02200',
		sus4: 'x02230',
	};
	const D_SHAPE = {
		sus2: 'xx0230',
	};
	const frets = ( pattern, at = 0 ) =>
		[ ...pattern ].map( ( f ) => ( f === 'x' ? null : Number( f ) + at ) );

	/**
	 * Where to put the fingers for a chord on a guitar, or null when there is no diagram for it.
	 *
	 * @param {string} name The chord, as it is to be played.
	 * @return {Array<number|null>|null} Frets, low E string first; 0 is open, null not played.
	 */
	function shape( name ) {
		const c = read( name );
		const quality = c ? QUALITY[ c.suffix ] : undefined;
		if ( quality === undefined ) {
			return null;
		}
		const open = OPEN[ SHARPS[ c.root ] + quality ] || OPEN[ FLATS[ c.root ] + quality ];
		if ( open ) {
			return frets( open );
		}
		// The shape whose root sits lowest on the neck, below the twelfth fret.
		let best = null;
		for ( const [ shapes, string ] of [
			[ E_SHAPE, 0 ],
			[ A_SHAPE, 1 ],
			[ D_SHAPE, 2 ],
		] ) {
			const at = ( c.root - TUNING[ string ] + 12 ) % 12 || 12;
			const f = shapes[ quality ] ? frets( shapes[ quality ], at ) : null;
			if ( f && Math.max( ...f.filter( ( n ) => n !== null ) ) <= 12 && ( ! best || at < best.at ) ) {
				best = { at, f };
			}
		}
		return best ? best.f : null;
	}

	// ---- Fingerings for a ukulele in standard tuning, G C E A with the G above middle C: the shape
	// a ukulele chord chart gives for each root, by pitch class from C, written G string first.
	// .github/scripts/riff-chords.test.js checks each sounds only its chord's notes.
	const UKULELE = {
		'': [ '0003', '1114', '2220', '0331', '4442', '2010', '3121', '0232', '5343', '2100', '3211', '4322' ],
		m: [ '0333', '1104', '2210', '3321', '0432', '1013', '2120', '0231', '1342', '2000', '3111', '4222' ],
		7: [ '0001', '1112', '2223', '3334', '1202', '2313', '3424', '0212', '1323', '0100', '1211', '2322' ],
		m7: [ '3333', '1102', '2213', '3324', '0202', '1313', '2424', '0211', '1322', '0000', '1111', '2222' ],
		maj7: [ '0002', '1113', '2224', '3335', '1302', '2413', '3524', '0222', '1333', '1100', '3210', '3322' ],
		sus2: [ '0233', '1344', '2200', '3311', '4422', '0013', '1124', '0230', '1341', '2452', '3011', '4122' ],
		sus4: [ '0013', '1124', '0230', '1341', '2452', '3011', '4122', '0233', '1344', '2200', '3311', '4422' ],
	};

	/**
	 * Where to put the fingers for a chord on a ukulele, or null when there is no diagram for it.
	 *
	 * @param {string} name The chord, as it is to be played.
	 * @return {Array<number>|null} Frets, G string first; 0 is open.
	 */
	function ukulele( name ) {
		const c = read( name );
		const shapes = c ? UKULELE[ QUALITY[ c.suffix ] ] : undefined;
		return shapes ? frets( shapes[ c.root ] ) : null;
	}

	// ---- Keys, for a piano: the chord's notes stacked up from its root, within two octaves from C.
	const INTERVALS = {
		'': [ 0, 4, 7 ],
		m: [ 0, 3, 7 ],
		7: [ 0, 4, 7, 10 ],
		m7: [ 0, 3, 7, 10 ],
		maj7: [ 0, 4, 7, 11 ],
		sus2: [ 0, 2, 7 ],
		sus4: [ 0, 5, 7 ],
	};

	/**
	 * The keys a chord is played on, or null when there is no diagram for it.
	 *
	 * @param {string} name The chord, as it is to be played.
	 * @return {Array<{key: number, note: string}>|null} Each key, in semitones up from the lower C,
	 *     with its note's name, spelled with flats in a chord that reads in flats.
	 */
	function keys( name ) {
		const c = read( name );
		const steps = c ? INTERVALS[ QUALITY[ c.suffix ] ] : undefined;
		if ( ! steps ) {
			return null;
		}
		const names = c.flat || flatKey( name ) ? FLATS : SHARPS;
		return steps.map( ( s ) => ( { key: c.root + s, note: names[ ( c.root + s ) % 12 ] } ) );
	}

	// ---- The chart.
	const DIRECTIVE = /^\s*\{\s*([a-z_]+)(?:\s*[:\s]\s*(.*?))?\s*\}\s*$/i;
	const ALIAS = {
		t: 'title',
		st: 'subtitle',
		c: 'comment',
		ci: 'comment',
		cb: 'comment',
		comment_italic: 'comment',
		comment_box: 'comment',
		highlight: 'comment',
		soc: 'start_of_chorus',
		eoc: 'end_of_chorus',
		sov: 'start_of_verse',
		eov: 'end_of_verse',
		sob: 'start_of_bridge',
		eob: 'end_of_bridge',
		sot: 'start_of_tab',
		eot: 'end_of_tab',
		sog: 'start_of_grid',
		eog: 'end_of_grid',
	};
	// The parts of a line: [time], [chord] and the words between.
	const PIECE = /\[([^\]]*)\]|[^[]+/g;

	// A section's label: {start_of_verse: Verse 2} or ChordPro 6's {start_of_verse label="Verse 2"}.
	const label = ( value ) => {
		const quoted = String( value || '' ).match( /label\s*=\s*"([^"]*)"/ );
		return ( quoted ? quoted[ 1 ] : String( value || '' ) ).trim();
	};

	/**
	 * Reads a chart.
	 *
	 * Each line is { pieces, time, kind }: pieces of { chord, text, time } (chord null for words
	 * before the first chord), its own time or null, and its kind: 'lyrics', 'comment' or 'tab'
	 * (kept as written). Sections are { kind, label, lines, time }: kind from the directive that
	 * opened it ('verse', 'chorus', ...), or '' for lines outside any; time when its first chord or
	 * line is played. `chords` is every timed chord in the order it is played, each the piece it
	 * belongs to.
	 *
	 * @param {string} text The chart.
	 * @return {Object} { meta, sections, chords, timed }.
	 */
	function parse( text ) {
		const meta = {};
		const sections = [];
		let section = null;
		const open = ( kind, name ) => {
			section = { kind, label: name, lines: [], time: null };
			sections.push( section );
		};
		const close = () => {
			section = null;
		};
		for ( const raw of String( text || '' ).replace( /^\uFEFF/, '' ).split( /\r?\n/ ) ) {
			if ( /^\s*#/.test( raw ) ) {
				continue; // A ChordPro comment, for whoever edits the chart.
			}
			const d = raw.match( DIRECTIVE );
			if ( d ) {
				const name = ALIAS[ d[ 1 ].toLowerCase() ] || d[ 1 ].toLowerCase();
				const value = ( d[ 2 ] || '' ).trim();
				const start = name.match( /^start_of_([a-z]+)$/ );
				if ( start ) {
					open( start[ 1 ], label( value ) );
				} else if ( /^end_of_/.test( name ) ) {
					close();
				} else if ( name === 'comment' ) {
					if ( ! section ) {
						open( '', '' );
					}
					section.lines.push( { kind: 'comment', text: value, pieces: [], time: null } );
				} else if ( name === 'chorus' ) {
					// {chorus}: the chorus again, said rather than written out.
					open( 'chorus', label( value ) );
					section.recall = true;
					close();
				} else if ( [ 'title', 'subtitle', 'artist', 'key', 'capo', 'tempo', 'time' ].includes( name ) ) {
					meta[ name ] = value;
				}
				continue;
			}
			if ( ! section ) {
				if ( ! raw.trim() ) {
					continue;
				}
				open( '', '' );
			}
			if ( section.kind === 'tab' || section.kind === 'grid' ) {
				section.lines.push( { kind: 'tab', text: raw, pieces: [], time: null } );
				continue;
			}
			if ( ! raw.trim() ) {
				// A blank line inside a section is a gap before the next.
				if ( section.lines.length ) {
					section.lines.at( -1 ).gapAfter = true;
				}
				continue;
			}
			const line = { kind: 'lyrics', pieces: [], time: null };
			let pending = null; // A time written just before a chord.
			for ( const m of raw.matchAll( PIECE ) ) {
				if ( m[ 1 ] === undefined ) {
					if ( ! line.pieces.length ) {
						line.pieces.push( { chord: null, text: '', time: null } );
					}
					line.pieces.at( -1 ).text += m[ 0 ];
					continue;
				}
				const inside = m[ 1 ].trim();
				const at = timing.stamp( inside );
				if ( at !== null ) {
					if ( ! line.pieces.length && line.time === null ) {
						line.time = at;
					} else {
						pending = at;
					}
					continue;
				}
				line.pieces.push( { chord: inside, text: '', time: pending } );
				pending = null;
			}
			section.lines.push( line );
		}

		// Times: a line's own, then each chord's. A chord that starts its line, with no time of its
		// own, is played when the line starts; the rest without one are spread evenly between the
		// times around them, a line's start or a chord's.
		const seq = [];
		for ( const s of sections ) {
			for ( const line of s.lines ) {
				if ( line.time !== null ) {
					seq.push( { time: line.time } );
				}
				line.pieces.forEach( ( p, k ) => {
					if ( p.chord === null || ! read( p.chord ) ) {
						return;
					}
					if ( p.time === null && k === 0 ) {
						p.time = line.time;
					}
					seq.push( { piece: p, line, section: s, time: p.time } );
				} );
			}
		}
		for ( let i = 0; i < seq.length; i++ ) {
			if ( seq[ i ].time !== null ) {
				continue;
			}
			let j = i;
			while ( j < seq.length && seq[ j ].time === null ) {
				j++;
			}
			const before = i > 0 ? seq[ i - 1 ].time : null;
			const after = j < seq.length ? seq[ j ].time : null;
			if ( before !== null && after !== null && after > before ) {
				for ( let k = i; k < j; k++ ) {
					seq[ k ].time = before + ( ( after - before ) * ( k - i + 1 ) ) / ( j - i + 1 );
					seq[ k ].piece.time = seq[ k ].time;
				}
			}
			i = j;
		}
		const all = seq.filter( ( e ) => e.piece );
		const chords = all
			.filter( ( c ) => c.piece.time !== null )
			.map( ( c, i ) => ( { ...c, i } ) )
			.sort( ( a, b ) => a.piece.time - b.piece.time || a.i - b.i );
		for ( const s of sections ) {
			const times = [
				...s.lines.map( ( l ) => l.time ),
				...chords.filter( ( c ) => c.section === s ).map( ( c ) => c.piece.time ),
			].filter( ( t ) => t !== null );
			s.time = times.length ? Math.min( ...times ) : null;
		}
		return { meta, sections, chords, timed: chords.length > 0 };
	}

	window.riffChordsChart = { parse, read, transpose, shape, ukulele, keys, flatKey };
} )();
