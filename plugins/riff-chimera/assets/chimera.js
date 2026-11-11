/* Riff Chimera: fills the Chimera view of Now Playing, registered on the server as Riff registers
 * its own (riff_register_view()). The track's melody is Riff Sing's, read from its riff_sing_melody
 * or riff_sing_midi field on the media REST route; once the listener presses Sing along, CHIMERA
 * sings it with the recording, following the song through play, pause, seek and speed. A duet's two
 * singers (UltraStar's P1 and P2, and P3's lines for both) are two CHIMERAs, each with its own body,
 * its own cutaway head singing on screen and its own Solo.
 *
 * It listens to the player's riff:view, riff:pause and riff:ended events, which Riff dispatches on
 * its own element for any script, and reads where the song is and how fast it plays through
 * window.riff.time(), window.riff.playing() and window.riff.speed(). It needs nothing loaded before
 * it but melody.js and midi.js (copies of Riff Sing's, kept the same by
 * .github/scripts/riff-chimera.test.js), voice.js and wp-a11y.
 *
 * CHIMERA's engine, its AudioWorklet and its pronouncing dictionary are fetched the first time the
 * view opens, never with the page. The voices have an AudioContext of their own, made at the
 * listener's press, so the player's own audio and its meters are left as they are. They stop when
 * the listener presses Stop, leaves the view, closes Now Playing, the track changes or the page is
 * hidden. */
