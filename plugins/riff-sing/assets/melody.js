/* Riff Sing: the melody and the scoring, with no page in sight, so both are tested as they are.
 *
 * A melody is UltraStar's text format, the open one karaoke games such as UltraStar Deluxe and
 * Performous read: a few #TAG:value headers, then one line per syllable with its start and length in
 * beats and its pitch in semitones from middle C, and a line break (`-`) between phrases. It is
 * typed or pasted into the track's Melody field in the Media Library.
 *
 * Beats count from the start of the song, or, in a chart marked #RELATIVE:yes, from the start of
 * the line: there a break says, after when it falls, how many beats on the next line starts.
 *
 * The scorer takes what was sung, one frame at a time (a time in the song, and a pitch as a MIDI
 * note number, or null for silence), and gives each phrase a score from 0 to 1 when it ends. Octave
 * doesn't count, as in Rock Band: a child singing an octave above the recording still matches.
 *
 * Loaded as a classic script before sing.js, which reads it from window.riffSingMelody; Node's
 * tests require it and read the same object from globalThis. */
( ( scope ) => {
	// Note lines: the kind, start and length in beats, pitch, then the syllable after one space.
	// `:` is a note, `*` a golden one, `F` freestyle (not scored), `R` and `G` rap (not scored).
	const NOTE = /^([:*FRG])\s*(-?\d+)\s+(\d+)\s+(-?\d+)(?: (.*))?$/;
	// A break, when it falls, and in a relative chart how far on the next line's beats start.
	const BREAK = /^-\s*(-?\d+)(?:\s+(-?\d+))?/;
	const HEADER = /^#([A-Z0-9]+):(.*)$/i;
	// The longest chart read: a song is a few thousand notes at the very most.
	const MAX_NOTES = 5000;

	const number = ( text ) => Number( String( text ).trim().replace( ',', '.' ) );

	/**
	 * Reads an UltraStar chart.
	 *
	 * @param {string} text The chart.
	 * @return {{title: string, artist: string, phrases: Object[], low: number, high: number}|null}
	 *         The chart, each phrase with its notes and their times in seconds, or null when it
	 *         can't be read: no BPM, or no notes.
	 */
	function parse( text ) {
		const tags = {};
		const phrases = [];
		let notes = [];
		let count = 0;
		let skipping = false; // A duet's second singer, P2, until P1 comes back.
		const close = () => {
			if ( notes.length ) {
				phrases.push( {
					start: notes[ 0 ].start,
					end: notes[ notes.length - 1 ].end,
					notes,
				} );
			}
			notes = [];
		};
		const lines = String( text || '' )
			.replace( /^\uFEFF/, '' )
			.split( /\r?\n/ );
		let beat = 0; // Seconds per beat, once #BPM is read.
		let gap = 0;
		let relative = false;
		let offset = 0; // In a relative chart, the beat the current line's count starts from.
		for ( const raw of lines ) {
			// A syllable may end in the space that ends its word, so a note keeps its trailing spaces;
			// the other lines are read without theirs.
			const line = raw.replace( /\r$/, '' );
			const bare = line.trim();
			const header = bare.match( HEADER );
			if ( header ) {
				tags[ header[ 1 ].toUpperCase() ] = header[ 2 ].trim();
				continue;
			}
			if ( ! beat ) {
				const bpm = number( tags.BPM );
				if ( ! ( bpm > 0 ) ) {
					if ( /^[:*FRG-]/.test( bare ) ) {
						return null;
					}
					continue;
				}
				// UltraStar's BPM counts quarter beats: a beat is a quarter of 60 / BPM seconds.
				beat = 60 / bpm / 4;
				gap = ( number( tags.GAP ) || 0 ) / 1000;
				relative = /^yes$/i.test( tags.RELATIVE || '' );
			}
			if ( /^P\s*\d/i.test( bare ) ) {
				close();
				skipping = ! /^P\s*1$/i.test( bare );
				continue;
			}
			if ( /^E\b/.test( bare ) ) {
				break;
			}
			if ( skipping ) {
				continue;
			}
			const gone = bare.match( BREAK );
			if ( gone ) {
				close();
				// Without its second number, the next line counts from where the break falls.
				if ( relative ) {
					offset += Number( gone[ 2 ] ?? gone[ 1 ] );
				}
				continue;
			}
			const m = line.replace( /^\s+/, '' ).match( NOTE );
			if ( ! m || ++count > MAX_NOTES ) {
				continue;
			}
			const [ , kind, start, length, pitch, syllable = '' ] = m;
			const at = gap + ( offset + Number( start ) ) * beat;
			notes.push( {
				start: at,
				end: at + Math.max( 1, Number( length ) ) * beat,
				// UltraStar's 0 is middle C, MIDI's 60.
				midi: Number( pitch ) + 60,
				golden: kind === '*',
				// Freestyle and rap are spoken or free, so they are shown but not scored.
				free: kind === 'F' || kind === 'R' || kind === 'G',
				// A tilde carries the syllable before it over another note.
				text: syllable.replace( /~/g, '' ),
			} );
		}
		close();
		phrases.sort( ( a, b ) => a.start - b.start );
		const all = phrases.flatMap( ( p ) => p.notes ).filter( ( n ) => ! n.free );
		if ( ! all.length ) {
			return null;
		}
		return {
			title: tags.TITLE || '',
			artist: tags.ARTIST || '',
			phrases,
			low: Math.min( ...all.map( ( n ) => n.midi ) ),
			high: Math.max( ...all.map( ( n ) => n.midi ) ),
		};
	}

	/**
	 * How far a sung pitch is from a note, in cents, with the octave left out: from -600 to 600.
	 *
	 * @param {number} sung A MIDI note number, fractional.
	 * @param {number} want The note's MIDI number.
	 * @return {number} Cents.
	 */
	function cents( sung, want ) {
		const off = ( ( ( ( sung - want ) * 100 ) % 1200 ) + 1200 ) % 1200;
		return off > 600 ? off - 1200 : off;
	}

	/**
	 * A frequency as a MIDI note number, fractional: 440 Hz is 69.
	 *
	 * @param {number} hz Hertz.
	 * @return {number|null} The note, or null for none.
	 */
	const midi = ( hz ) => ( hz > 0 ? 69 + 12 * Math.log2( hz / 440 ) : null );

	/**
	 * Scores what is sung against a chart.
	 *
	 * @param {Object} chart             A chart from parse().
	 * @param {Object} options           Options.
	 * @param {number} options.tolerance How far from the note still counts, in cents. Default 100.
	 * @return {Object} add( time, note ) for each frame, which returns the phrases it finished;
	 *                  finish() at the end of the song; total(); and tolerance to change.
	 */
	function scorer( chart, { tolerance = 100 } = {} ) {
		const phrases = chart.phrases;
		const tally = new Map(); // note → { frames, hits }
		const results = new Map(); // phrase index → score
		let cursor = 0; // The first phrase not yet scored.
		let last = null;

		function score( i ) {
			let weight = 0;
			let sum = 0;
			for ( const note of phrases[ i ].notes ) {
				const t = tally.get( note );
				if ( note.free || ! t?.frames ) {
					continue;
				}
				const w = ( note.end - note.start ) * ( note.golden ? 2 : 1 );
				weight += w;
				sum += ( w * t.hits ) / t.frames;
			}
			return weight ? sum / weight : null;
		}

		function close( i, done ) {
			const s = score( i );
			if ( s !== null ) {
				results.set( i, s );
				done.push( { index: i, score: s, phrase: phrases[ i ] } );
			}
		}

		// A jump in the song (a seek, a replay) forgets the phrases from there on, to be sung again.
		function seek( time ) {
			cursor = phrases.findIndex( ( p ) => p.end > time );
			if ( cursor < 0 ) {
				cursor = phrases.length;
			}
			for ( let i = cursor; i < phrases.length; i++ ) {
				results.delete( i );
				phrases[ i ].notes.forEach( ( n ) => tally.delete( n ) );
			}
		}

		const api = {
			tolerance,
			add( time, note ) {
				const done = [];
				if ( last === null || time < last - 0.5 || time > last + 2 ) {
					seek( time );
				}
				last = time;
				while ( cursor < phrases.length && phrases[ cursor ].end <= time ) {
					close( cursor++, done );
				}
				const phrase = phrases[ cursor ];
				const target = phrase?.notes.find(
					( n ) => ! n.free && n.start <= time && time < n.end
				);
				if ( target ) {
					const t = tally.get( target ) || { frames: 0, hits: 0 };
					t.frames++;
					if ( note !== null && Math.abs( cents( note, target.midi ) ) <= api.tolerance ) {
						t.hits++;
					}
					tally.set( target, t );
				}
				return done;
			},
			// The song ended: the phrase being sung is scored with what it has.
			finish() {
				const done = [];
				while ( cursor < phrases.length ) {
					close( cursor++, done );
				}
				last = null;
				return done;
			},
			// The note being sung at a time, for the lane to draw the voice against.
			note( time ) {
				for ( const p of phrases ) {
					if ( p.start > time ) {
						break;
					}
					const n = p.notes.find( ( x ) => x.start <= time && time < x.end );
					if ( n ) {
						return n;
					}
				}
				return null;
			},
			// How a note went, 0 to 1, or null before it was sung.
			hit( note ) {
				const t = tally.get( note );
				return t?.frames ? t.hits / t.frames : null;
			},
			// The song so far: each scored phrase weighted by its length.
			total() {
				let weight = 0;
				let sum = 0;
				for ( const [ i, s ] of results ) {
					const w = phrases[ i ].end - phrases[ i ].start;
					weight += w;
					sum += w * s;
				}
				return weight ? sum / weight : null;
			},
			reset() {
				tally.clear();
				results.clear();
				cursor = 0;
				last = null;
			},
		};
		return api;
	}

	/**
	 * A score as a word, gentle enough for a child: never a fail.
	 *
	 * @param {number} score 0 to 1.
	 * @return {string} 'great', 'good', 'close' or 'keep'.
	 */
	function grade( score ) {
		if ( score >= 0.8 ) {
			return 'great';
		}
		if ( score >= 0.55 ) {
			return 'good';
		}
		if ( score >= 0.25 ) {
			return 'close';
		}
		return 'keep';
	}

	scope.riffSingMelody = { parse, cents, midi, scorer, grade };
} )( globalThis );
