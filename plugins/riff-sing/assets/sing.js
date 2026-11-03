/* Riff Sing: fills the Sing view of Now Playing, registered on the server as Riff registers its own
 * (riff_register_view()). The song's melody, from the track's Melody field
 * through the media REST route, scrolls past as a lane of notes with its words under it; once the
 * listener asks, their voice is drawn against it and each line is scored as it ends.
 *
 * It listens to the player's riff:view, riff:time, riff:play and riff:ended events, which
 * Riff dispatches on its own element for any script, and reads where the song is through
 * window.riff.time(). riff:time and the time come through timing.js, which it shares with Riff
 * Lyrics and Riff Chords; it needs nothing loaded before it but timing.js, melody.js and wp-a11y.
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
	let scorer = null;
	let ui = null; // The panel's parts while a chart is showing.
	let session = null; // The open microphone or MIDI access.
	let starting = false;
	// Each start, so one the listener walked away from while the browser asked is let go: end()
	// moves it on, and a start that comes back to a different number releases what it opened.
	let attempt = 0;
	let trail = []; // What was sung lately, each { t, note }, for the lane.
	let frame = 0;
	let phraseShown = -1;
	let tolerance = 100;
	try {
		const saved = Number( window.localStorage?.getItem( 'riff-sing-tolerance' ) );
		tolerance = LEVELS.includes( saved ) ? saved : 100;
	} catch {
		// Storage can be off; the default stands.
	}

	// Until the player starts, window.riff is the #riff element, by its id.
	const player = () => ( typeof window.riff?.time === 'function' ? window.riff : null );
	const speak = ( text ) => window.wp?.a11y?.speak?.( text, 'polite' );
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

	// The melody for a track that is a Media Library file; an empty string for none.
	function melodyFor( track ) {
		const id = Number( track?.id );
		if ( ! Number.isInteger( id ) || id <= 0 ) {
			return Promise.resolve( '' );
		}
		if ( ! cache.has( id ) ) {
			const url = new URL( String( id ), config.media );
			url.searchParams.set( '_fields', 'riff_sing_melody' );
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
				.then( ( data ) => String( data?.riff_sing_melody || '' ) );
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
		end();
		ui = null;
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

	// The lane, the words, the score and the controls, for a chart.
	function build( where ) {
		// The next song with the panel already up: the lane and the words change, and the controls,
		// the listening, focus and the last score stay as they are.
		if ( ui?.root.parentElement === where ) {
			phraseShown = -1;
			update();
			draw();
			return;
		}
		const root = el( 'div', 'riff-sing' );
		const lane = el( 'div', 'riff-sing-lane' );
		const canvas = el( 'canvas' );
		// Drawn, so a screen reader is given the words and the scores as text below instead.
		canvas.setAttribute( 'aria-hidden', 'true' );
		lane.append( canvas );
		const words = el( 'p', 'riff-sing-words' );
		const result = el( 'p', 'riff-sing-result' );
		const controls = el( 'div', 'riff-sing-controls' );
		const mic = button( config.mic, 'is-primary', () => startMic() );
		const midi = button( config.midi, '', () => startMidi() );
		const stop = button( config.stop, '', () => end( config.stopped ) );
		const input = select( config.input, 'riff-sing-input', ( id ) => startMic( id ) );
		const level = select( config.level, 'riff-sing-level', ( value ) => {
			tolerance = Number( value ) || 100;
			if ( scorer ) {
				scorer.tolerance = tolerance;
			}
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
		controls.append( mic, midi, stop, input.wrap, level.wrap );
		const status = el( 'p', 'riff-sing-status' );
		const intro = el( 'p', 'riff-sing-note', config.intro || '' );
		const privacy = el( 'p', 'riff-sing-note', config.private || '' );
		root.append( lane, words, result, controls, status, intro, privacy );
		const had = where.contains( document.activeElement );
		where.replaceChildren( root );
		if ( had ) {
			where.focus();
		}
		ui = { root, canvas, words, result, mic, midi, stop, input, status, colors: null };
		phraseShown = -1;
		watch( root );
		update();
		draw();
	}

	// The controls as the listening stands: what can be started, what can be stopped.
	function update() {
		if ( ! ui ) {
			return;
		}
		const on = !! session;
		ui.mic.hidden = on || ! canMic();
		ui.midi.hidden = on || ! canMidi();
		ui.stop.hidden = ! on;
		ui.mic.disabled = starting;
		ui.midi.disabled = starting;
		ui.input.wrap.hidden = session?.kind !== 'mic' || ui.input.field.options.length < 2;
		if ( ! on && ! canMic() && ! ui.status.textContent ) {
			ui.status.textContent = canMidi() ? config.noMic : config.unsupported;
		}
	}

	function tell( text, announce = true ) {
		if ( ui ) {
			ui.status.textContent = text || '';
		}
		if ( announce && text ) {
			speak( text );
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
				end( session ? config.stopped : '' );
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
		scorer = null;
		trail = [];
		if ( ! track ) {
			say( where, config.idle );
			return;
		}
		try {
			const text = await melodyFor( track );
			if ( mine !== turn ) {
				return;
			}
			if ( ! text.trim() ) {
				say( where, config.none, Number( track.id ) );
				return;
			}
			chart = melody.parse( text );
			if ( ! chart ) {
				say( where, config.broken, Number( track.id ) );
				return;
			}
			scorer = melody.scorer( chart, { tolerance } );
			build( where );
		} catch {
			if ( mine === turn ) {
				say( where, config.error );
			}
		}
	}

	// What is heard, many times a second, from either source: a note or null for none.
	function heard( note ) {
		if ( ! session ) {
			return;
		}
		session.note = note;
		if ( ! scorer || ! player()?.playing() ) {
			return;
		}
		const t = player().time() - LATENCY[ session.kind ];
		trail.push( { t, note } );
		while ( trail.length && trail[ 0 ].t < t - 8 ) {
			trail.shift();
		}
		for ( const done of scorer.add( t, note ) ) {
			report( done.score );
		}
	}

	function percent( score ) {
		return Math.round( score * 100 );
	}

	function report( score ) {
		const word = config.grades?.[ melody.grade( score ) ] || '';
		const total = scorer.total();
		const line = fill( config.line, word, percent( score ) );
		const song = total === null ? '' : fill( config.song, percent( total ) );
		if ( ui ) {
			ui.result.textContent = `${ line } ${ song }`.trim();
		}
		speak( line );
	}

	async function startMic( deviceId = '' ) {
		if ( starting || ! canMic() ) {
			return;
		}
		end();
		const mine = ++attempt;
		const left = () => mine !== attempt || ! showing || ! ui;
		starting = true;
		update();
		tell( config.asking, false );
		let stream = null;
		let ctx = null;
		try {
			stream = await navigator.mediaDevices.getUserMedia( {
				audio: {
					...( deviceId ? { deviceId: { exact: deviceId } } : {} ),
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
				heard( hz > 0 && clarity > 0.5 ? melody.midi( hz ) : null );
			};
			const track = stream.getAudioTracks()[ 0 ];
			track?.addEventListener( 'ended', () => end( config.lost ) );
			session = { kind: 'mic', stream, ctx, node, note: null, device: track?.getSettings?.().deviceId || deviceId };
			starting = false;
			tell( config.listening );
			loop();
			// Named now that the browser may say their names; the list can come after the listening.
			inputs();
		} catch ( error ) {
			stream?.getTracks().forEach( ( t ) => t.stop() );
			ctx?.close().catch( () => {} );
			const name = error?.name || '';
			if ( mine !== attempt ) {
				// Another start, or an end, has taken over.
				return;
			}
			starting = false;
			if ( left() ) {
				tell( '', false );
			} else if ( name === 'NotAllowedError' || name === 'SecurityError' ) {
				tell( config.denied );
			} else if ( name === 'NotFoundError' || name === 'OverconstrainedError' ) {
				tell( config.missing );
			} else if ( name === 'NotReadableError' || name === 'AbortError' ) {
				tell( config.busy );
			} else {
				tell( config.failed );
			}
		}
		update();
	}

	// The microphones to choose from, named now that the browser may say their names.
	async function inputs() {
		if ( ! ui || session?.kind !== 'mic' || typeof navigator.mediaDevices.enumerateDevices !== 'function' ) {
			return;
		}
		const current = session.device;
		const list = ( await navigator.mediaDevices.enumerateDevices().catch( () => [] ) ).filter(
			( d ) => d.kind === 'audioinput' && d.deviceId
		);
		if ( ! ui ) {
			return;
		}
		ui.input.field.replaceChildren(
			...list.map( ( d, i ) => {
				const option = el( 'option', '', d.label || fill( config.unnamed, i + 1 ) );
				option.value = d.deviceId;
				option.selected = d.deviceId === current;
				return option;
			} )
		);
		update();
	}

	async function startMidi() {
		if ( starting || ! canMidi() ) {
			return;
		}
		end();
		const mine = ++attempt;
		starting = true;
		update();
		tell( config.asking, false );
		let access;
		try {
			access = await navigator.requestMIDIAccess();
		} catch {
			if ( mine === attempt ) {
				starting = false;
				tell( showing && ui ? config.midiDenied : '' );
				update();
			}
			return;
		}
		if ( mine !== attempt ) {
			return;
		}
		starting = false;
		if ( ! showing || ! ui ) {
			update();
			return;
		}
		const held = [];
		let bend = 0;
		const message = ( e ) => {
			const [ code = 0, a = 0, b = 0 ] = e.data || [];
			const kind = code & 0xf0;
			const at = held.indexOf( a );
			if ( kind === 0x90 && b > 0 ) {
				if ( at >= 0 ) {
					held.splice( at, 1 );
				}
				held.push( a );
			} else if ( ( kind === 0x80 || kind === 0x90 ) && at >= 0 ) {
				held.splice( at, 1 );
			} else if ( kind === 0xe0 ) {
				// Pitch bend, two semitones either way, as a pitch-to-MIDI microphone sends it.
				bend = ( ( ( ( b << 7 ) | a ) - 8192 ) / 8192 ) * 2;
			}
		};
		let said = '';
		const bind = () => {
			access.inputs.forEach( ( input ) => {
				input.onmidimessage = message;
			} );
			// Said again only when it changes: an output coming and going says nothing.
			const now = access.inputs.size ? config.listeningMidi : config.midiNone;
			if ( now !== said ) {
				said = now;
				tell( now );
			}
		};
		access.onstatechange = bind;
		const timer = window.setInterval(
			() => heard( held.length ? held[ held.length - 1 ] + bend : null ),
			25
		);
		session = { kind: 'midi', access, timer, note: null };
		bind();
		update();
		loop();
	}

	// Closes the microphone or lets MIDI go, and says why when there is something to say.
	function end( why ) {
		attempt++;
		if ( starting ) {
			starting = false;
			update();
		}
		if ( ! session ) {
			return;
		}
		const was = session;
		session = null;
		if ( was.kind === 'mic' ) {
			was.node.port.postMessage( 'stop' );
			was.stream.getTracks().forEach( ( t ) => t.stop() );
			was.ctx.close().catch( () => {} );
		} else {
			window.clearInterval( was.timer );
			was.access.onstatechange = null;
			was.access.inputs.forEach( ( input ) => {
				input.onmidimessage = null;
			} );
		}
		if ( why ) {
			tell( why );
		}
		update();
	}

	// The words of the line being sung, or the next one, the syllable being sung marked.
	function lyric( time ) {
		const i = chart.phrases.findIndex( ( p ) => time < p.end );
		if ( i !== phraseShown ) {
			phraseShown = i;
			ui.words.replaceChildren(
				...( chart.phrases[ i ]?.notes || [] ).map( ( n ) => {
					const span = el( 'span', 'riff-sing-syllable', n.text );
					span.note = n;
					return span;
				} )
			);
		}
		for ( const span of ui.words.children ) {
			span.classList.toggle( 'is-sung', span.note.start <= time );
		}
	}

	const colors = ( lane ) => {
		const css = getComputedStyle( lane );
		const read = ( name, fallback ) => css.getPropertyValue( name ).trim() || fallback;
		return {
			note: read( '--sing-note', '#888' ),
			hit: read( '--sing-hit', '#fff' ),
			gold: read( '--sing-gold', '#f2eadb' ),
			voice: read( '--sing-voice', '#f2eadb' ),
			line: read( '--sing-line', '#666' ),
		};
	};

	// The lane: notes as bars at their pitch, the voice as a line against them, the playhead fixed
	// a quarter of the way in while the notes scroll past. With reduced motion the lane holds still
	// on one line at a time and the playhead moves across it instead.
	function draw() {
		if ( ! ui || ! chart || ! showing ) {
			return;
		}
		const now = timing.now();
		lyric( now );
		const { canvas } = ui;
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
		ui.colors ||= colors( canvas.parentElement );
		const c = ui.colors;
		const g = canvas.getContext( '2d' );
		g.setTransform( ratio, 0, 0, ratio, 0, 0 );
		g.clearRect( 0, 0, w, h );
		let from = now - 1.5;
		let to = now + 4.5;
		if ( reduced?.matches ) {
			const p = chart.phrases.find( ( x ) => now < x.end ) || chart.phrases[ chart.phrases.length - 1 ];
			from = Math.min( now, p.start ) - 0.5;
			to = p.end + 0.5;
		}
		const low = chart.low - 2;
		const high = Math.max( chart.high + 2, low + 12 );
		const x = ( t ) => ( ( t - from ) / ( to - from ) ) * w;
		const y = ( m ) => h - ( ( m - low ) / ( high - low ) ) * h;
		const bar = Math.max( 4, ( h / ( high - low ) ) * 0.8 );
		for ( const p of chart.phrases ) {
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
		for ( const point of trail ) {
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
			if ( ui && visible && ( session || player()?.playing() ) ) {
				frame = window.requestAnimationFrame( tick );
			}
		};
		frame = window.requestAnimationFrame( tick );
	}

	// The view, filled as it opens and again as the track changes while it is open; left, the
	// microphone is let go.
	document.addEventListener( 'riff:view', ( e ) => {
		if ( e.detail?.id !== 'sing' ) {
			return;
		}
		showing = !! e.detail.open;
		if ( showing ) {
			show( e.detail.view, e.detail.track );
		} else {
			end();
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
		if ( ! scorer || ! showing ) {
			return;
		}
		const done = scorer.finish();
		for ( const d of done ) {
			report( d.score );
		}
		const total = scorer.total();
		if ( total !== null ) {
			const text = fill( config.done, config.grades?.[ melody.grade( total ) ] || '', percent( total ) );
			if ( ui ) {
				ui.result.textContent = text;
			}
			speak( text );
		}
	} );
	document.addEventListener( 'visibilitychange', () => {
		if ( document.hidden ) {
			end( config.stopped );
		}
	} );
	window.addEventListener( 'pagehide', () => end() );
} )();
