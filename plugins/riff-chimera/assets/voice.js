/* Riff Chimera: CHIMERA's voice, driven by the song's clock, with no page in sight.
 *
 * CHIMERA (github.com/jamesondh/chimera-vocal-synth, MIT) is a physical model of a voice: a Rust
 * engine compiled to one WebAssembly module with no imports, run in an AudioWorklet. The main thread
 * keeps its own instance for what isn't real time (reading the lyrics into syllables and planning a
 * phrase into gestures) through the engine's JSON call; the worklet renders those gestures. Both
 * the module and the worklet are CHIMERA's own build, kept in assets/chimera/ with its licence and
 * the commit it was built from (SOURCE.txt), and are fetched only when load() is first called.
 *
 * What is Riff Chimera's own is the following: a melody (phrases of notes, each with a start and
 * end in the song's seconds, a MIDI pitch and a syllable) becomes CHIMERA's sung notes a phrase at
 * a time, timed from where the song is and how fast it plays, and the voice is cued again whenever
 * the song jumps, changes speed or drifts away from the voice's own clock. One Voice is one
 * CHIMERA, with its own worklet; a duet has two.
 *
 * Loaded as a classic script before chimera.js, which reads it from window.riffChimeraVoice. */
( ( scope ) => {
	// A note needs this long before its beat for its consonants; one closer to now is left out.
	const ONSET = 0.12;
	// How far the voice may wander from the song, in seconds, before it is cued again.
	const SLACK = 0.06;
	// The worklet takes at most this many gestures in one message (CHIMERA's processor.ts).
	const MAX_GESTURES = 4000;
	// And its score holds this many (CHIMERA's GestureScore::CAPACITY, less some room).
	const SCORE = 16000;
	// Vibrato on held vowels, in cents: CHIMERA's own default.
	const VIBRATO = 35;

	let loading = null;

	/**
	 * Fetches and compiles CHIMERA's engine and its pronouncing dictionary, once.
	 *
	 * @param {{bundle: string, wasm: string, dict: string}} urls Where they are.
	 * @return {Promise<{module: WebAssembly.Module, call: (fn: string, args?: Object) => Object, head: (canvas: HTMLCanvasElement, body: Object, sampleRate: number, facing: number) => {draw: (tele: ?Object, dt: number) => void}, dictionary: boolean}>} The engine.
	 */
	function load( urls ) {
		loading ??= ( async () => {
			// CHIMERA's main-thread side, a module of its own build: the engine's JSON call, the compiled
			// module the worklet instantiates, and its cutaway head.
			const lib = await import( urls.bundle );
			const { call, module, head } = await lib.boot( urls.wasm );
			// Without the dictionary CHIMERA reads English by its letter-to-sound rules.
			let dictionary = false;
			try {
				const d = await fetch( urls.dict, {
					credentials: 'same-origin',
				} );
				if ( d.ok ) {
					call( 'g2pLoad', { text: await d.text() } );
					dictionary = true;
				}
			} catch {}
			return { module, call, head, dictionary };
		} )();
		loading.catch( () => ( loading = null ) );
		return loading;
	}

	// A syllable to sing where the words can't be read: an open "ah".
	const AH = {
		text: 'ah',
		onset: [],
		nucleus: { ipa: 'ɑ', stress: 1 },
		coda: [],
		wordEnd: true,
		phraseEnd: false,
	};

	/**
	 * The melody's notes, each with the syllable CHIMERA sings on it.
	 *
	 * The chart gives a syllable per note: "Si", "lent ", "night, ", then an empty one where a vowel
	 * carries over (a melisma). They are written out as CHIMERA's own lyrics would be, a hyphen
	 * between a word's syllables and "~" for a held vowel, so its reading gives one syllable per
	 * note; where it doesn't, each note's syllable is read alone.
	 *
	 * @param {(fn: string, args?: Object) => Object} call    The engine's call.
	 * @param {Object[]}                              phrases The melody's phrases.
	 * @param {boolean}                               words   False to sing every note on "ah".
	 * @return {Object[]} Phrases of {start, end, midi, syl, text}.
	 */
	function syllables( call, phrases, words ) {
		return phrases
			.map( ( p ) => {
				const notes = p.notes.filter(
					( n ) => n.end > n.start && n.midi > 0
				);
				let syls;
				if ( words ) {
					let lyric = '';
					notes.forEach( ( n, i ) => {
						const text = String( n.text || '' );
						const bare = text.trim().replace( /[-~]/g, '' );
						const next = notes[ i + 1 ];
						if ( ! bare ) {
							lyric += ( lyric ? ' ' : '' ) + '~ ';
							return;
						}
						// A word goes on into the next note when neither side has the space between.
						const goesOn =
							next &&
							next.text &&
							! /\s$/.test( text ) &&
							! /^\s/.test( next.text ) &&
							next.text.trim();
						lyric +=
							( /^\s/.test( text ) &&
							lyric &&
							! /\s$/.test( lyric )
								? ' '
								: '' ) +
							bare +
							( goesOn ? '-' : ' ' );
					} );
					syls = call( 'lyricsToSyllables', { text: lyric } );
					if ( syls.length !== notes.length ) {
						syls = notes.map( ( n ) => {
							const bare = String( n.text || '' ).trim();
							return bare
								? call( 'lyricsToSyllables', {
										text: bare,
									} )[ 0 ] || AH
								: { ...AH, melisma: true };
						} );
					}
				} else {
					syls = notes.map( ( n, i ) =>
						i ? { ...AH, melisma: true } : AH
					);
				}
				const sung = notes.map( ( n, i ) => ( {
					start: n.start,
					end: n.end,
					midi: n.midi,
					syl: { ...syls[ i ], phraseEnd: false },
					text: n.text,
				} ) );
				if ( sung.length ) {
					sung[ sung.length - 1 ].syl.phraseEnd = true;
				}
				return {
					start: sung[ 0 ]?.start ?? p.start,
					end: sung[ sung.length - 1 ]?.end ?? p.end,
					notes: sung,
				};
			} )
			.filter( ( p ) => p.notes.length );
	}

	/**
	 * One phrase planned from a moment in the song: its notes from `from` on, each held to the next
	 * one's start (a gap inside a phrase is legato), at the speed given.
	 *
	 * @param {(fn: string, args?: Object) => Object} call   The engine's call.
	 * @param {Object}                                phrase A phrase of syllables().
	 * @param {number}                                from   The song's time the plan's time 0 is.
	 * @param {number}                                rate   The song's speed.
	 * @param {Object}                                body   CHIMERA's body mix.
	 * @return {Object|null} The plan, or null when nothing of the phrase is left to sing.
	 */
	function plan( call, phrase, from, rate, body ) {
		const notes = phrase.notes.filter(
			( n ) => n.start >= from + ONSET * rate
		);
		if ( ! notes.length ) {
			return null;
		}
		// A phrase cut into starts on a whole syllable, not a held vowel.
		if ( notes[ 0 ].syl.melisma ) {
			notes[ 0 ] = {
				...notes[ 0 ],
				syl: { ...notes[ 0 ].syl, melisma: false, onset: [] },
			};
		}
		const sung = notes.map( ( n, i ) => ( {
			midi: n.midi,
			// At bpm 60 × rate a beat is a second of the song.
			beats:
				( i + 1 < notes.length ? notes[ i + 1 ].start : n.end ) -
				n.start,
			syl: n.syl,
		} ) );
		return call( 'planSong', {
			notes: sung,
			options: {
				body,
				bpm: 60 * rate,
				t0: ( notes[ 0 ].start - from ) / rate,
				vibrato: VIBRATO,
			},
		} );
	}

	/**
	 * CHIMERA singing a melody along with a song.
	 */
	class Voice {
		/**
		 * @param {Object}       engine What load() gave.
		 * @param {AudioContext} ctx    The context to sing in.
		 * @param {string}       url    The worklet processor's address.
		 */
		constructor( engine, ctx, url ) {
			this.engine = engine;
			this.ctx = ctx;
			this.url = url;
			this.node = null;
			this.out = ctx.createGain();
			this.phrases = [];
			this.body = { female: 0, child: 0 };
			// Telemetry from the worklet: its clock, and when on this thread it was read.
			this.tele = null;
			this.teleAt = 0;
			// The voice's clock at the song's `song` second, at `rate`; null when nothing is cued.
			this.anchor = null;
			this.failed = null;
			this.drift = 0;
			this.cues = 0;
		}

		/**
		 * Builds the worklet node, after the listener's press.
		 *
		 * @param {AudioNode} destination Where the voice goes.
		 */
		async start( destination ) {
			if ( this.node ) {
				return;
			}
			await this.ctx.audioWorklet.addModule( this.url );
			this.node = new AudioWorkletNode( this.ctx, 'chimera', {
				numberOfInputs: 0,
				numberOfOutputs: 1,
				outputChannelCount: [ 2 ],
				processorOptions: { module: this.engine.module },
			} );
			this.node.port.onmessage = ( e ) => {
				const m = e.data;
				if ( m.type === 'telemetry' ) {
					this.tele = m;
					this.teleAt = performance.now();
				} else if (
					m.type === 'planned' &&
					this.pending &&
					m.id === this.pending.id
				) {
					this.anchor = {
						clock: m.t0,
						song: this.pending.from,
						rate: this.pending.rate,
						seen: [],
						bias: 0,
					};
					this.pending = null;
				} else if ( m.type === 'error' ) {
					this.failed = m.message;
				}
			};
			this.node.connect( this.out ).connect( destination );
			this.id = 0;
		}

		/**
		 * The melody to sing, as syllables() gives it, and the body that sings it.
		 *
		 * @param {Object[]} phrases The phrases.
		 * @param {Object}   body    CHIMERA's body mix, {female, child}, each 0 to 1.
		 */
		melody( phrases, body ) {
			this.silence();
			this.phrases = phrases;
			this.body = body;
			this.send( { type: 'body', body } );
		}

		/** How long after it is rendered the voice is heard, in seconds. */
		lag() {
			return (
				( this.ctx.outputLatency || 0 ) + ( this.ctx.baseLatency || 0 )
			);
		}

		/** The voice's clock now, from the worklet's last word; null before any. */
		clock() {
			return this.tele
				? this.tele.t.clock +
						Math.min(
							0.25,
							( performance.now() - this.teleAt ) / 1000
						)
				: null;
		}

		send( msg ) {
			this.node?.port.postMessage( msg );
		}

		/** Stops what is being sung and forgets where it was. */
		silence() {
			this.send( { type: 'stopSpeech' } );
			this.anchor = null;
			this.pending = null;
		}

		plan( phrase, from, rate ) {
			return plan( this.engine.call, phrase, from, rate, this.body );
		}

		/**
		 * Sings from where the song is now: anything being sung is dropped, and the rest of the song
		 * is planned afresh and handed over at once, in as many messages as it takes. The worklet
		 * takes messages between two blocks of sound, so all of them land on the same clock as the
		 * first, whose arrival it reports: that is the anchor everything after is measured from.
		 *
		 * @param {number} time Where the song is.
		 * @param {number} rate Its speed.
		 */
		cue( time, rate ) {
			this.cues++;
			this.anchor = null;
			// The voice is heard a moment after it is rendered, so it is planned that far ahead.
			const from = time + this.lag() * rate;
			const chunks = [ [] ];
			let total = 0;
			for ( const phrase of this.phrases ) {
				if ( phrase.end <= from ) {
					continue;
				}
				const p = this.plan( phrase, from, rate );
				if ( ! p || ! p.gestures.length ) {
					continue;
				}
				// The worklet's score holds so many gestures, freed as they are sung; a song longer
				// than that stops early rather than lose notes in its middle.
				if ( ( total += p.gestures.length ) > SCORE ) {
					break;
				}
				if (
					chunks[ chunks.length - 1 ].length + p.gestures.length >
					MAX_GESTURES
				) {
					chunks.push( [] );
				}
				chunks[ chunks.length - 1 ].push( ...p.gestures );
			}
			const id = ++this.id;
			this.pending = { id, from, rate };
			chunks.forEach( ( gestures, i ) =>
				this.send( {
					type: 'schedule',
					gestures,
					// A segment makes the worklet say where on its clock the plan's time 0 fell.
					segments: i ? [] : [ { ipa: '', t0: 0, t1: 0 } ],
					end: 0,
					id: i ? ++this.id : id,
					replace: ! i,
					lead: 0,
				} )
			);
		}

		/**
		 * Keeps the voice with the song, once a frame while it plays: cues it again when the song has
		 * jumped, changed speed or drifted from the voice's clock.
		 *
		 * @param {number} time Where the song is.
		 * @param {number} rate Its speed.
		 */
		follow( time, rate ) {
			if ( ! this.node || this.failed || this.pending ) {
				return;
			}
			const a = this.anchor;
			const now = this.clock();
			if ( ! a || now === null || a.rate !== rate ) {
				return this.cue( time, rate );
			}
			// Where the voice is in the song by its own clock, against where the song is. The clock
			// is read from the worklet's last message, a moment old, so it is off by about as much
			// each frame: what it is off by in the first frames after a cue is taken as that, and
			// only a change from it counts.
			const raw =
				a.song +
				( now - a.clock ) * rate -
				( time + this.lag() * rate );
			if ( a.seen.length < 10 ) {
				a.seen.push( raw );
				a.bias = [ ...a.seen ].sort( ( x, y ) => x - y )[
					a.seen.length >> 1
				];
			}
			this.drift = raw - a.bias;
			if ( Math.abs( this.drift ) > SLACK ) {
				this.cue( time, rate );
			}
		}

		/** The worklet's last telemetry message, for the head to draw. */
		get message() {
			return this.tele;
		}

		/** What the voice is doing, from that message: its pitch, voicing, loudness and the rest. */
		get state() {
			return this.tele?.t ?? null;
		}

		/** Stops the voice and lets go of the worklet. */
		close() {
			this.silence();
			this.node?.disconnect();
			this.node = null;
			this.tele = null;
		}
	}

	/**
	 * Bodies for the singers of a melody, from each part's pitch: a low part a man's voice, a high
	 * one a woman's, and a very high one towards a child's, as CHIMERA blends them. Two parts that
	 * would sound alike are pulled apart, so a duet sounds like two people.
	 *
	 * @param {number[]} middles Each part's middle note, as a MIDI number.
	 * @return {Object[]} A body mix for each.
	 */
	function bodies( middles ) {
		const clamp = ( x ) => Math.max( 0, Math.min( 1, x ) );
		const out = middles.map( ( m ) => ( {
			female: clamp( ( m - 52 ) / 10 ),
			child: clamp( ( m - 72 ) / 10 ) * 0.6,
		} ) );
		if (
			out.length === 2 &&
			Math.abs( out[ 0 ].female - out[ 1 ].female ) < 0.5
		) {
			const [ lo, hi ] =
				middles[ 0 ] <= middles[ 1 ]
					? [ out[ 0 ], out[ 1 ] ]
					: [ out[ 1 ], out[ 0 ] ];
			if ( hi.female >= 0.5 ) {
				lo.female = clamp( hi.female - 0.6 );
				hi.child = Math.max( hi.child, 0.25 );
			} else {
				hi.female = clamp( lo.female + 0.6 );
			}
		}
		return out.map( ( b ) => ( {
			female: Math.round( b.female * 100 ) / 100,
			child: Math.round( b.child * 100 ) / 100,
		} ) );
	}

	scope.riffChimeraVoice = { load, syllables, plan, bodies, Voice, AH };
} )( globalThis );
