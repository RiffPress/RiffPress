/* Riff: a docked player for the audio and video blocks in a post, with a Now Playing view.
 *
 * The server marks each core audio and video block with its track (data-riff-track on the figure),
 * and each item of a playlist block with its own.
 * This script turns those blocks into rows, plays them through one queue, and keeps one <audio> and
 * one <video> element for the whole page. A track with a video version plays through whichever of
 * the two is showing, and switching hands the position over. No build step: this file is what ships. */

const root = document.getElementById( 'riff' );

if ( root ) {
	start();
}

function start() {
	const data =
		parse( document.getElementById( 'riff-data' )?.textContent ) || {};
	const s = data.strings || {};

	// "MP3 · 128 kbps", "FLAC · Lossless", or nothing when the file was never read. Shown on every
	// track, the way the streaming services show their tier, from what WordPress read on upload.
	// A track with a video version carries a small film mark after its title, where the eye already
	// is, instead of a pill competing with the time on the row's right edge.
	const FILM =
		'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM9.5 16.5v-9l7 4.5-7 4.5z"/></svg>';
	function videoMark( t ) {
		if ( t.type !== 'video' && ! t.video ) {
			return '';
		}
		const label = esc( s.video || 'Video' );
		return `<span class="riff-row-video" role="img" aria-label="${ label }">${ FILM }</span>`;
	}

	function quality( t ) {
		if ( ! t || ( ! t.bitrate && ! t.lossless ) ) {
			return '';
		}
		const format = ( t.format || '' ).toUpperCase();
		const rate = t.lossless
			? s.lossless || 'Lossless'
			: fmt( s.kbps || '%s kbps', t.bitrate );
		return format ? `${ format } · ${ rate }` : rate;
	}
	const $ = ( sel ) => root.querySelector( sel );
	const $$ = ( sel ) => [ ...root.querySelectorAll( sel ) ];
	const audio = $( '.riff-audio' );
	const video = $( '.riff-video' );
	// Data saver (Network Information API): nothing is fetched ahead of a press.
	if ( navigator.connection?.saveData ) {
		audio.preload = 'none';
		video.preload = 'none';
	}
	const np = $( '.riff-np' );
	const queueList = $( '.riff-queue-list' );
	const STATE = 'riff:state';
	const VOLUME = 'riff:volume';
	const reduce = () =>
		window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;

	let queue = []; // Tracks, in the order they were found.
	let order = []; // Indexes into queue, in the order they play.
	let pos = -1; // Position in order.
	let mode = 'song'; // 'song' or 'video', for tracks that have both.
	let repeat = 'off'; // 'off', 'all' or 'one'.
	let shuffle = false;
	let seeking = false;
	let backgrounded = false; // Video handed to audio because the page went to the background.
	let preloader = null;

	const track = () => queue[ order[ pos ] ];

	// ---- The extension surface. Every change of state is announced twice: through wp.hooks as a
	// riff.<name> action, and as a riff:<name> CustomEvent on #riff for pages without the WordPress
	// scripts, both with the same detail. Two filters let a plugin reshape what plays: riff.queue
	// (the tracks about to become the queue) and riff.track (each track as it is queued). The api
	// object is window.riff, handed to riff.ready, and the only door the Listen feature uses.
	// Documented in docs/javascript.md; stable within a major version.
	const hooks = window.wp?.hooks;
	function emit( name, detail = {} ) {
		hooks?.doAction( `riff.${ name }`, detail, api );
		root.dispatchEvent(
			new CustomEvent( `riff:${ name }`, { detail, bubbles: true } )
		);
	}
	const filter = ( name, value, ...args ) =>
		hooks ? hooks.applyFilters( `riff.${ name }`, value, ...args ) : value;
	const api = {
		version: 1,
		strings: s,
		play( tracks, index = 0, { shuffle: on = null } = {} ) {
			if ( on !== null ) {
				shuffle = on;
			}
			setQueue( tracks, index );
		},
		toggle: () => toggle(),
		next: () => next(),
		prev: () => prev(),
		seek( seconds ) {
			if ( track() ) {
				el().currentTime = Math.max( 0, Number( seconds ) || 0 );
			}
		},
		open: () => open(),
		close: () => close(),
		mount: () => mount(),
		current: () => track() || null,
		queue: () => order.map( ( i ) => queue[ i ] ),
		playing: () => !! track() && ! el().paused,
		on( name, fn ) {
			const handler = ( e ) => fn( e.detail, api );
			root.addEventListener( `riff:${ name }`, handler );
			return () => root.removeEventListener( `riff:${ name }`, handler );
		},
	};
	window.riff = api;
	const isVideo = ( t = track() ) =>
		!! t && ( t.type === 'video' || ( mode === 'video' && !! t.video ) );
	// Once the analyser is wired to <audio>, a file from another origin would play silent through it,
	// so such a file plays through <video> instead, hidden. The picture still shows the cover.
	const foreign = ( t ) => {
		try {
			return new URL( t.src, location.href ).origin !== location.origin;
		} catch {
			return true;
		}
	};
	const el = ( t = track() ) =>
		isVideo( t ) || ( analyser && t && foreign( t ) ) ? video : audio;
	const srcFor = ( t, m ) =>
		m === video && isVideo( t ) && t.video ? t.video.src : t.src;

	// ---- Rows in the post. Each block keeps its native player underneath, hidden, so a page where
	// this script fails still plays. mount() reads every marked element on the page, a block's
	// figure or a playlist's item; the app calls it again after it swaps a view in, and an element
	// already turned into a row keeps that row.
	const rows = [];
	const built = new WeakMap();
	function mount() {
		rows.length = 0;
		document
			.querySelectorAll( 'figure[data-riff-track], li[data-riff-track]' )
			.forEach( ( fig ) => {
				const t = parse( fig.dataset.riffTrack );
				if ( ! t || ! t.src ) {
					return;
				}
				let row = built.get( fig );
				if ( ! row ) {
					row = buildRow( fig, t );
					built.set( fig, row );
				}
				rows.push( { t, row } );
			} );
		paint();
	}

	function buildRow( fig, t ) {
		const native = fig.querySelector( 'audio, video' );
		if ( native ) {
			native.pause();
			native.preload = 'none';
			native.hidden = true;
		}
		const row = document.createElement( 'button' );
		row.type = 'button';
		row.className = 'riff-row';
		row.setAttribute(
			'aria-label',
			fmt( s.playTrack || 'Play %s', t.title )
		);
		const art = smallest( t.art ) || t.video?.poster || '';
		row.innerHTML =
			'<span class="riff-row-art">' +
			( art
				? `<img src="${ esc(
						art
					) }" alt="" loading="lazy" decoding="async">`
				: '' ) +
			'<span class="riff-row-state" aria-hidden="true"><i></i><i></i><i></i></span></span>' +
			`<span class="riff-row-text"><span class="riff-row-title">${ esc(
				t.title
			) }${ videoMark( t ) }</span>` +
			`<span class="riff-row-sub">${ esc(
				subtitle( t )
			) }</span></span>` +
			`<span class="riff-row-time">${
				t.duration ? time( t.duration ) : ''
			}</span>`;
		fig.insertBefore( row, fig.firstChild );
		row.addEventListener( 'click', () => {
			if ( track()?.id === t.id && sameQueue() ) {
				toggle();
				return;
			}
			setQueue(
				rows.map( ( r ) => r.t ),
				rows.findIndex( ( r ) => r.row === row )
			);
			if ( t.type === 'video' ) {
				open();
			}
		} );
		return row;
	}

	// The page's rows are the queue that is playing, so a row tap toggles instead of restarting.
	const sameQueue = () =>
		queue.length === rows.length &&
		rows.every( ( r, i ) => r.t.id === queue[ i ].id );

	// ---- The queue.
	function setQueue( tracks, index, { play = true, at = 0 } = {} ) {
		stopAll();
		tracks = filter( 'queue', tracks, index ).map( ( t ) =>
			filter( 'track', t )
		);
		queue = tracks;
		order = tracks.map( ( _, i ) => i );
		pos = index;
		if ( shuffle ) {
			reshuffle();
		}
		mode = 'song';
		load( { play, at } );
	}

	function reshuffle() {
		const current = order[ pos ];
		const rest = queue
			.map( ( _, i ) => i )
			.filter( ( i ) => i !== current );
		for ( let i = rest.length - 1; i > 0; i-- ) {
			const j = Math.floor( Math.random() * ( i + 1 ) );
			[ rest[ i ], rest[ j ] ] = [ rest[ j ], rest[ i ] ];
		}
		order = [ current, ...rest ];
		pos = 0;
	}

	function stopAll() {
		for ( const m of [ audio, video ] ) {
			m.pause();
		}
	}

	function load( { play = true, at = 0 } = {} ) {
		const t = track();
		if ( ! t ) {
			return;
		}
		const m = el( t );
		const other = m === audio ? video : audio;
		other.pause();
		const src = srcFor( t, m );
		if ( m.getAttribute( 'src' ) !== src ) {
			m.src = src;
		}
		if ( at || m.currentTime ) {
			m.currentTime = at;
		}
		video.poster = t.video?.poster || largest( t.art ) || '';
		root.hidden = false;
		document.documentElement.classList.add( 'has-riff' );
		if ( play ) {
			m.play().catch( paint );
		}
		metadata( t );
		paint();
		renderQueue();
		tint( largest( t.art ) || t.video?.poster );
		save();
		emit( 'track', { track: t, index: pos, queue: api.queue() } );
	}

	function toggle() {
		const m = el();
		if ( ! track() ) {
			return;
		}
		// A short tick under the thumb on a touch screen (Vibration API), as the phone apps do.
		if ( window.matchMedia( '(hover: none)' ).matches ) {
			navigator.vibrate?.( 8 );
		}
		if ( m.paused ) {
			m.play().catch( paint );
		} else {
			m.pause();
		}
	}

	function go( to, { play = true } = {} ) {
		if ( to < 0 || to >= order.length ) {
			return;
		}
		stopAll();
		pos = to;
		load( { play } );
	}

	function next( auto = false ) {
		if ( pos < order.length - 1 ) {
			go( pos + 1 );
		} else if ( repeat === 'all' || ! auto ) {
			go( 0, { play: repeat === 'all' || ! el().paused } );
		}
	}

	function prev() {
		const m = el();
		if ( m.currentTime > 3 || pos === 0 ) {
			m.currentTime = 0;
			return;
		}
		go( pos - 1 );
	}

	function dismiss() {
		close();
		stopAll();
		queue = [];
		order = [];
		pos = -1;
		root.hidden = true;
		document.documentElement.classList.remove( 'has-riff' );
		audio.removeAttribute( 'src' );
		video.removeAttribute( 'src' );
		audio.load();
		video.load();
		forget();
		paint();
		if ( 'mediaSession' in navigator ) {
			navigator.mediaSession.metadata = null;
		}
	}

	// ---- Song and video. The position carries across, and so does whether it was playing.
	function setMode( to ) {
		const t = track();
		if ( ! t || ! t.video || to === mode ) {
			return;
		}
		const from = el();
		const at = from.currentTime;
		const playing = ! from.paused;
		mode = to;
		from.pause();
		const m = el();
		const src = srcFor( t, m );
		if ( m.getAttribute( 'src' ) !== src ) {
			m.src = src;
		}
		m.currentTime = at;
		if ( playing ) {
			m.play().catch( paint );
		}
		paint();
		save();
	}

	// A phone pauses video when the page goes to the background, and audio keeps going. So the
	// track moves to audio while hidden and back to video when the page returns.
	document.addEventListener( 'visibilitychange', () => {
		if ( ! document.hidden && ! el().paused && ! reduce() ) {
			follow();
		}
		const t = track();
		if ( ! t || ! t.video ) {
			return;
		}
		if ( document.hidden && mode === 'video' && ! video.paused ) {
			backgrounded = true;
			setMode( 'song' );
		} else if ( ! document.hidden && backgrounded ) {
			backgrounded = false;
			setMode( 'video' );
		}
	} );

	// ---- One tab at a time. When this tab starts playing it says so on a channel; any other tab of
	// the site that is playing pauses and says why, the way streaming apps hand off between devices.
	const tabId = Math.random().toString( 36 ).slice( 2 );
	const channel =
		'BroadcastChannel' in window ? new BroadcastChannel( 'riff' ) : null;
	channel?.addEventListener( 'message', ( e ) => {
		if (
			e.data?.type === 'playing' &&
			e.data.from !== tabId &&
			! el().paused
		) {
			el().pause();
			toast( s.otherTab );
		}
	} );
	const announce = () =>
		channel?.postMessage( { type: 'playing', from: tabId } );

	// ---- Media events. Both elements report through the same handlers; only the one in use counts.
	// While something plays the line follows the time every frame; timeupdate alone comes four
	// times a second and reads as a line that skips.
	let followRaf = 0;
	function follow() {
		cancelAnimationFrame( followRaf );
		const step = () => {
			progress();
			followRaf =
				el().paused || document.hidden
					? 0
					: requestAnimationFrame( step );
		};
		followRaf = requestAnimationFrame( step );
	}
	for ( const m of [ audio, video ] ) {
		const live = () => m === el();
		m.addEventListener( 'play', () => {
			if ( live() ) {
				announce();
				paint();
				emit( 'play', { track: track() } );
				if ( ! reduce() ) {
					follow();
				}
			}
		} );
		m.addEventListener( 'pause', () => {
			if ( live() ) {
				paint();
				emit( 'pause', { track: track() } );
			}
		} );
		m.addEventListener( 'playing', () => {
			if ( live() ) {
				root.removeAttribute( 'data-waiting' );
				paint();
			}
		} );
		m.addEventListener( 'waiting', () => {
			if ( live() ) {
				root.dataset.waiting = '';
			}
		} );
		m.addEventListener( 'loadedmetadata', () => live() && progress() );
		m.addEventListener( 'timeupdate', () => {
			if ( ! live() ) {
				return;
			}
			progress();
			position();
			if ( m.currentTime > 5 && Math.floor( m.currentTime ) % 5 === 0 ) {
				save();
			}
			if ( m.duration && m.currentTime / m.duration > 0.5 ) {
				warmNext();
			}
		} );
		m.addEventListener( 'ended', () => {
			if ( ! live() ) {
				return;
			}
			emit( 'ended', { track: track() } );
			if ( repeat === 'one' ) {
				m.currentTime = 0;
				m.play().catch( paint );
			} else {
				next( true );
			}
		} );
		m.addEventListener( 'error', () => {
			if ( ! live() || ! m.getAttribute( 'src' ) ) {
				return;
			}
			root.dataset.error = '';
			setTimeout( () => {
				root.removeAttribute( 'data-error' );
				if ( pos < order.length - 1 ) {
					next( true );
				}
			}, 1500 );
		} );
	}

	// The next track starts downloading halfway through this one, so skipping never waits.
	function warmNext() {
		const t = queue[ order[ pos + 1 ] ];
		if ( ! t || isVideo( t ) || preloader?.dataset.id === t.id ) {
			return;
		}
		preloader = document.createElement( 'audio' );
		preloader.preload = 'auto';
		preloader.dataset.id = t.id;
		preloader.src = t.src;
	}

	// ---- The filament. The played part of the bar's seek line is a wire with current in it. The
	// script keeps one number, its heat, and writes it to --riff-heat on the root once a frame; the
	// stylesheet turns that into the wire's colour and every layer of its light, and a short
	// transition on the property lets the browser interpolate between frames. The heat follows a
	// filament's physics: the signal's power drives it up in about 80 ms, and with the current cut
	// it cools the way a hot thing does, fast while it is bright, then slowly through a long red
	// tail. What counts as full power is whatever the track has been reaching lately, so a quiet
	// recording and a loud mix each light the whole wire. Where there is no analyser (iOS, a file
	// from another origin) the wire breathes at working temperature instead.
	const wire = $( '[data-riff-wire]' );
	const isIOS =
		/iP(hone|ad|od)/.test( navigator.userAgent ) ||
		( navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1 );
	let analyser = null;
	let samples = null;
	let bins = null;
	let meterRaf = 0;
	let breath = null;
	let bars = [];
	let cooling = false;
	let lastTick = 0;
	// The wire's state outlives a restart: a view swap or a row appearing never dips it, and the
	// reference never has to relearn the track.
	let heat = 0;
	let ref = 0.08;

	// Routing audio through Web Audio on iOS breaks lock-screen and background playback, so iPhones
	// keep the breath. A file from another origin cannot be analysed either; see foreign().
	function ensureAnalyser() {
		const t = track();
		if (
			analyser ||
			isIOS ||
			! window.AudioContext ||
			! t ||
			foreign( t )
		) {
			return;
		}
		try {
			const ctx = new AudioContext();
			const src = ctx.createMediaElementSource( audio );
			analyser = ctx.createAnalyser();
			// A 1024-sample window is 20 ms at 48 kHz: long enough for a steady RMS, short enough
			// to catch a transient.
			analyser.fftSize = 1024;
			analyser.smoothingTimeConstant = 0.6;
			samples = new Float32Array( analyser.fftSize );
			bins = new Uint8Array( analyser.frequencyBinCount );
			src.connect( analyser );
			analyser.connect( ctx.destination );
			audio.addEventListener( 'play', () =>
				ctx.resume().catch( () => {} )
			);
			// Suspended while nothing plays: the graph stops pulling samples, and the filament's
			// cool-down reads silence, which is right.
			for ( const ev of [ 'pause', 'ended' ] ) {
				audio.addEventListener( ev, () =>
					ctx.suspend().catch( () => {} )
				);
			}
			ctx.resume().catch( () => {} );
		} catch {
			analyser = null;
		}
	}

	// The signal's level: RMS over the window, as a filament sees current.
	function level() {
		analyser.getFloatTimeDomainData( samples );
		let sum = 0;
		for ( let n = 0; n < samples.length; n++ ) {
			sum += samples[ n ] * samples[ n ];
		}
		return Math.sqrt( sum / samples.length );
	}

	// Three bands for the bars on the playing row: bass, the body of a voice, and the air above it.
	const BANDS = [
		[ 1, 4 ],
		[ 4, 22 ],
		[ 22, 110 ],
	];
	function bandLevels() {
		analyser.getByteFrequencyData( bins );
		return BANDS.map( ( [ a, b ] ) => {
			let sum = 0;
			for ( let n = a; n < b; n++ ) {
				sum += bins[ n ];
			}
			return Math.min( 1, sum / ( b - a ) / 200 );
		} );
	}

	// One step of the wire's physics. drive is the current, 0 to a little over 1; dt is in seconds.
	// Heating chases the drive with a 120 ms time constant: a wire warms, it does not flash.
	// Cooling is radiation plus conduction: a heat⁴ term that empties it while it is bright, and a
	// slow linear term for the tail, so a loud passage settles in half a second and the last red
	// takes a couple of seconds.
	function advance( drive, dt ) {
		if ( drive > heat ) {
			heat += ( drive - heat ) * ( 1 - Math.exp( -dt / 0.12 ) );
		} else {
			const loss = heat / 0.8 + 2.2 * heat * heat * heat * heat;
			heat = Math.max( drive, heat - loss * dt );
		}
		heat = Math.min( 1.2, heat );
	}

	// The wire is seen, not measured: a square root lifts the quiet end into view, since speech
	// sits around a tenth of full scale and would otherwise read as unlit.
	// Written on the lines and the glow themselves, not the root: a property on the root restyles
	// every element in the player each frame, these three restyle three.
	const heated = $$( '.riff-line, .riff-np-glow' );
	function setHeat( h ) {
		const value = Math.sqrt( Math.min( 1, Math.max( 0, h ) ) ).toFixed( 3 );
		for ( const node of heated ) {
			node.style.setProperty( '--riff-heat', value );
		}
	}

	const liveBars = () => [
		...document.querySelectorAll(
			'.riff-row[data-current] .riff-row-state i, .riff-queue-list [aria-current] .riff-row-state i'
		),
	];

	function tick( now = 0 ) {
		const dt = lastTick
			? Math.min( 0.1, ( now - lastTick ) / 1000 )
			: 0.016;
		lastTick = now;
		if ( cooling ) {
			advance( 0, dt );
			setHeat( heat );
			if ( heat > 0.004 ) {
				meterRaf = requestAnimationFrame( tick );
			} else {
				heat = 0;
				setHeat( 0 );
				meterRaf = 0;
				cooling = false;
			}
			return;
		}
		const rms = level();
		// The reference rises to a peak in about 150 ms and forgets it over six seconds: a surge
		// flashes past full for a moment, as it would, and the wire ranges itself to the material.
		ref +=
			( rms - ref ) * ( 1 - Math.exp( -dt / ( rms > ref ? 0.15 : 6 ) ) );
		advance( rms / Math.max( 0.02, ref ), dt );
		setHeat( heat );
		const levels = bandLevels();
		bars.forEach( ( bar, k ) => {
			bar.style.transform = `scaleY(${ ( 0.3 + 0.7 * levels[ k ] ).toFixed( 2 ) })`;
		} );
		meterRaf = requestAnimationFrame( tick );
	}

	// Cut the current: the loop keeps running with no drive until the wire is dark.
	function meterStop() {
		if ( ! meterRaf && ! breath ) {
			return;
		}
		breath?.cancel();
		breath = null;
		root.removeAttribute( 'data-live' );
		for ( const bar of bars ) {
			bar.style.transform = '';
		}
		bars = [];
		if ( reduce() ) {
			cancelAnimationFrame( meterRaf );
			meterRaf = 0;
			heat = 0;
			setHeat( 0 );
			return;
		}
		cooling = true;
		if ( ! meterRaf ) {
			lastTick = 0;
			meterRaf = requestAnimationFrame( tick );
		}
	}

	function meterStart() {
		cooling = false;
		if ( reduce() ) {
			cancelAnimationFrame( meterRaf );
			meterRaf = 0;
			setHeat( 0.25 );
			return;
		}
		ensureAnalyser();
		if ( ! analyser || el() !== audio || ! wire ) {
			cancelAnimationFrame( meterRaf );
			meterRaf = 0;
			heat = 0.5;
			setHeat( heat );
			breath = wire.animate(
				[ { opacity: 0.35 }, { opacity: 0.8 }, { opacity: 0.35 } ],
				{
					duration: 2600,
					iterations: Infinity,
					easing: 'ease-in-out',
				}
			);
			return;
		}
		root.dataset.live = '';
		bars = liveBars();
		if ( ! meterRaf ) {
			lastTick = 0;
			meterRaf = requestAnimationFrame( tick );
		}
	}

	// Called from paint(): the wire follows whatever is playing, and the bars follow the current row.
	function meterSync() {
		const t = track();
		if ( t && ! el().paused && ! document.hidden ) {
			if ( ( ! meterRaf || cooling ) && ! breath ) {
				meterStart();
			} else if ( meterRaf ) {
				bars = liveBars();
			}
		} else {
			meterStop();
		}
	}

	// ---- Painting. Every copy of a control is updated from the same state.
	function paint() {
		const t = track();
		const m = el();
		const playing = !! t && ! m.paused;
		root.dataset.playing = playing ? 'true' : 'false';
		root.dataset.mode = isVideo( t ) ? 'video' : 'song';
		for ( const b of $$( '[data-riff-action="toggle"]' ) ) {
			b.setAttribute( 'aria-label', playing ? s.pause : s.play );
		}
		text( 'title', t?.title || '' );
		text( 'subtitle', t ? subtitle( t ) : '' );
		text( 'artist', t ? t.artist || t.post?.title || '' : '' );
		text( 'quality', quality( t ) );
		text( 'source', t?.post?.title || '' );
		for ( const img of $$( 'img[data-riff-art]' ) ) {
			const src =
				img.dataset.riffSize === 'large'
					? largest( t?.art )
					: smallest( t?.art );
			if ( src && img.getAttribute( 'src' ) !== src ) {
				img.src = src;
			}
			img.hidden = ! src;
		}
		const modes = $( '.riff-modes' );
		modes.hidden = ! t?.video;
		for ( const b of $$( '[data-riff-mode]' ) ) {
			b.setAttribute(
				'aria-checked',
				String( b.dataset.riffMode === mode )
			);
		}
		const repeatLabel = {
			off: s.repeatOff,
			all: s.repeatAll,
			one: s.repeatOne,
		}[ repeat ];
		for ( const b of $$( '[data-riff-action="repeat"]' ) ) {
			b.dataset.repeat = repeat;
			b.setAttribute( 'aria-pressed', String( repeat !== 'off' ) );
			b.setAttribute( 'aria-label', repeatLabel );
		}
		for ( const b of $$( '[data-riff-action="shuffle"]' ) ) {
			b.setAttribute( 'aria-pressed', String( shuffle ) );
			b.setAttribute(
				'aria-label',
				shuffle ? s.shuffleOn : s.shuffleOff
			);
		}
		for ( const { t: rt, row } of rows ) {
			const current = !! t && rt.id === t.id && sameQueue();
			row.toggleAttribute( 'data-current', current );
			row.dataset.playing = current && playing ? 'true' : 'false';
			row.setAttribute(
				'aria-label',
				current && playing ? s.pause : fmt( s.playTrack, rt.title )
			);
		}
		for ( const li of queueList.children ) {
			const current = Number( li.dataset.pos ) === pos;
			li.firstElementChild.toggleAttribute( 'aria-current', current );
			li.dataset.playing = current && playing ? 'true' : 'false';
		}
		progress();
		meterSync();
		if ( 'mediaSession' in navigator ) {
			navigator.mediaSession.playbackState = t
				? playing
					? 'playing'
					: 'paused'
				: 'none';
		}
	}

	function progress() {
		const m = el();
		const t = track();
		const duration =
			( Number.isFinite( m.duration ) && m.duration ) || t?.duration || 0;
		const ratio = duration ? Math.min( m.currentTime / duration, 1 ) : 0;
		setProgress( ratio );
		setBuffered( duration ? buffered( m, duration ) : 0 );
		text( 'current', time( m.currentTime ) );
		text( 'duration', time( duration ) );
		if ( ! seeking ) {
			// A range's value is written only when it moves a step: each write lays the thumb out again.
			const value = String( Math.round( ratio * 1000 ) );
			for ( const input of $$( '[data-riff-seek]' ) ) {
				if ( input.value !== value ) {
					input.value = value;
					input.setAttribute(
						'aria-valuetext',
						( s.times || '%1$s / %2$s' )
							.replace( '%1$s', time( m.currentTime ) )
							.replace( '%2$s', time( duration ) )
					);
				}
			}
		}
	}

	// The played fraction, on the two seek containers rather than the root, for the same reason as
	// the heat.
	const seekers = $$( '.riff-bar-seek, .riff-np-seek' );

	// How far the file has loaded past the playhead, from the element's TimeRanges, as the lighter
	// band under the played part of the line.
	function buffered( m, duration ) {
		const ranges = m.buffered;
		for ( let i = 0; i < ranges.length; i++ ) {
			if (
				ranges.start( i ) <= m.currentTime + 0.5 &&
				ranges.end( i ) >= m.currentTime
			) {
				return Math.min( ranges.end( i ) / duration, 1 );
			}
		}
		return 0;
	}
	let lastBuffered = -1;
	function setBuffered( ratio ) {
		const value = ratio.toFixed( 3 );
		if ( value === lastBuffered ) {
			return;
		}
		lastBuffered = value;
		for ( const node of seekers ) {
			node.style.setProperty( '--riff-buffered', value );
		}
	}

	function setProgress( ratio ) {
		const value = ratio.toFixed( 4 );
		for ( const node of seekers ) {
			node.style.setProperty( '--riff-p', value );
		}
	}

	// The text node is changed in place: replacing it is a childList mutation, and core's
	// comment-reply script watches the whole body for those and re-binds itself on every one.
	function text( name, value ) {
		for ( const node of $$( `[data-riff-text="${ name }"]` ) ) {
			if ( node.textContent === value ) {
				continue;
			}
			if (
				node.firstChild?.nodeType === Node.TEXT_NODE &&
				node.childNodes.length === 1
			) {
				node.firstChild.data = value;
			} else {
				node.textContent = value;
			}
		}
	}

	function renderQueue() {
		queueList.textContent = '';
		order.forEach( ( index, p ) => {
			const t = queue[ index ];
			const li = document.createElement( 'li' );
			li.dataset.pos = String( p );
			const art = smallest( t.art ) || t.video?.poster || '';
			li.innerHTML =
				'<button type="button">' +
				'<span class="riff-row-art">' +
				( art
					? `<img src="${ esc(
							art
						) }" alt="" loading="lazy" decoding="async">`
					: '' ) +
				'<span class="riff-row-state" aria-hidden="true"><i></i><i></i><i></i></span></span>' +
				`<span class="riff-row-text"><span class="riff-row-title">${ esc(
					t.title
				) }</span>` +
				`<span class="riff-row-sub">${ esc(
					t.artist || t.post?.title || ''
				) }` +
				( t.duration
					? `<span class="riff-row-dot"> • ${ time(
							t.duration
						) }</span>`
					: '' ) +
				'</span></span>' +
				`<span class="riff-row-time">${
					t.duration ? time( t.duration ) : ''
				}</span>` +
				'</button>';
			li.firstElementChild.addEventListener( 'click', () =>
				p === pos ? toggle() : go( p )
			);
			queueList.append( li );
		} );
	}

	// ---- Seeking. The range is the control; the line drawn under it is decoration.
	for ( const input of $$( '[data-riff-seek]' ) ) {
		const commit = () => {
			const m = el();
			const duration =
				( Number.isFinite( m.duration ) && m.duration ) ||
				track()?.duration ||
				0;
			if ( duration ) {
				m.currentTime = ( Number( input.value ) / 1000 ) * duration;
			}
		};
		input.addEventListener( 'pointerdown', () => {
			seeking = true;
			root.dataset.seeking = '';
		} );
		input.addEventListener( 'input', () => {
			setProgress( Number( input.value ) / 1000 );
			if ( ! seeking ) {
				commit();
			}
		} );
		input.addEventListener( 'change', () => {
			commit();
			seeking = false;
			root.removeAttribute( 'data-seeking' );
		} );
	}
	window.addEventListener( 'pointerup', () => {
		if ( seeking ) {
			seeking = false;
			root.removeAttribute( 'data-seeking' );
		}
	} );

	// ---- Volume, remembered on this device. Phones ignore it, so it only shows on desktop.
	const volume = $( '[data-riff-volume]' );
	const kept = read( localStorage, VOLUME );
	const stored = kept === null ? NaN : Number( kept );
	if ( Number.isFinite( stored ) && stored >= 0 && stored <= 1 ) {
		audio.volume = video.volume = stored;
		volume.value = String( Math.round( stored * 100 ) );
	}
	volume.addEventListener( 'input', () => {
		audio.volume = video.volume = Number( volume.value ) / 100;
		write( localStorage, VOLUME, String( audio.volume ) );
	} );

	// ---- Buttons.
	root.addEventListener( 'click', ( e ) => {
		const mode_ = e.target.closest( '[data-riff-mode]' );
		if ( mode_ ) {
			setMode( mode_.dataset.riffMode );
			return;
		}
		const button = e.target.closest( '[data-riff-action]' );
		if ( ! button || swiped ) {
			return;
		}
		const action = button.dataset.riffAction;
		if ( action === 'toggle' ) {
			toggle();
		} else if ( action === 'next' ) {
			next();
		} else if ( action === 'prev' ) {
			prev();
		} else if ( action === 'open' ) {
			if ( np.hidden ) {
				open();
			} else {
				close();
			}
		} else if ( action === 'close' ) {
			close();
		} else if ( action === 'queue' ) {
			sheet( { none: 'half', half: 'full', full: 'none' }[ sheetState ] );
		} else if ( action === 'share' ) {
			share();
		} else if ( action === 'repeat' ) {
			repeat = { off: 'all', all: 'one', one: 'off' }[ repeat ];
			paint();
			save();
		} else if ( action === 'shuffle' ) {
			shuffle = ! shuffle;
			const current = order[ pos ];
			if ( shuffle ) {
				reshuffle();
			} else {
				order = queue.map( ( _, i ) => i );
				pos = current;
			}
			renderQueue();
			paint();
			save();
		} else if ( action === 'cast' ) {
			cast();
		} else {
			// A control an extension added through riff_chips or riff_bar_controls.
			emit( 'action', { action, track: track(), button } );
		}
	} );

	// ---- Now Playing. A dialog over the page: the page goes inert, Escape and the browser's back
	// close it, and focus goes back where it was.
	let opener = null;
	function open() {
		if ( ! track() || ! np.hidden ) {
			return;
		}
		opener = document.activeElement;
		np.hidden = false;
		root.classList.add( 'is-open' );
		// Everything but the dialog is inert: the rest of the page, and on a phone the player's own
		// bar and toast, which the dialog covers there and which would otherwise still take focus.
		// On a wide screen the dialog opens above the bar and the bar stays the control surface.
		const covered = window.matchMedia( '(min-width: 900px)' ).matches
			? []
			: [ $( '.riff-bar' ), $( '.riff-toast' ) ];
		for ( const node of [ ...document.body.children, ...covered ] ) {
			if ( node && node !== root && ! node.inert ) {
				node.inert = true;
				node.dataset.riffInert = '';
			}
		}
		for ( const b of $$( '.riff-chevron' ) ) {
			b.setAttribute( 'aria-expanded', 'true' );
		}
		history.pushState( { ...history.state, riff: 'open' }, '' );
		emit( 'open', { track: track() } );
		requestAnimationFrame( () => {
			np.classList.add( 'is-in' );
			$( '[data-riff-action="close"]' ).focus( { preventScroll: true } );
		} );
	}

	function close( { fromHistory = false } = {} ) {
		if ( np.hidden ) {
			return;
		}
		np.classList.remove( 'is-in' );
		emit( 'close', { track: track() } );
		sheet( 'none' );
		np.style.removeProperty( 'transform' );
		root.classList.remove( 'is-open' );
		for ( const node of document.querySelectorAll( '[data-riff-inert]' ) ) {
			node.inert = false;
			node.removeAttribute( 'data-riff-inert' );
		}
		for ( const b of $$( '.riff-chevron' ) ) {
			b.setAttribute( 'aria-expanded', 'false' );
		}
		const done = () => {
			np.hidden = true;
		};
		if ( reduce() ) {
			done();
		} else {
			np.addEventListener( 'transitionend', done, { once: true } );
			setTimeout( done, 400 );
		}
		if ( ! fromHistory && history.state?.riff === 'open' ) {
			history.back();
		}
		if ( opener && document.contains( opener ) ) {
			opener.focus( { preventScroll: true } );
		}
	}

	window.addEventListener( 'popstate', () => {
		if ( ! np.hidden && history.state?.riff !== 'open' ) {
			close( { fromHistory: true } );
		}
	} );

	// ---- Up next on a phone: a handle peeking at the bottom, then a split view with the art above the
	// list, then the list on its own under a one-row player. Tap the handle or drag it to move.
	let sheetState = 'none';
	const peek = $( '.riff-peek' );
	function sheet( to ) {
		sheetState = to;
		np.dataset.sheet = to;
		peek.setAttribute( 'aria-expanded', String( to !== 'none' ) );
		if ( to !== 'none' ) {
			queueList
				.querySelector( '[aria-current]' )
				?.scrollIntoView( { block: 'nearest' } );
		}
	}

	// ---- Share: the system sheet where there is one, the clipboard elsewhere.
	async function share() {
		const t = track();
		const url = t?.post?.url || location.href;
		try {
			if ( navigator.share ) {
				await navigator.share( {
					title: t?.title || document.title,
					url,
				} );
				return;
			}
			await navigator.clipboard.writeText( url );
			toast( s.copied );
		} catch {
			// Dismissing the share sheet rejects; nothing to report.
		}
	}

	const toastEl = $( '.riff-toast' );
	let toastTimer = 0;
	function toast( message ) {
		toastEl.textContent = message;
		toastEl.hidden = false;
		clearTimeout( toastTimer );
		toastTimer = setTimeout( () => ( toastEl.hidden = true ), 2500 );
	}

	// ---- The time under the pointer, above the bar's seek line on a wide screen.
	const barSeek = $( '.riff-bar-seek' );
	const tip = $( '.riff-tip' );
	barSeek.addEventListener( 'pointermove', ( e ) => {
		if ( e.pointerType !== 'mouse' ) {
			return;
		}
		const r = barSeek.getBoundingClientRect();
		const ratio = Math.min(
			Math.max( ( e.clientX - r.left ) / r.width, 0 ),
			1
		);
		const m = el();
		const duration =
			( Number.isFinite( m.duration ) && m.duration ) ||
			track()?.duration ||
			0;
		tip.textContent = time( ratio * duration );
		tip.style.left = `${ ratio * 100 }%`;
		tip.hidden = ! duration;
	} );
	barSeek.addEventListener( 'pointerleave', () => ( tip.hidden = true ) );

	// ---- Gestures. Swipe the bar sideways to skip, down to stop; drag Now Playing down to close.
	let swiped = false;
	drag( $( '.riff-bar-info' ), {
		move: ( dx, dy, target ) => {
			if ( Math.abs( dx ) > Math.abs( dy ) ) {
				target.style.transform = `translateX(${ dx }px)`;
			}
		},
		end: ( dx, dy, target ) => {
			target.style.removeProperty( 'transform' );
			swiped = Math.abs( dx ) > 10 || Math.abs( dy ) > 10;
			setTimeout( () => ( swiped = false ), 0 );
			if ( Math.abs( dx ) > 60 && Math.abs( dx ) > Math.abs( dy ) ) {
				if ( dx < 0 ) {
					next();
				} else {
					prev();
				}
			} else if ( dy > 50 && dy > Math.abs( dx ) ) {
				dismiss();
			}
		},
	} );
	for ( const zone of $$( '.riff-np-head, .riff-stage' ) ) {
		drag( zone, {
			move: ( dx, dy ) => {
				if ( dy > 0 ) {
					np.style.transform = `translateY(${ dy }px)`;
				}
			},
			end: ( dx, dy, target, velocity ) => {
				np.style.removeProperty( 'transform' );
				if ( dy > 120 || velocity > 0.6 ) {
					close();
				}
			},
		} );
	}

	drag( peek, {
		move: () => {},
		end: ( dx, dy ) => {
			if ( Math.abs( dy ) > 10 ) {
				swiped = true;
				setTimeout( () => ( swiped = false ), 0 );
			}
			if ( dy < -40 ) {
				sheet( sheetState === 'none' ? 'half' : 'full' );
			} else if ( dy > 40 ) {
				sheet( sheetState === 'full' ? 'half' : 'none' );
			}
		},
	} );

	function drag( zone, { move, end } ) {
		let from = null;
		zone.addEventListener( 'pointerdown', ( e ) => {
			if (
				e.pointerType === 'mouse' ||
				e.target.closest(
					'input, [role="radio"], [data-riff-action="close"], [data-riff-action="cast"]'
				)
			) {
				return;
			}
			from = {
				x: e.clientX,
				y: e.clientY,
				at: e.timeStamp,
				id: e.pointerId,
			};
			zone.classList.add( 'is-dragging' );
		} );
		zone.addEventListener( 'pointermove', ( e ) => {
			if ( from?.id === e.pointerId ) {
				move( e.clientX - from.x, e.clientY - from.y, zone );
			}
		} );
		const finish = ( e ) => {
			if ( from?.id !== e.pointerId ) {
				return;
			}
			const dx = e.clientX - from.x;
			const dy = e.clientY - from.y;
			const velocity = dy / Math.max( e.timeStamp - from.at, 1 );
			from = null;
			zone.classList.remove( 'is-dragging' );
			end( dx, dy, zone, velocity );
		};
		zone.addEventListener( 'pointerup', finish );
		zone.addEventListener( 'pointercancel', finish );
	}

	// ---- Keyboard: Space or K plays and pauses, J and L skip ten seconds, Shift+N and Shift+P
	// change track. Nothing fires while typing, and Space leaves buttons and links alone. Escape
	// closes Now Playing from anywhere, a field included. The single-key shortcuts can be turned
	// off through the riff.shortcuts filter, which is what WCAG 2.1.4 asks of them.
	document.addEventListener( 'keydown', ( e ) => {
		if (
			! track() ||
			e.defaultPrevented ||
			e.ctrlKey ||
			e.metaKey ||
			e.altKey
		) {
			return;
		}
		if ( e.key === 'Escape' && ! np.hidden ) {
			close();
			e.preventDefault();
			return;
		}
		const target = e.target;
		if (
			target.closest?.(
				'input, textarea, select, [contenteditable=""], [contenteditable="true"]'
			) ||
			! filter( 'shortcuts', true, e )
		) {
			return;
		}
		const m = el();
		const key = e.key.toLowerCase();
		if (
			( e.key === ' ' && ! target.closest?.( 'button, a, summary' ) ) ||
			( key === 'k' && ! e.shiftKey )
		) {
			toggle();
		} else if ( key === 'j' && ! e.shiftKey ) {
			m.currentTime = Math.max( 0, m.currentTime - 10 );
		} else if ( key === 'l' && ! e.shiftKey ) {
			m.currentTime = Math.min(
				m.duration || Infinity,
				m.currentTime + 10
			);
		} else if ( key === 'n' && e.shiftKey ) {
			next();
		} else if ( key === 'p' && e.shiftKey ) {
			prev();
		} else {
			return;
		}
		e.preventDefault();
	} );

	// ---- Lock screen, headphones, and the system's media controls.
	function metadata( t ) {
		if ( ! ( 'mediaSession' in navigator ) || ! window.MediaMetadata ) {
			return;
		}
		navigator.mediaSession.metadata = new window.MediaMetadata( {
			title: t.title,
			artist: t.artist,
			album: t.album || t.post?.title || '',
			artwork: ( t.art || [] ).map( ( a ) => ( {
				src: a.src,
				sizes: a.sizes,
			} ) ),
		} );
	}

	let lastPosition = 0;
	function position() {
		const m = el();
		if (
			! navigator.mediaSession?.setPositionState ||
			! Number.isFinite( m.duration )
		) {
			return;
		}
		const now = performance.now();
		if ( now - lastPosition < 1000 ) {
			return;
		}
		lastPosition = now;
		try {
			navigator.mediaSession.setPositionState( {
				duration: m.duration,
				playbackRate: m.playbackRate || 1,
				position: Math.min( m.currentTime, m.duration ),
			} );
		} catch {
			// A position past the duration throws; the next tick corrects it.
		}
	}

	if ( 'mediaSession' in navigator ) {
		const actions = {
			play: () => el().play().catch( paint ),
			pause: () => el().pause(),
			previoustrack: prev,
			nexttrack: () => next(),
			seekbackward: ( d ) =>
				( el().currentTime = Math.max(
					0,
					el().currentTime - ( d.seekOffset || 10 )
				) ),
			seekforward: ( d ) =>
				( el().currentTime =
					el().currentTime + ( d.seekOffset || 10 ) ),
			seekto: ( d ) => {
				if ( d.fastSeek && 'fastSeek' in el() ) {
					el().fastSeek( d.seekTime );
				} else {
					el().currentTime = d.seekTime;
				}
			},
			stop: dismiss,
		};
		for ( const [ action, handler ] of Object.entries( actions ) ) {
			try {
				navigator.mediaSession.setActionHandler( action, handler );
			} catch {
				// Not every browser knows every action.
			}
		}
	}

	// ---- AirPlay in Safari, Cast in Chrome. The buttons, in the bar on a phone and in Now Playing
	// everywhere, show only while a device is in reach.
	const castButtons = $$( '[data-riff-action="cast"]' );
	const castAvailable = ( available ) => {
		for ( const b of castButtons ) {
			b.hidden = ! available;
		}
	};
	if ( window.WebKitPlaybackTargetAvailabilityEvent ) {
		audio.addEventListener(
			'webkitplaybacktargetavailabilitychanged',
			( e ) => castAvailable( e.availability === 'available' )
		);
	} else if ( audio.remote?.watchAvailability ) {
		audio.remote.watchAvailability( castAvailable ).catch( () => {} );
	}
	function cast() {
		const m = el();
		if ( m.webkitShowPlaybackTargetPicker ) {
			m.webkitShowPlaybackTargetPicker();
		} else if ( m.remote?.prompt ) {
			m.remote.prompt().catch( () => {} );
		}
	}

	// ---- Now Playing's background takes its colour from the artwork, darkened so text stays legible.
	const tints = new Map();
	function tint( src ) {
		if ( ! src ) {
			root.style.removeProperty( '--riff-tint' );
			return;
		}
		if ( tints.has( src ) ) {
			root.style.setProperty( '--riff-tint', tints.get( src ) );
			return;
		}
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.decoding = 'async';
		img.onload = () => {
			try {
				const c = document.createElement( 'canvas' );
				c.width = c.height = 8;
				const ctx = c.getContext( '2d', { willReadFrequently: true } );
				ctx.drawImage( img, 0, 0, 8, 8 );
				const px = ctx.getImageData( 0, 0, 8, 8 ).data;
				let r = 0,
					g = 0,
					b = 0;
				for ( let i = 0; i < px.length; i += 4 ) {
					r += px[ i ];
					g += px[ i + 1 ];
					b += px[ i + 2 ];
				}
				const n = px.length / 4;
				const [ h, sat ] = hsl( r / n, g / n, b / n );
				const colour = `hsl(${ Math.round( h ) } ${ Math.round(
					Math.min( sat, 0.55 ) * 100
				) }% 22%)`;
				tints.set( src, colour );
				if (
					largest( track()?.art ) === src ||
					track()?.video?.poster === src
				) {
					root.style.setProperty( '--riff-tint', colour );
				}
			} catch {
				// An image from another origin without CORS cannot be read; the plain background stays.
			}
		};
		img.src = src;
	}

	// ---- Picking up where the listener left off. The queue and position live for the tab's
	// session. A link to another page carries the music over: the click that follows the link is
	// the gesture the new page needs to play with sound. A reload shows the same track, paused.
	function save() {
		if ( ! track() ) {
			return;
		}
		write(
			sessionStorage,
			STATE,
			JSON.stringify( {
				queue,
				order,
				pos,
				mode,
				repeat,
				shuffle,
				at: el().currentTime || 0,
				playing: ! el().paused && ! el().ended,
			} )
		);
	}
	function forget() {
		try {
			sessionStorage.removeItem( STATE );
		} catch {}
	}
	window.addEventListener( 'pagehide', save );
	// Back from the back-forward cache: the elements kept their state, the frame loop did not.
	window.addEventListener( 'pageshow', ( e ) => {
		if ( e.persisted ) {
			progress();
			if ( ! el().paused ) {
				follow();
			}
		}
	} );

	// ---- Screen Wake Lock: the screen stays on while a video plays in Now Playing, and only then.
	// The lock lets go by itself when the page is hidden, so it is asked for again on return.
	let wakeLock = null;
	async function syncWakeLock() {
		const wanted =
			mode === 'video' &&
			! video.paused &&
			! np.hidden &&
			! document.hidden;
		if ( wanted && ! wakeLock && navigator.wakeLock ) {
			try {
				wakeLock = await navigator.wakeLock.request( 'screen' );
				wakeLock.addEventListener( 'release', () => {
					wakeLock = null;
				} );
			} catch {
				wakeLock = null;
			}
		} else if ( ! wanted && wakeLock ) {
			wakeLock.release().catch( () => {} );
			wakeLock = null;
		}
	}
	for ( const ev of [ 'play', 'pause', 'ended' ] ) {
		video.addEventListener( ev, syncWakeLock );
	}
	for ( const ev of [ 'riff:open', 'riff:close', 'riff:track' ] ) {
		root.addEventListener( ev, syncWakeLock );
	}
	document.addEventListener( 'visibilitychange', syncWakeLock );

	mount();

	const saved = parse( read( sessionStorage, STATE ) );
	if (
		saved &&
		Array.isArray( saved.queue ) &&
		saved.queue.length &&
		saved.queue[ saved.order?.[ saved.pos ] ]
	) {
		queue = saved.queue;
		order = saved.order;
		pos = saved.pos;
		repeat = [ 'off', 'all', 'one' ].includes( saved.repeat )
			? saved.repeat
			: 'off';
		shuffle = !! saved.shuffle;
		mode = saved.mode === 'video' ? 'video' : 'song';
		const arrival = performance.getEntriesByType( 'navigation' )[ 0 ]?.type;
		load( {
			play: !! saved.playing && arrival !== 'reload',
			at: Number( saved.at ) || 0,
		} );
	} else {
		paint();
	}

	emit( 'ready', { queue: api.queue(), track: track() || null } );

	// ---- The app, on the page that holds it. Loaded only there, through the same public api.
	if ( document.querySelector( '[data-riff-app]' ) && data.assets?.app ) {
		import( data.assets.app )
			.then( ( m ) => m.start( api ) )
			.catch( () => {
				// Without the module the links are real links; the page still works.
			} );
	}
}

