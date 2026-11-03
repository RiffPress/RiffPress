/* Riff Sing: fills the Sing view of Now Playing, registered on the server as Riff registers its own
 * (riff_register_view()). The song's melody, from the track's Melody field
 * through the media REST route, scrolls past as a lane of notes with its words under it; once the
 * listener asks, their voice is drawn against it and each line is scored as it ends. A duet has a
 * lane for each of its two singers, each with its own microphone or MIDI input and its own score.
 * Where Riff Lyrics is active and the track has timed lyrics, the words under a lone singer's lane
 * are Riff Lyrics' lines at Riff Lyrics' times, read from its riff_lyrics field on the same media
 * route; without them, or in a duet, whose lyrics don't say who sings which line, they are the
 * melody's own syllables.
 *
 * It listens to the player's riff:view, riff:time, riff:play and riff:ended events, which
 * Riff dispatches on its own element for any script, and reads where the song is through
 * window.riff.time(). riff:time and the lane's time come through timing.js, which it shares with
 * Riff Lyrics and Riff Chords; it needs nothing loaded before it but timing.js, melody.js, midi.js
 * and wp-a11y.
 *
 * The microphone is opened only when the listener presses Sing with the microphone, and closed when
 * they press Stop, leave the view, close Now Playing or leave the page. Its sound goes to an
 * AudioWorklet (pitch.js) that works out the note and passes on nothing but that: no sound is kept,
 * and nothing is sent anywhere. A MIDI instrument or a pitch-to-MIDI microphone, through Web MIDI
 * where the browser has it, gives the note exactly. */
