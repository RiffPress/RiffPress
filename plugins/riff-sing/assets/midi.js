/* Riff Sing: a Standard MIDI File's vocal track as the melody, for a chart that comes from a score.
 *
 * read() takes the file's bytes and gives the same chart melody.js's parse() gives for UltraStar
 * text: phrases of notes, each with its start and end in seconds, its MIDI note and its syllable.
 * Only what a melody needs is read: the tempo map, each track's name, its notes and its lyrics.
 *
 * The vocal track is the first one named for a voice (Vocals, Voice, Melody, Soprano and the like);
 * failing that, the one whose notes start where the lyrics fall; failing that, the first track with
 * notes that isn't drums. Its words are its own lyric events, or a words-only track's, as a karaoke
 * (.kar) file keeps them. A phrase ends where the lyrics start a new line (`/` or `\`), or where
 * the melody rests for two beats when they don't say.
 *
 * Loaded as a classic script before sing.js, which reads it from window.riffSingMidi; Node's tests
 * require it and read the same object from globalThis. */
( ( scope ) => {
	// The most notes read, as melody.js reads, and the largest file: a song's is a few tens of KB.
	const MAX_NOTES = 5000;
	const MAX_BYTES = 2 * 1024 * 1024;
	const VOCAL = /\b(vocals?|voices?|vox|singer|sing|melody|lyrics?|soprano|alto|tenor|baritone)\b/i;

	const text = ( bytes ) => {
		try {
			return new TextDecoder( 'utf-8', { fatal: true } ).decode( bytes );
		} catch {
			// Older karaoke files are Latin-1.
			return String.fromCharCode( ...bytes );
		}
	};

	// One track's events: notes on and off with their channel, and its name, lyrics and tempos.
	function events( b, from, to ) {
		const out = { name: '', notes: [], lyrics: [], texts: [], tempos: [] };
		let p = from;
		let tick = 0;
		let status = 0;
		const vlq = () => {
			let v = 0;
			for ( let i = 0; i < 4 && p < to; i++ ) {
				const byte = b[ p++ ];
				v = ( v << 7 ) | ( byte & 0x7f );
				if ( ! ( byte & 0x80 ) ) {
					break;
				}
			}
			return v;
		};
		while ( p < to ) {
			tick += vlq();
			if ( p >= to ) {
				break;
			}
			if ( b[ p ] & 0x80 ) {
				status = b[ p++ ];
			}
			if ( status === 0xff ) {
				const type = b[ p++ ];
				const length = vlq();
				const data = b.subarray( p, Math.min( to, p + length ) );
				p += length;
				if ( type === 0x03 && ! out.name ) {
					out.name = text( data );
				} else if ( type === 0x05 ) {
					out.lyrics.push( { tick, text: text( data ) } );
				} else if ( type === 0x01 ) {
					out.texts.push( { tick, text: text( data ) } );
				} else if ( type === 0x51 && data.length === 3 ) {
					out.tempos.push( { tick, us: ( data[ 0 ] << 16 ) | ( data[ 1 ] << 8 ) | data[ 2 ] } );
				} else if ( type === 0x2f ) {
					break;
				}
				status = 0;
				continue;
			}
			if ( status === 0xf0 || status === 0xf7 ) {
				p += vlq();
				status = 0;
				continue;
			}
			if ( ! status ) {
				// Data with no status before it: the file is broken from here.
				break;
			}
			const kind = status & 0xf0;
			const size = kind === 0xc0 || kind === 0xd0 ? 1 : 2;
			if ( p + size > to ) {
				break;
			}
			const a = b[ p++ ];
			const v = size === 1 ? 0 : b[ p++ ];
			if ( kind === 0x90 || kind === 0x80 ) {
				out.notes.push( { tick, on: kind === 0x90 && v > 0, key: a, channel: status & 0x0f } );
			}
		}
		return out;
	}

	// The notes a track plays, each from its note on to its note off, one at a time: a voice sings
	// one note, so a note that starts while another sounds ends the one before.
	function melodyOf( track ) {
		const open = new Map();
		const notes = [];
		for ( const e of track.notes ) {
			const id = e.channel * 128 + e.key;
			if ( e.on ) {
				if ( ! open.has( id ) ) {
					open.set( id, e.tick );
				}
			} else if ( open.has( id ) ) {
				notes.push( { from: open.get( id ), to: e.tick, key: e.key } );
				open.delete( id );
			}
		}
		notes.sort( ( x, y ) => x.from - y.from || y.key - x.key );
		const one = [];
		for ( const n of notes ) {
			const last = one[ one.length - 1 ];
			if ( last && n.from === last.from ) {
				// A chord: the top note is the tune.
				continue;
			}
			if ( last && last.to > n.from ) {
				last.to = n.from;
			}
			if ( n.to > n.from ) {
				one.push( n );
			}
		}
		return one.slice( 0, MAX_NOTES );
	}

	/**
	 * Reads a Standard MIDI File's vocal track into a chart.
	 *
	 * @param {ArrayBuffer|Uint8Array} input The file.
	 * @return {{title: string, artist: string, phrases: Object[], low: number, high: number}|null}
	 *         The chart, as melody.js's parse() gives one, or null when it isn't a MIDI file or has
	 *         no notes.
	 */
	function read( input ) {
		const b = input instanceof Uint8Array ? input : new Uint8Array( input || [] );
		const tag = ( at ) => String.fromCharCode( b[ at ], b[ at + 1 ], b[ at + 2 ], b[ at + 3 ] );
		const u32 = ( at ) => ( ( b[ at ] << 24 ) | ( b[ at + 1 ] << 16 ) | ( b[ at + 2 ] << 8 ) | b[ at + 3 ] ) >>> 0;
		if ( b.length < 14 || b.length > MAX_BYTES || tag( 0 ) !== 'MThd' ) {
			return null;
		}
		const division = ( b[ 12 ] << 8 ) | b[ 13 ];
		const tracks = [];
		for ( let p = 8 + u32( 4 ); p + 8 <= b.length; ) {
			const end = Math.min( b.length, p + 8 + u32( p + 4 ) );
			if ( tag( p ) === 'MTrk' ) {
				tracks.push( events( b, p + 8, end ) );
			}
			p = end;
		}

		// Ticks to seconds, through every tempo change in the file. A SMPTE division counts frames
		// of the clock, not beats, so its tempo is fixed.
		const smpte = division & 0x8000;
		const perQuarter = smpte ? 0 : division || 480;
		const tempos = tracks.flatMap( ( t ) => t.tempos ).sort( ( x, y ) => x.tick - y.tick );
		const seconds = ( tick ) => {
			if ( smpte ) {
				const fps = 256 - ( division >> 8 );
				return tick / ( ( fps === 29 ? 29.97 : fps ) * ( division & 0xff || 1 ) );
			}
			let at = 0;
			let s = 0;
			let us = 500000;
			for ( const t of tempos ) {
				if ( t.tick >= tick ) {
					break;
				}
				s += ( ( t.tick - at ) * us ) / perQuarter / 1e6;
				at = t.tick;
				us = t.us || us;
			}
			return s + ( ( tick - at ) * us ) / perQuarter / 1e6;
		};

		const sung = tracks.map( ( t ) => ( { track: t, notes: melodyOf( t ) } ) ).filter(
			// Channel 10 is drums.
			( s ) => s.notes.length && ! s.track.notes.every( ( e ) => e.channel === 9 )
		);
		// Karaoke files keep their words as text events, with @ lines for the song's details.
		const wordsOf = ( t ) =>
			t.lyrics.length ? t.lyrics : t.texts.filter( ( e ) => ! e.text.startsWith( '@' ) );
		const words = tracks.map( wordsOf ).find( ( w ) => w.length ) || [];
		const near = ( s ) => {
			const starts = new Set( s.notes.map( ( n ) => n.from ) );
			return words.filter( ( w ) => starts.has( w.tick ) ).length;
		};
		const chosen =
			sung.find( ( s ) => VOCAL.test( s.track.name ) ) ||
			( words.length && [ ...sung ].sort( ( x, y ) => near( y ) - near( x ) )[ 0 ] ) ||
			sung[ 0 ];
		if ( ! chosen ) {
			return null;
		}
		const own = wordsOf( chosen.track );
		const lyrics = ( own.length ? own : words ).slice().sort( ( x, y ) => x.tick - y.tick );

		// Each note's syllable: the lyrics from just after the note before up to its own start. A
		// karaoke file starts each word with a space; otherwise a syllable ending in a hyphen runs on
		// into the next, and any other ends its word.
		const spaced = lyrics.some( ( l ) => /^ /.test( l.text ) );
		const lines = lyrics.some( ( l ) => /^[/\\]|[\r\n]$/.test( l.text ) );
		const slack = smpte ? 0 : perQuarter / 16;
		const phrases = [];
		let notes = [];
		let w = 0;
		let breakNext = false;
		let previous = null;
		const close = () => {
			if ( notes.length ) {
				phrases.push( { start: notes[ 0 ].start, end: notes[ notes.length - 1 ].end, notes } );
			}
			notes = [];
		};
		for ( const n of chosen.notes ) {
			let said = '';
			let breaks = breakNext;
			breakNext = false;
			while ( w < lyrics.length && lyrics[ w ].tick <= n.from + slack ) {
				let t = lyrics[ w++ ].text;
				if ( /^[/\\]/.test( t ) ) {
					breaks = true;
					t = t.slice( 1 );
				}
				if ( /[\r\n]$/.test( t ) ) {
					breakNext = true;
				}
				said += t.replace( /[\r\n]/g, '' );
			}
			if ( said === '+' ) {
				// Rock Band's slur: the syllable before carries on.
				said = '';
			} else if ( said.endsWith( '-' ) ) {
				said = said.slice( 0, -1 );
			} else if ( said && ! spaced && ! /\s$/.test( said ) ) {
				said += ' ';
			}
			const rest = previous ? n.from - previous.to : 0;
			if ( breaks || ( ! lines && previous && ( smpte ? seconds( rest ) >= 1 : rest >= 2 * perQuarter ) ) ) {
				close();
			}
			notes.push( {
				start: seconds( n.from ),
				end: seconds( n.to ),
				midi: n.key,
				golden: false,
				free: false,
				text: said,
			} );
			previous = n;
		}
		close();
		const all = phrases.flatMap( ( p ) => p.notes );
		return {
			title: '',
			artist: '',
			phrases,
			low: Math.min( ...all.map( ( n ) => n.midi ) ),
			high: Math.max( ...all.map( ( n ) => n.midi ) ),
		};
	}

	scope.riffSingMidi = { read };
} )( globalThis );