// ---- Helpers.

function parse( json ) {
	try {
		return json ? JSON.parse( json ) : null;
	} catch {
		return null;
	}
}

function read( store, key ) {
	try {
		return store.getItem( key );
	} catch {
		return null;
	}
}

function write( store, key, value ) {
	try {
		store.setItem( key, value );
	} catch {
		// Private mode or a full quota: the player works without remembering.
	}
}

function time( seconds ) {
	if ( ! Number.isFinite( seconds ) || seconds < 0 ) {
		return '0:00';
	}
	const s = Math.floor( seconds );
	const h = Math.floor( s / 3600 );
	const m = Math.floor( ( s % 3600 ) / 60 );
	const r = String( s % 60 ).padStart( 2, '0' );
	return h
		? `${ h }:${ String( m ).padStart( 2, '0' ) }:${ r }`
		: `${ m }:${ r }`;
}

function fmt( pattern, value ) {
	return String( pattern || '%s' ).replace( '%s', value );
}

// The artist and album, or the post the track came from when the file has neither, as a video
// usually does.
function subtitle( t ) {
	return (
		[ t.artist, t.album ].filter( Boolean ).join( ' • ' ) ||
		t.post?.title ||
		''
	);
}

function smallest( art ) {
	return art?.[ 0 ]?.src || '';
}

function largest( art ) {
	return art?.[ art.length - 1 ]?.src || '';
}

function esc( value ) {
	return String( value ).replace(
		/[&<>"']/g,
		( c ) =>
			( {
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				"'": '&#39;',
			} )[ c ]
	);
}

function hsl( r, g, b ) {
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max( r, g, b );
	const min = Math.min( r, g, b );
	const l = ( max + min ) / 2;
	if ( max === min ) {
		return [ 0, 0, l ];
	}
	const d = max - min;
	const sat = l > 0.5 ? d / ( 2 - max - min ) : d / ( max + min );
	let h;
	if ( max === r ) {
		h = ( g - b ) / d + ( g < b ? 6 : 0 );
	} else if ( max === g ) {
		h = ( b - r ) / d + 2;
	} else {
		h = ( r - g ) / d + 4;
	}
	return [ h * 60, sat, l ];
}