( () => {
	const config = window.riffSing || {};
	const melody = window.riffSingMelody;
	const timing = window.riffTiming; // timing.js, loaded before it.
	if ( ! melody ) {
		return;
	}
	const cache = new Map();
	const reduced = window.matchMedia?.( '(prefers-reduced-motion: reduce)' );
	// How far behind the song a sung note reaches the scorer: the room, the microphone and the
	// detector's window for a voice, almost nothing for MIDI.
	const LATENCY = { mic: 0.1, midi: 0.02 };
	const LEVELS = [ 200, 100, 50 ];

	let showing = false;
	let visible = false;
	let turn = 0; // So a slow answer for an earlier track cannot replace the current one's.
	let chart = null;
	// Each singer: their part of the chart, its scorer, their lane and controls, and what they sing
	// into. One, or a duet's two.
	let parts = [];
	let ui = null; // The panel while a chart is showing.
	let frame = 0;
	let tolerance = 100;
	try {
		const saved = Number( window.localStorage?.getItem( 'riff-sing-tolerance' ) );
		tolerance = LEVELS.includes( saved ) ? saved : 100;
	} catch {
		// Storage can be off; the default stands.
	}
	// Web MIDI, asked for once and shared by the singers who use it, each listening to an input; and
	// the browser's answer while it is still coming, so two singers starting at once share it too.
	let midi = null;
	let askingMidi = null;

	// Until the player starts, window.riff is the #riff element, by its id.
	const player = () => ( typeof window.riff?.time === 'function' ? window.riff : null );
	// What is said at one moment is said together: the live region keeps only the last thing put in
	// it, so a duet's two singers ending a line at once, or the song's end, would lose all but one.
	let saying = [];
	let sayTimer = 0;
	const speak = ( text ) => {
		saying.push( text );
		sayTimer ||= window.setTimeout( () => {
			const all = saying.join( ' ' );
			saying = [];
			sayTimer = 0;
			window.wp?.a11y?.speak?.( all, 'polite' );
		}, 100 );
	};
	// %1$s, %2$s and %s in a translated string, and %% as a percent sign.
	const fill = ( template, ...args ) => {
		let n = 0;
		return String( template || '' )
			.replace( /%(?:(\d)\$)?s/g, ( _, i ) => String( args[ i ? i - 1 : n++ ] ?? '' ) )
			.replace( /%%/g, '%' );
	};
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

	const canMic = () =>
		window.isSecureContext &&
		typeof navigator.mediaDevices?.getUserMedia === 'function' &&
		typeof window.AudioWorkletNode === 'function' &&
		typeof ( window.AudioContext || window.webkitAudioContext ) === 'function';
	const canMidi = () => window.isSecureContext && typeof navigator.requestMIDIAccess === 'function';
	const duet = () => parts.length > 1;
	// A singer's name, as the chart gives it or by their number.
	const nameOf = ( part ) => part.name || fill( config.singer, part.index + 1 );

	// The chart for a track that is a Media Library file: its typed melody, or failing that its
	// MIDI file's vocal track, with the track's timed lyrics, where Riff Lyrics gives them, as its
	// `lyrics`. An empty string for none, null for one that can't be read.
	function melodyFor( track ) {
		const id = Number( track?.id );
		if ( ! Number.isInteger( id ) || id <= 0 ) {
			return Promise.resolve( '' );
		}
		if ( ! cache.has( id ) ) {
			const url = new URL( String( id ), config.media );
			// riff_lyrics is Riff Lyrics' field, and left out by the route when it isn't active.
			url.searchParams.set( '_fields', 'riff_sing_melody,riff_sing_midi,riff_lyrics' );
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
				.then( ( data ) => {
					const timed = timing.lyrics( data?.riff_lyrics );
					const withWords = ( found ) => {
						if ( found && timed ) {
							found.lyrics = timed;
						}
						return found;
					};
					const text = String( data?.riff_sing_melody || '' );
					if ( text.trim() ) {
						return withWords( melody.parse( text ) );
					}
					const file = String( data?.riff_sing_midi || '' );
					if ( ! file || ! window.riffSingMidi ) {
						return '';
					}
					return fetch( file, { credentials: 'same-origin' } )
						.then( ( r ) => {
							if ( ! r.ok ) {
								throw new Error( String( r.status ) );
							}
							return r.arrayBuffer();
						} )
						.then( ( bytes ) => withWords( window.riffSingMidi.read( bytes ) ) );
				} );
			asked.catch( () => cache.delete( id ) );
			cache.set( id, asked );
		}
		return cache.get( id );
	}

	// A microphone under a note: what the empty panel shows, decoration beside its words.
	const ICON =
		'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg>';

	// The panel with nothing to sing: its message in the middle, and for someone who can edit the
	// Media Library, the way to the track's Melody field.
	function say( where, text, id = 0 ) {
		endAll();
		ui = null;
		parts = [];
		const box = el( 'div', 'riff-sing-empty' );
		box.innerHTML = ICON;
		box.append( el( 'p', 'riff-sing-message', text || '' ) );
		if ( id > 0 && config.edit ) {
			const add = el( 'a', 'riff-sing-add', config.add || '' );
			add.href = config.edit + id;
			box.append( add );
		}
		// Focus on a control that goes stays in the panel, never dropped to the page behind.
		const had = where.contains( document.activeElement );
		where.replaceChildren( box );
		if ( had ) {
			where.focus();
		}
	}

	function button( text, className, onClick ) {
		const b = el( 'button', `riff-sing-button ${ className }`, text );
		b.type = 'button';
		b.addEventListener( 'click', onClick );
		return b;
	}

	function select( label, className, onChange ) {
		const wrap = el( 'label', 'riff-sing-field' );
		wrap.append( el( 'span', '', label ) );
		const field = el( 'select', className );
		field.addEventListener( 'change', () => onChange( field.value ) );
		wrap.append( field );
		return { wrap, field };
	}

	// A singer's lane, words, score and controls. In a duet each is a group named for its singer,
	// so their two Sing buttons are told apart.
	function lane( part ) {
		const box = el( 'div', 'riff-sing-part' );
		const singer = el( 'p', 'riff-sing-singer' );
		if ( duet() ) {
			box.setAttribute( 'role', 'group' );
			box.append( singer );
		}
		const strip = el( 'div', 'riff-sing-lane' );
		const canvas = el( 'canvas' );
		// Drawn, so a screen reader is given the words and the scores as text below instead.
		canvas.setAttribute( 'aria-hidden', 'true' );
		strip.append( canvas );
		const words = el( 'p', 'riff-sing-words' );
		const result = el( 'p', 'riff-sing-result' );
		const controls = el( 'div', 'riff-sing-controls' );
		const mic = button( config.mic, 'is-primary', () => startMic( part ) );
		const keys = button( config.midi, '', () => startMidi( part ) );
		const stop = button( config.stop, '', () => end( part, config.stopped ) );
		const input = select( config.input, 'riff-sing-input', ( id ) => startMic( part, id ) );
		const port = select( config.midiInput, 'riff-sing-port', ( id ) => {
			if ( part.session?.kind === 'midi' ) {
				part.session.port = id;
				part.session.chosen = true;
				part.session.held.length = 0;
				part.session.bend = 0;
			}
		} );
		controls.append( mic, keys, stop, input.wrap, port.wrap );
		const status = el( 'p', 'riff-sing-status' );
		box.append( strip, words, result, controls, status );
		part.ui = { box, singer, canvas, words, result, controls, mic, midi: keys, stop, input, port, status, colors: null };
		part.phraseShown = null;
		named( part );
		return box;
	}

	// A duet's group and its heading say the singer's name, again when the next duet names others.
	function named( part ) {
		if ( duet() && part.ui ) {
			part.ui.box.setAttribute( 'aria-label', nameOf( part ) );
			part.ui.singer.textContent = nameOf( part );
		}
	}

	// The lanes, the words, the scores and the controls, for a chart.
	function build( where ) {
		const singers = chart.singers || [ chart ];
		// The next song with the panel already up and as many singers: the lanes and the words
		// change, and the controls, the listening, focus and the last score stay as they are.
		if ( ui?.root.parentElement === where && parts.length === singers.length ) {
			parts.forEach( ( part, i ) => {
				part.name = singers[ i ].name || '';
				part.chart = singers[ i ];
				part.scorer = melody.scorer( singers[ i ], { tolerance } );
				part.trail = [];
				part.phraseShown = null;
				named( part );
				update( part );
			} );
			draw();
			return;
		}
		// From one singer to two, or back: the lanes are new, so the listening stops and says so.
		endAll( config.stopped );
		parts = singers.map( ( singer, index ) => ( {
			index,
			name: singer.name || '',
			chart: singer,
			scorer: melody.scorer( singer, { tolerance } ),
			session: null,
			starting: false,
			// Each start, so one the listener walked away from while the browser asked is let go:
			// end() moves it on, and a start that comes back to a different number releases it.
			attempt: 0,
			trail: [], // What was sung lately, each { t, note }, for the lane.
			phraseShown: null,
			ui: null,
		} ) );
		const root = el( 'div', `riff-sing${ duet() ? ' is-duet' : '' }` );
		const row = el( 'div', 'riff-sing-singers' );
		row.append( ...parts.map( lane ) );
		root.append( row );
		const level = select( config.level, 'riff-sing-level', ( value ) => {
			tolerance = Number( value ) || 100;
			parts.forEach( ( part ) => ( part.scorer.tolerance = tolerance ) );
			try {
				window.localStorage?.setItem( 'riff-sing-tolerance', String( tolerance ) );
			} catch {
				// Kept for this page only.
			}
		} );
		( config.levels || [] ).forEach( ( name, i ) => {
			const option = el( 'option', '', name );
			option.value = String( LEVELS[ i ] );
			option.selected = LEVELS[ i ] === tolerance;
			level.field.append( option );
		} );
		// How close counts is for everyone: one singer's with their controls, under a duet's lanes.
		if ( duet() ) {
			const shared = el( 'div', 'riff-sing-controls' );
			shared.append( level.wrap );
			root.append( shared );
		} else {
			parts[ 0 ].ui.controls.append( level.wrap );
		}
		root.append( el( 'p', 'riff-sing-note', config.intro || '' ), el( 'p', 'riff-sing-note', config.private || '' ) );
		const had = where.contains( document.activeElement );
		where.replaceChildren( root );
		if ( had ) {
			where.focus();
		}
		ui = { root };
		watch( root );
		parts.forEach( update );
		draw();
	}

	// A singer's controls as their listening stands: what can be started, what can be stopped.
	function update( part ) {
		if ( ! part.ui ) {
			return;
		}
		const { ui: u, session } = part;
		const on = !! session;
		u.mic.hidden = on || ! canMic();
		u.midi.hidden = on || ! canMidi();
		u.stop.hidden = ! on;
		u.mic.disabled = part.starting;
		u.midi.disabled = part.starting;
		u.input.wrap.hidden = session?.kind !== 'mic' || u.input.field.options.length < 2;
		u.port.wrap.hidden = session?.kind !== 'midi' || u.port.field.options.length < 2;
		if ( ! on && ! canMic() && ! u.status.textContent ) {
			u.status.textContent = canMidi() ? config.noMic : config.unsupported;
		}
	}

	function tell( part, text, announce = true ) {
		if ( part.ui ) {
			part.ui.status.textContent = text || '';
		}
		if ( announce && text ) {
			speak( duet() ? `${ nameOf( part ) }: ${ text }` : text );
		}
	}

	// Stops the panel's drawing while it can't be seen, and the listening with it: the microphone is
	// never left open behind a closed Now Playing.
	let observer = null;
	function watch( root ) {
		observer?.disconnect();
		if ( typeof window.IntersectionObserver !== 'function' ) {
			visible = true;
			return;
		}
		observer = new IntersectionObserver( ( entries ) => {
			visible = entries[ entries.length - 1 ].isIntersecting;
			if ( visible ) {
				loop();
			} else {
				endAll( config.stopped );
			}
		} );
		observer.observe( root );
	}

	async function show( where, track ) {
		if ( ! where ) {
			return;
		}
		const mine = ++turn;
		chart = null;
		parts.forEach( ( part ) => {
			part.trail = [];
		} );
		if ( ! track ) {
			say( where, config.idle );
			return;
		}
		try {
			const found = await melodyFor( track );
			if ( mine !== turn ) {
				return;
			}
			if ( found === '' ) {
				say( where, config.none, Number( track.id ) );
				return;
			}
			chart = found;
			if ( ! chart ) {
				say( where, config.broken, Number( track.id ) );
				return;
			}
			build( where );
		} catch {
			if ( mine === turn ) {
				say( where, config.error );
			}
		}
	}

	// What a singer is heard singing, many times a second, from either source: a note or null.
	function heard( part, note ) {
		if ( ! part.session ) {
			return;
		}
		part.session.note = note;
		if ( ! chart || ! player()?.playing() ) {
			return;
		}
		const t = player().time() - LATENCY[ part.session.kind ];
		part.trail.push( { t, note } );
		while ( part.trail.length && part.trail[ 0 ].t < t - 8 ) {
			part.trail.shift();
		}
		for ( const done of part.scorer.add( t, note ) ) {
			report( part, done.score );
		}
	}

	function percent( score ) {
		return Math.round( score * 100 );
	}

	function report( part, score ) {
		const word = config.grades?.[ melody.grade( score ) ] || '';
		const total = part.scorer.total();
		const line = fill( config.line, word, percent( score ) );
		const song = total === null ? '' : fill( config.song, percent( total ) );
		if ( part.ui ) {
			part.ui.result.textContent = `${ line } ${ song }`.trim();
		}
		speak( duet() ? `${ nameOf( part ) }: ${ line }` : line );
	}

	async function startMic( part, deviceId = '' ) {
		if ( part.starting || ! canMic() ) {
			return;
		}
		end( part );
		const mine = ++part.attempt;
		const left = () => mine !== part.attempt || ! showing || ! parts.includes( part );
		part.starting = true;
		update( part );
		tell( part, config.asking, false );
		let stream = null;
		let ctx = null;
		try {
			// A duet's second singer starts on a microphone the first isn't using, where there is one:
			// another device, not the first's under another name, such as the browser's default.
			let device = deviceId;
			if ( ! device && duet() ) {
				const taken = parts.map( ( p ) => p.session?.kind === 'mic' && p.session.group ).filter( Boolean );
				const list = taken.length
					? await navigator.mediaDevices.enumerateDevices?.().catch( () => [] )
					: [];
				device =
					( list || [] ).find(
						( d ) => d.kind === 'audioinput' && d.deviceId && d.groupId && ! taken.includes( d.groupId )
					)?.deviceId || '';
			}
			stream = await navigator.mediaDevices.getUserMedia( {
				audio: {
					...( device ? { deviceId: { exact: device } } : {} ),
					// The song from the speakers would be heard as singing; headphones are better still.
					echoCancellation: true,
					// A voice's own shape is what the detector reads, so it is left as it comes.
					noiseSuppression: false,
					autoGainControl: false,
				},
				video: false,
			} );
			// The view was left while the browser asked: the microphone is let go at once.
			if ( left() ) {
				throw new DOMException( 'The Sing view was left', 'AbortError' );
			}
			const Context = window.AudioContext || window.webkitAudioContext;
			ctx = new Context();
			await ctx.audioWorklet.addModule( config.worklet );
			const node = new window.AudioWorkletNode( ctx, 'riff-sing-pitch' );
			const mute = ctx.createGain();
			mute.gain.value = 0;
			// Through a silent gain to the output, so the browser runs the worklet; nothing is heard.
			ctx.createMediaStreamSource( stream ).connect( node ).connect( mute ).connect( ctx.destination );
			if ( ctx.state === 'suspended' ) {
				await ctx.resume().catch( () => {} );
			}
			if ( left() ) {
				throw new DOMException( 'The Sing view was left', 'AbortError' );
			}
			node.port.onmessage = ( e ) => {
				const { hz = 0, clarity = 0 } = e.data || {};
				heard( part, hz > 0 && clarity > 0.5 ? melody.midi( hz ) : null );
			};
			const track = stream.getAudioTracks()[ 0 ];
			track?.addEventListener( 'ended', () => end( part, config.lost ) );
			const settings = track?.getSettings?.() || {};
			part.session = { kind: 'mic', stream, ctx, node, note: null, device: settings.deviceId || device, group: settings.groupId || '' };
			part.starting = false;
			tell( part, config.listening );
			loop();
			// Named now that the browser may say their names; the list can come after the listening.
			inputs( part );
		} catch ( error ) {
			stream?.getTracks().forEach( ( t ) => t.stop() );
			ctx?.close().catch( () => {} );
			const name = error?.name || '';
			if ( mine !== part.attempt ) {
				// Another start, or an end, has taken over.
				return;
			}
			part.starting = false;
			if ( left() ) {
				tell( part, '', false );
			} else if ( name === 'NotAllowedError' || name === 'SecurityError' ) {
				tell( part, config.denied );
			} else if ( name === 'NotFoundError' || name === 'OverconstrainedError' ) {
				tell( part, config.missing );
			} else if ( name === 'NotReadableError' || name === 'AbortError' ) {
				tell( part, config.busy );
			} else {
				tell( part, config.failed );
			}
		}
		update( part );
	}

	// The microphones to choose from, named now that the browser may say their names.
	async function inputs( part ) {
		if ( ! part.ui || part.session?.kind !== 'mic' || typeof navigator.mediaDevices.enumerateDevices !== 'function' ) {
			return;
		}
		const current = part.session.device;
		const list = ( await navigator.mediaDevices.enumerateDevices().catch( () => [] ) ).filter(
			( d ) => d.kind === 'audioinput' && d.deviceId
		);
		if ( ! part.ui ) {
			return;
		}
		part.ui.input.field.replaceChildren(
			...list.map( ( d, i ) => {
				const option = el( 'option', '', d.label || fill( config.unnamed, i + 1 ) );
				option.value = d.deviceId;
				option.selected = d.deviceId === current;
				return option;
			} )
		);
		update( part );
	}

	// Each MIDI input's notes go to the singers listening to it: on their own, to any input; in a
	// duet, to the one they chose.
	function route( key, e ) {
		for ( const part of parts ) {
			const s = part.session;
			if ( s?.kind !== 'midi' || ( s.port && s.port !== key ) ) {
				continue;
			}
			const [ code = 0, a = 0, b = 0 ] = e.data || [];
			const kind = code & 0xf0;
			const at = s.held.indexOf( a );
			if ( kind === 0x90 && b > 0 ) {
				if ( at >= 0 ) {
					s.held.splice( at, 1 );
				}
				s.held.push( a );
			} else if ( ( kind === 0x80 || kind === 0x90 ) && at >= 0 ) {
				s.held.splice( at, 1 );
			} else if ( kind === 0xe0 ) {
				// Pitch bend, two semitones either way, as a pitch-to-MIDI microphone sends it.
				s.bend = ( ( ( ( b << 7 ) | a ) - 8192 ) / 8192 ) * 2;
			}
		}
	}

	// The inputs bound to route(), and each MIDI singer's choice of them and what they are told.
	function bind() {
		if ( ! midi ) {
			return;
		}
		const keys = [];
		midi.access.inputs.forEach( ( input, key ) => {
			keys.push( key );
			input.onmidimessage = ( e ) => route( key, e );
		} );
		parts.forEach( ( part ) => {
			const s = part.session;
			if ( s?.kind !== 'midi' ) {
				return;
			}
			if ( duet() && ( ! s.chosen || ! keys.includes( s.port ) ) ) {
				// The first singer the first input, the second the second, while there are two, and
				// again as inputs come and go, until the singer chooses one.
				s.chosen = s.chosen && keys.includes( s.port );
				const port = keys[ Math.min( part.index, keys.length - 1 ) ] || '';
				// A key held on the input left behind would never be let go.
				if ( port !== s.port ) {
					s.port = port;
					s.held.length = 0;
					s.bend = 0;
				}
			}
			const field = part.ui?.port.field;
			if ( field && duet() ) {
				field.replaceChildren(
					...keys.map( ( key, i ) => {
						const input = midi.access.inputs.get( key );
						const option = el( 'option', '', input?.name || fill( config.unnamedMidi, i + 1 ) );
						option.value = key;
						option.selected = key === s.port;
						return option;
					} )
				);
			}
			// Said again only when it changes: an output coming and going says nothing.
			const now = keys.length ? config.listeningMidi : config.midiNone;
			if ( now !== s.said ) {
				s.said = now;
				tell( part, now );
			}
			update( part );
		} );
	}

	async function startMidi( part ) {
		if ( part.starting || ! canMidi() ) {
			return;
		}
		end( part );
		const mine = ++part.attempt;
		part.starting = true;
		update( part );
		tell( part, config.asking, false );
		let access = midi?.access;
		try {
			if ( ! access ) {
				askingMidi ||= navigator.requestMIDIAccess();
				access = await askingMidi;
			}
		} catch {
			askingMidi = null;
			if ( mine === part.attempt ) {
				part.starting = false;
				tell( part, showing && parts.includes( part ) ? config.midiDenied : '' );
				update( part );
			}
			return;
		}
		if ( mine !== part.attempt ) {
			return;
		}
		part.starting = false;
		if ( ! showing || ! parts.includes( part ) ) {
			update( part );
			return;
		}
		if ( midi?.access !== access ) {
			midi = { access };
			access.onstatechange = bind;
		}
		const session = { kind: 'midi', note: null, held: [], bend: 0, port: '', said: '' };
		session.timer = window.setInterval(
			() => heard( part, session.held.length ? session.held[ session.held.length - 1 ] + session.bend : null ),
			25
		);
		part.session = session;
		bind();
		loop();
	}

	// Closes a singer's microphone or lets their MIDI go, and says why when there is something to say.
	function end( part, why ) {
		part.attempt++;
		if ( part.starting ) {
			part.starting = false;
			update( part );
		}
		if ( ! part.session ) {
			return;
		}
		const was = part.session;
		part.session = null;
		if ( was.kind === 'mic' ) {
			was.node.port.postMessage( 'stop' );
			was.stream.getTracks().forEach( ( t ) => t.stop() );
			was.ctx.close().catch( () => {} );
		} else {
			window.clearInterval( was.timer );
			// MIDI is let go once no singer listens to it.
			if ( midi && ! parts.some( ( p ) => p.session?.kind === 'midi' ) ) {
				midi.access.onstatechange = null;
				midi.access.inputs.forEach( ( input ) => {
					input.onmidimessage = null;
				} );
				midi = null;
				askingMidi = null;
			}
		}
		if ( why ) {
			tell( part, why );
		}
		update( part );
	}

	function endAll( why ) {
		parts.forEach( ( part ) => end( part, part.session ? why : '' ) );
	}

	// The words of the line being sung, or the next one, what is being sung marked: the melody's
	// syllables, or for a lone singer, Riff Lyrics' line, its words lit as Riff Lyrics lights them.
	function lyric( part, time ) {
		const lines = ! duet() && chart.lyrics;
		if ( lines ) {
			// The line Riff Lyrics marks, or before the first, the first.
			const i = Math.max( 0, timing.at( lines, time ) );
			if ( i !== part.phraseShown ) {
				part.phraseShown = i;
				const line = lines[ i ];
				part.ui.words.replaceChildren(
					...( line.words || [ { time: line.time, text: line.text } ] ).map( ( w ) => {
						const span = el( 'span', 'riff-sing-syllable', w.text );
						span.when = w.time;
						return span;
					} )
				);
			}
			for ( const span of part.ui.words.children ) {
				span.classList.toggle( 'is-sung', span.when !== null && timing.due( span.when, time ) );
			}
			return;
		}
		const { phrases } = part.chart;
		const i = phrases.findIndex( ( p ) => time < p.end );
		if ( i !== part.phraseShown ) {
			part.phraseShown = i;
			part.ui.words.replaceChildren(
				...( phrases[ i ]?.notes || [] ).map( ( n ) => {
					const span = el( 'span', 'riff-sing-syllable', n.text );
					span.when = n.start;
					return span;
				} )
			);
		}
		for ( const span of part.ui.words.children ) {
			span.classList.toggle( 'is-sung', span.when !== null && span.when <= time );
		}
	}

	const colors = ( strip ) => {
		const css = getComputedStyle( strip );
		const read = ( name, fallback ) => css.getPropertyValue( name ).trim() || fallback;
		return {
			note: read( '--sing-note', '#888' ),
			hit: read( '--sing-hit', '#fff' ),
			gold: read( '--sing-gold', '#f2eadb' ),
			voice: read( '--sing-voice', '#f2eadb' ),
			line: read( '--sing-line', '#666' ),
		};
	};

	function draw() {
		if ( ! ui || ! chart || ! showing ) {
			return;
		}
		const now = timing.now();
		parts.forEach( ( part ) => drawPart( part, now ) );
	}

	// A lane: notes as bars at their pitch, the voice as a line against them, the playhead fixed
	// a quarter of the way in while the notes scroll past. With reduced motion the lane holds still
	// on one line at a time and the playhead moves across it instead.
	function drawPart( part, now ) {
		const { chart: sung, scorer } = part;
		lyric( part, now );
		const { canvas } = part.ui;
		const w = canvas.clientWidth;
		const h = canvas.clientHeight;
		if ( ! w || ! h ) {
			return;
		}
		const ratio = window.devicePixelRatio || 1;
		if ( canvas.width !== Math.round( w * ratio ) || canvas.height !== Math.round( h * ratio ) ) {
			canvas.width = Math.round( w * ratio );
			canvas.height = Math.round( h * ratio );
		}
		part.ui.colors ||= colors( canvas.parentElement );
		const c = part.ui.colors;
		const g = canvas.getContext( '2d' );
		g.setTransform( ratio, 0, 0, ratio, 0, 0 );
		g.clearRect( 0, 0, w, h );
		let from = now - 1.5;
		let to = now + 4.5;
		if ( reduced?.matches ) {
			const p = sung.phrases.find( ( x ) => now < x.end ) || sung.phrases[ sung.phrases.length - 1 ];
			from = Math.min( now, p.start ) - 0.5;
			to = p.end + 0.5;
		}
		const low = sung.low - 2;
		const high = Math.max( sung.high + 2, low + 12 );
		const x = ( t ) => ( ( t - from ) / ( to - from ) ) * w;
		const y = ( m ) => h - ( ( m - low ) / ( high - low ) ) * h;
		const bar = Math.max( 4, ( h / ( high - low ) ) * 0.8 );
		for ( const p of sung.phrases ) {
			if ( p.end < from || p.start > to ) {
				continue;
			}
			for ( const n of p.notes ) {
				const hit = scorer.hit( n );
				g.globalAlpha = n.free ? 0.4 : 1;
				g.fillStyle = hit !== null && hit >= 0.5 ? c.hit : n.golden ? c.gold : c.note;
				g.fillRect( x( n.start ), y( n.midi ) - bar / 2, Math.max( 2, x( n.end ) - x( n.start ) - 2 ), bar );
			}
		}
		g.globalAlpha = 1;
		g.fillStyle = c.line;
		g.fillRect( x( now ) - 1, 0, 2, h );
		// The voice, moved by whole octaves to sit nearest the note it was sung against.
		const near = ( note, t ) => {
			const want = scorer.note( t )?.midi ?? ( low + high ) / 2;
			return note + 12 * Math.round( ( want - note ) / 12 );
		};
		g.strokeStyle = c.voice;
		g.lineWidth = 3;
		g.lineJoin = 'round';
		g.beginPath();
		let prev = null;
		for ( const point of part.trail ) {
			if ( point.t < from || point.t > now + 0.1 ) {
				prev = null;
				continue;
			}
			if ( point.note === null ) {
				prev = null;
				continue;
			}
			const px = x( point.t );
			const py = y( near( point.note, point.t ) );
			if ( prev && point.t - prev.t < 0.15 ) {
				g.lineTo( px, py );
			} else {
				g.moveTo( px, py );
			}
			prev = point;
		}
		g.stroke();
	}

	function loop() {
		if ( frame || ! ui ) {
			return;
		}
		const tick = () => {
			frame = 0;
			draw();
			if ( ui && visible && ( parts.some( ( p ) => p.session ) || player()?.playing() ) ) {
				frame = window.requestAnimationFrame( tick );
			}
		};
		frame = window.requestAnimationFrame( tick );
	}

	// The view, filled as it opens and again as the track changes while it is open; left, the
	// microphones are let go.
	document.addEventListener( 'riff:view', ( e ) => {
		if ( e.detail?.id !== 'sing' ) {
			return;
		}
		showing = !! e.detail.open;
		if ( showing ) {
			show( e.detail.view, e.detail.track );
		} else {
			endAll();
		}
	} );
	document.addEventListener( 'riff:play', () => loop() );
	// A seek while paused moves the lane too.
	timing.listen( () => {
		if ( ! frame ) {
			draw();
		}
	} );
	document.addEventListener( 'riff:ended', () => {
		if ( ! chart || ! showing ) {
			return;
		}
		for ( const part of parts ) {
			for ( const d of part.scorer.finish() ) {
				report( part, d.score );
			}
			const total = part.scorer.total();
			if ( total !== null ) {
				const text = fill( config.done, config.grades?.[ melody.grade( total ) ] || '', percent( total ) );
				if ( part.ui ) {
					part.ui.result.textContent = text;
				}
				speak( duet() ? `${ nameOf( part ) }: ${ text }` : text );
			}
		}
	} );
	document.addEventListener( 'visibilitychange', () => {
		if ( document.hidden ) {
			endAll( config.stopped );
		}
	} );
	window.addEventListener( 'pagehide', () => endAll() );
} )();