( () => {
	const config = window.riffChimera || {};
	const melody = window.riffSingMelody;
	const V = window.riffChimeraVoice;
	if ( ! melody || ! V ) {
		return;
	}
	// The most CHIMERAs sung at once: each is a whole simulated airway on the audio thread.
	const MAX_VOICES = 2;
	const player = () =>
		typeof window.riff?.time === 'function' ? window.riff : null;
	const speak = ( text ) => window.wp?.a11y?.speak?.( text, 'polite' );
	const fill = ( text, ...args ) =>
		args.reduce( ( s, a ) => s.replace( '%s', a ), String( text || '' ) );
	const canSing = () =>
		typeof window.AudioWorkletNode === 'function' &&
		typeof window.WebAssembly?.compile === 'function';

	// A track's chart, from Riff Sing's fields: its typed melody, or failing that its MIDI file's
	// vocal track, with whether CHIMERA can read its words. An empty string for none, null for one
	// that can't be read.
	const cache = new Map();
	function chartFor( track ) {
		const id = Number( track?.id );
		if ( ! Number.isInteger( id ) || id <= 0 ) {
			return Promise.resolve( '' );
		}
		if ( ! cache.has( id ) ) {
			const url = new URL( String( id ), config.media );
			url.searchParams.set(
				'_fields',
				'riff_sing_melody,riff_sing_midi'
			);
			const ok = ( r ) => {
				if ( ! r.ok ) {
					throw new Error( String( r.status ) );
				}
				return r;
			};
			const asked = fetch( url, {
				credentials: 'same-origin',
				headers: {
					Accept: 'application/json',
					...( config.nonce ? { 'X-WP-Nonce': config.nonce } : {} ),
				},
			} )
				.then( ( r ) => ok( r ).json() )
				.then( ( data ) => {
					const text = String( data?.riff_sing_melody || '' );
					if ( text.trim() ) {
						const chart = melody.parse( text );
						return chart && { chart, ...reading( chart, text ) };
					}
					const file = String( data?.riff_sing_midi || '' );
					if ( ! file || ! window.riffSingMidi ) {
						return '';
					}
					return fetch( file, { credentials: 'same-origin' } )
						.then( ( r ) => ok( r ).arrayBuffer() )
						.then( ( bytes ) => {
							const chart = window.riffSingMidi.read( bytes );
							return chart && { chart, ...reading( chart, '' ) };
						} );
				} );
			asked.catch( () => cache.delete( id ) );
			cache.set( id, asked );
		}
		return cache.get( id );
	}

	// Whether CHIMERA can read a chart's words: English and Korean it can. A chart that names
	// another language, or whose words are in another script, is sung on "ah", and the view says so.
	function reading( chart, text ) {
		const named =
			( /^#LANGUAGE:(.*)$/im.exec( text ) || [] )[ 1 ]?.trim() || '';
		if (
			named &&
			! /^(english|en|eng|korean|ko|kor|한국어)$/i.test( named )
		) {
			return { words: false, why: fill( config.language, named ) };
		}
		const words = ( chart.singers || [ chart ] )
			.flatMap( ( s ) =>
				s.phrases.flatMap( ( p ) =>
					p.notes.map( ( n ) => n.text || '' )
				)
			)
			.join( '' );
		if (
			/[^\p{Script=Latin}\p{Script=Hangul}\p{Script=Common}\p{Script=Inherited}]/u.test(
				words
			)
		) {
			return { words: false, why: config.script };
		}
		return { words: true, why: '' };
	}

	// CHIMERA's engine, fetched once, the first time the view opens.
	let engine = null;
	const wake = () => {
		engine ??= V.load( {
			bundle: config.bundle,
			wasm: config.wasm,
			dict: config.dict,
		} );
		engine.catch( () => ( engine = null ) );
		return engine;
	};

	let showing = false;
	let shown = null; // The track the view was drawn for.
	let ui = null;
	let parts = []; // Each singer: {name, phrases, notes, body, voice, head, ui}.
	let ctx = null;
	let on = false; // The listener has pressed Sing along and not Stop.
	let frame = 0;
	let level = 0.8;
	let solo = -1; // The singer heard alone among the voices, or -1 for all of them.
	let last = { time: -1, at: 0, frame: 0 };
	let token = 0; // Bumped by every new drawing: a slower answer for an old track gives up.

	// A face singing, what the empty panel shows, decoration beside its words.
	const ICON =
		'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9.5 19.25V16.5H7.75A1.75 1.75 0 0 1 6 14.75V12.5L4.75 12L6 9.25A5.25 5.25 0 0 1 11.25 4.75H11.5A4.75 4.75 0 0 1 14 13.6V19.25"/><path d="M17 8.75C17.8 9.6 17.8 11.4 17 12.25M19.25 7C20.75 8.75 20.75 12.25 19.25 14"/></svg>';

	const el = ( tag, cls, text ) => {
		const e = document.createElement( tag );
		if ( cls ) {
			e.className = cls;
		}
		if ( text !== undefined ) {
			e.textContent = text;
		}
		return e;
	};
	const button = ( cls, text ) => {
		const b = el( 'button', `riff-chimera-button ${ cls }`.trim(), text );
		b.type = 'button';
		return b;
	};

	// Nothing to sing: one quiet message in the middle of the panel, as Riff Sing has it.
	function say( where, text ) {
		ui = null;
		parts = [];
		const box = el( 'div', 'riff-chimera-empty' );
		box.innerHTML = ICON;
		box.append( el( 'p', 'riff-chimera-message', text ) );
		where.replaceChildren( box );
	}

	// The view for a track: a head for each singer with its words and Solo, the press that starts
	// the voices and their level, and where CHIMERA comes from.
	function build( where, found ) {
		const singers = found.chart.singers?.length
			? found.chart.singers
			: [ found.chart ];
		const root = el( 'div', 'riff-chimera' );
		root.dataset.state = 'idle';
		const heads = el( 'div', 'riff-chimera-heads' );
		parts = singers.slice( 0, MAX_VOICES ).map( ( s, i ) => {
			const box = el( 'div', 'riff-chimera-singer' );
			const canvas = el( 'canvas' );
			canvas.setAttribute( 'role', 'img' );
			const name =
				s.name ||
				( singers.length > 1
					? fill( config.singer, String( i + 1 ) )
					: '' );
			canvas.setAttribute(
				'aria-label',
				name ? `${ config.head } ${ name }` : config.head
			);
			const head = el( 'div', 'riff-chimera-head' );
			head.append( canvas );
			const line = el( 'div', 'riff-chimera-line' );
			const words = el( 'p', 'riff-chimera-words' );
			line.append( words );
			if ( singers.length > 1 ) {
				const alone = button( 'riff-chimera-solo', config.solo );
				alone.setAttribute( 'aria-pressed', 'false' );
				alone.setAttribute(
					'aria-label',
					fill( config.soloName, name )
				);
				alone.addEventListener( 'click', () => {
					solo = solo === i ? -1 : i;
					levels();
				} );
				line.prepend( el( 'p', 'riff-chimera-name', name ) );
				line.append( alone );
			}
			box.append( head, line );
			heads.append( box );
			const mid = ( s.low + s.high ) / 2;
			return {
				name,
				source: s.phrases,
				mid,
				phrases: [],
				notes: [],
				voice: null,
				head: null,
				ui: {
					canvas,
					words,
					solo: line.querySelector( '.riff-chimera-solo' ),
					phrase: -1,
				},
			};
		} );
		V.bodies( parts.map( ( p ) => p.mid ) ).forEach(
			( b, i ) => ( parts[ i ].body = b )
		);
		const controls = el( 'div', 'riff-chimera-controls' );
		const start = button( 'is-primary', config.start );
		const stop = button( '', config.stop );
		stop.hidden = true;
		const field = el( 'label', 'riff-chimera-field' );
		const range = el( 'input' );
		Object.assign( range, {
			type: 'range',
			min: '0',
			max: '100',
			step: '1',
			value: String( Math.round( level * 100 ) ),
		} );
		field.append( el( 'span', '', config.level ), range );
		controls.append( start, stop, field );
		const status = el( 'p', 'riff-chimera-status' );
		const more =
			singers.length > MAX_VOICES
				? fill( config.more, String( MAX_VOICES ) )
				: '';
		const notes = [
			config.intro,
			config.private,
			found.why,
			more,
			config.alone,
		]
			.filter( Boolean )
			.map( ( t ) => el( 'p', 'riff-chimera-note', t ) );
		const credit = el( 'p', 'riff-chimera-note' );
		const link = el( 'a', '', config.credit );
		link.href = config.source;
		link.rel = 'noopener';
		credit.append( link );
		root.append( heads, controls, status, ...notes, credit );
		root.classList.toggle( 'is-duet', parts.length > 1 );
		where.replaceChildren( root );
		start.addEventListener( 'click', () => begin() );
		stop.addEventListener( 'click', () => end( config.stopped ) );
		range.addEventListener( 'input', () => {
			level = Number( range.value ) / 100;
			levels();
		} );
		ui = { root, start, stop, status };
	}

	// Each voice's level: the listener's, for every voice or for the one heard alone.
	function levels() {
		parts.forEach( ( p, i ) => {
			p.ui.solo?.setAttribute( 'aria-pressed', String( solo === i ) );
			if ( p.voice ) {
				p.voice.out.gain.setTargetAtTime(
					solo < 0 || solo === i ? level : 0,
					ctx.currentTime,
					0.02
				);
			}
		} );
	}

	function state( name, text ) {
		if ( ! ui ) {
			return;
		}
		ui.root.dataset.state = name;
		ui.start.hidden =
			name === 'singing' || name === 'waiting' || name === 'loading';
		ui.stop.hidden = ! ui.start.hidden;
		if ( text !== undefined ) {
			ui.status.textContent = text;
			speak( text );
		}
	}

	// The view, drawn as it opens and again as the track changes while it is open.
	function show( where, track ) {
		const mine = ++token;
		end();
		shown = track;
		if ( ! track ) {
			return say( where, config.idle );
		}
		if ( ! canSing() ) {
			return say( where, config.failed );
		}
		chartFor( track ).then(
			( found ) => {
				if ( mine !== token ) {
					return;
				}
				if ( found === '' ) {
					return say( where, config.none );
				}
				if ( ! found ) {
					return say( where, config.broken );
				}
				build( where, found );
				wake().then(
					( e ) => {
						if ( mine !== token ) {
							return;
						}
						parts.forEach( ( p, i ) => {
							p.phrases = V.syllables(
								e.call,
								p.source,
								found.words
							);
							p.notes = p.phrases.flatMap( ( ph ) => ph.notes );
							// The second of two heads faces the first, as CHIMERA's duet page has them.
							p.head = e.head(
								p.ui.canvas,
								p.body,
								48000,
								i === 1 ? -1 : 1
							);
						} );
						ui.root.dataset.ready = 'true';
					},
					() => mine === token && state( 'idle', config.failed )
				);
				loop();
			},
			() => mine === token && say( where, config.error )
		);
	}

	// The listener's press: the voices' own AudioContext, a worklet for each singer, and each
	// singer's part handed to their CHIMERA.
	async function begin() {
		const mine = token;
		state( 'loading', config.loading );
		try {
			ctx ??= new AudioContext( { latencyHint: 'interactive' } );
			await ctx.resume();
			const e = await wake();
			for ( const p of parts ) {
				if ( mine !== token ) {
					return;
				}
				p.voice = new V.Voice( e, ctx, config.worklet );
				p.voice.out.gain.value = 0;
				await p.voice.start( ctx.destination );
				p.voice.melody( p.phrases, p.body );
			}
			if ( mine !== token ) {
				return;
			}
			levels();
			on = true;
			last = { time: -1, at: 0, frame: 0 };
			const playing = !! player()?.playing();
			state(
				playing ? 'singing' : 'waiting',
				playing ? config.singing : config.waiting
			);
			loop();
		} catch {
			stopVoices();
			state( 'idle', config.failed );
		}
	}

	function stopVoices() {
		for ( const p of parts ) {
			p.voice?.close();
			p.voice = null;
		}
	}

	// The voices stop and let go of their worklets; the context sleeps until the next press.
	function end( text ) {
		const was = on;
		on = false;
		stopVoices();
		if ( ctx?.state === 'running' ) {
			ctx.suspend().catch( () => {} );
		}
		if ( ui ) {
			state( 'idle', was && text ? text : undefined );
			ui.root.dataset.sounding = 'false';
		}
	}

	// Once a frame while the view shows: the voices kept with the song, and the heads drawn.
	function loop() {
		if ( frame || ! showing ) {
			return;
		}
		const tick = ( now ) => {
			frame = 0;
			if ( ! showing || ! ui ) {
				return;
			}
			const dt = last.frame
				? Math.min( 0.05, ( now - last.frame ) / 1000 )
				: 0.016;
			last.frame = now;
			follow();
			draw( dt );
			frame = window.requestAnimationFrame( tick );
		};
		frame = window.requestAnimationFrame( tick );
	}

	function follow() {
		const r = player();
		if ( ! on || ! r ) {
			return;
		}
		if ( parts.some( ( p ) => p.voice?.failed ) ) {
			end();
			return state( 'idle', config.stalled );
		}
		const time = r.time();
		const now = performance.now();
		if ( time !== last.time ) {
			last.time = time;
			last.at = now;
		}
		// Playing and moving: the voices follow. Paused, or waiting on the network with the song held
		// still, they are quiet until the song moves again.
		const moving = r.playing() && now - last.at < 250;
		const rate = Number( player().speed() ) || 1;
		for ( const p of parts ) {
			if ( moving ) {
				p.voice?.follow( time, rate );
			} else if ( p.voice?.anchor || p.voice?.pending ) {
				p.voice.silence();
			}
		}
		const name = moving ? 'singing' : 'waiting';
		if ( ui.root.dataset.state !== name ) {
			state( name, moving ? config.singing : config.waiting );
		}
		ui.root.dataset.sounding = String(
			parts.some( ( p ) => ( p.voice?.state?.outRms || 0 ) > 1e-4 )
		);
		// How much of the audio thread's time the busiest CHIMERA takes, as its worklet measures it.
		ui.root.dataset.load = String(
			Math.max(
				0,
				...parts.map( ( p ) => p.voice?.message?.load || 0 )
			).toFixed( 2 )
		);
	}

	// Each singer's head, from their CHIMERA's telemetry (at rest before it sings), and the words of
	// the phrase they are on, lit as they are sung.
	function draw( dt ) {
		const time = player()?.time() ?? 0;
		for ( const p of parts ) {
			p.head?.draw( p.voice?.message ?? null, dt );
			let k = p.phrases.findIndex( ( ph ) => time < ph.end );
			if ( k < 0 ) {
				k = p.phrases.length - 1;
			}
			if ( k !== p.ui.phrase ) {
				p.ui.phrase = k;
				p.ui.words.replaceChildren(
					...( p.phrases[ k ]?.notes || [] )
						.filter( ( n ) => n.text )
						.map( ( n ) => {
							const s = el(
								'span',
								'riff-chimera-syllable',
								n.text
							);
							s.dataset.start = String( n.start );
							return s;
						} )
				);
			}
			for ( const s of p.ui.words.children ) {
				s.classList.toggle(
					'is-sung',
					Number( s.dataset.start ) <= time
				);
			}
		}
	}

	document.addEventListener( 'riff:view', ( e ) => {
		if ( e.detail?.id !== 'chimera' ) {
			return;
		}
		showing = !! e.detail.open;
		if ( showing ) {
			if ( ! ui || e.detail.track?.id !== shown?.id ) {
				show( e.detail.view, e.detail.track );
			}
			loop();
		} else {
			token++;
			end();
			shown = null;
			ui = null;
			parts = [];
		}
	} );
	// The Chimera button only for a track Riff Sing marked as having a melody (riff_track).
	const fit = () =>
		player()?.view( 'chimera', { shown: ( track ) => !! track?.melody } );
	if ( player() ) {
		fit();
	} else {
		document.addEventListener( 'riff:ready', fit, { once: true } );
	}
	const hush = () => parts.forEach( ( p ) => p.voice?.silence() );
	document.addEventListener( 'riff:pause', hush );
	document.addEventListener( 'riff:ended', hush );
	document.addEventListener( 'visibilitychange', () => {
		if ( document.hidden ) {
			end( config.stopped );
		}
	} );
	window.addEventListener( 'pagehide', () => end() );
} )();
