/* Riff Sing: a Standard MIDI File's vocal track as the melody, for a chart that comes from a score.
 *
 * read() takes the file's bytes and gives the same chart melody.js's parse() gives for UltraStar
 * text: phrases of notes, each with its start and end in seconds, its MIDI note and its syllable.
 * Only what a melody needs is read: the tempo map, each track's name, its notes and its lyrics.
 *
 * Each channel of each track is a part, so a file with every instrument on one track has them apart.
 * With lyrics, the vocal part is the one most of them start notes of, a part on a track named for a
 * voice (Vocals, Voice, Melody, or a choir's Soprano and the like) winning a tie; without, it is the
 * first part named for a voice, or failing that the first that isn't drums. Its words are its
 * track's lyric events, or a karaoke (.kar) file's text events on its track of words; any other
 * text event is a comment and is left out. A phrase ends where the lyrics start a new line (`/` or
 * `\`), and where the melody rests for two beats.
 *
 * Loaded as a classic script before sing.js, which reads it from window.riffSingMidi; Node's tests
 * require it and read the same object from globalThis. */
( ( scope ) => {
	// The most notes read, as melody.js reads, and the largest file: a song's is a few tens of KB.
	const MAX_NOTES = 5000;
	const MAX_BYTES = 2 * 1024 * 1024;
	// A track named for a voice: anything vocal, or a choir's part on its own, not a tenor sax.
	const VOCAL = /\b(vocals?|voices?|vox|singer|sing|melody|lyrics?)\b|^\s*(soprano|alto|tenor|baritone)s?\s*\d*\s*$/i;
	// A Rock Band chart's vocal tracks.
	const ROCK_BAND = /^(PART VOCALS|HARM\d)$/;
	// A karaoke file's track of words, whose text events are its lyrics.
	const WORDS = /\b(words|lyrics?|karaoke)\b/i;

	const text = ( bytes ) => {
		try {
			return new TextDecoder( 'utf-8', { fatal: true } ).decode( bytes );
		} catch {
			// Older karaoke files are Latin-1.
			return new TextDecoder( 'latin1' ).decode( bytes );
		}
	};

	// One track's events: notes on and off with their channel, and its name, lyrics and tempos.
	function events( b, from, to ) {
		const out = { name: '', notes: [], lyrics: [], texts: [], tempos: [] };
		let p = from;
		let tick = 0;
		let status = 0; // The running status: the last channel message's, which the next may leave out.
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
			// Meta and system exclusive events say their own status, and leave the running one as it
			// was, as lenient readers do: some files carry it on across a lyric.
			if ( b[ p ] === 0xff ) {
				p++;
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
				continue;
			}
			if ( b[ p ] === 0xf0 || b[ p ] === 0xf7 ) {
				p++;
				const length = vlq();
				p += length;
				continue;
			}
			if ( b[ p ] & 0x80 ) {
				status = b[ p++ ];
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
		// Each key's notes still sounding, oldest first: a note off ends the oldest, so a repeated
		// note whose note on comes before the last one's note off at the same tick is kept.
		const open = new Map();
		const notes = [];
		for ( const e of track.notes ) {
			const id = e.channel * 128 + e.key;
			const sounding = open.get( id ) || [];
			if ( e.on ) {
				sounding.push( e.tick );
				open.set( id, sounding );
			} else if ( sounding.length ) {
				notes.push( { from: sounding.shift(), to: e.tick, key: e.key } );
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

		// Each channel of each track is a part that could be the voice, as a file with every
		// instrument on one track (format 0) has them. Channel 10 is drums.
		const sung = tracks
			.flatMap( ( t ) =>
				[ ...new Set( t.notes.map( ( e ) => e.channel ) ) ]
					.filter( ( channel ) => channel !== 9 )
					.map( ( channel ) => ( {
						track: t,
						notes: melodyOf( {
							notes: t.notes.filter(
								// A Rock Band chart's vocals mark its phrases and percussion with notes
								// above the voice's range, which aren't sung.
								( e ) => e.channel === channel && ( e.key < 96 || ! ROCK_BAND.test( t.name ) )
							),
						} ),
					} ) )
			)
			.filter( ( s ) => s.notes.length );
		// Karaoke files keep their words as text events, with @ lines for the song's details, on a
		// track usually named Words. Anywhere else a text event is a comment, such as a copyright.
		const wordy = ( t ) => WORDS.test( t.name ) && ! t.notes.length;
		const karaoke = tracks.some(
			( t ) => ( WORDS.test( t.name ) && ! t.notes.length ) || t.texts.some( ( e ) => e.text.startsWith( '@' ) )
		);
		const wordsOf = ( t ) => {
			if ( t.lyrics.length ) {
				return t.lyrics;
			}
			return karaoke ? t.texts.filter( ( e ) => ! e.text.startsWith( '@' ) ) : [];
		};
		const words =
			[ ...tracks ]
				.sort( ( x, y ) => wordy( y ) - wordy( x ) )
				.map( wordsOf )
				.find( ( w ) => w.length ) || [];
		const near = ( s ) => {
			const starts = new Set( s.notes.map( ( n ) => n.from ) );
			return words.filter( ( w ) => starts.has( w.tick ) ).length;
		};
		// Where the lyrics fall says more than a name, which may be the song's title or a synth's
		// patch: with words, the part most of them start notes of, a voice's name breaking a tie;
		// without, the first part named for a voice.
		const named = ( s ) => Number( VOCAL.test( s.track.name ) );
		const chosen = words.length
			? [ ...sung ].sort( ( x, y ) => near( y ) - near( x ) || named( y ) - named( x ) )[ 0 ]
			: sung.find( named ) || sung[ 0 ];
		if ( ! chosen ) {
			return null;
		}
		const own = wordsOf( chosen.track );
		const lyrics = ( own.length ? own : words ).slice().sort( ( x, y ) => x.tick - y.tick );

		// Each note's syllable: the lyrics from just after the note before up to its own start. A
		// karaoke file starts each word with a space; otherwise a syllable ending in a hyphen runs on
		// into the next, and any other ends its word.
		const spaced = lyrics.some( ( l ) => /^ /.test( l.text ) );
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
			if ( breaks || ( previous && ( smpte ? seconds( rest ) >= 1 : rest >= 2 * perQuarter ) ) ) {
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
