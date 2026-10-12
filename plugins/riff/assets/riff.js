/* Riff: a docked player for the audio and video blocks in a post, with a Now Playing view.
 *
 * The server marks each core audio and video block with its track (data-riff-track on the figure).
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
	const $ = ( sel ) => root.querySelector( sel );
	const $$ = ( sel ) => [ ...root.querySelectorAll( sel ) ];
	const audio = $( '.riff-audio' );
	const video = $( '.riff-video' );
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
	// this script fails still plays.
	const rows = [];
	document.querySelectorAll( 'figure[data-riff-track]' ).forEach( ( fig ) => {
		const t = parse( fig.dataset.riffTrack );
		if ( ! t || ! t.src ) {
			return;
		}
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
			) }</span>` +
			`<span class="riff-row-sub">${ esc(
				subtitle( t )
			) }</span></span>` +
			( t.type === 'video' || t.video
				? `<span class="riff-row-badge">${ esc(
						s.video || 'Video'
					) }</span>`
				: '' ) +
			`<span class="riff-row-time">${
				t.duration ? time( t.duration ) : ''
			}</span>`;
		fig.insertBefore( row, fig.firstChild );
		const index = rows.length;
		rows.push( { t, row } );
		row.addEventListener( 'click', () => {
			if ( track()?.id === t.id && sameQueue() ) {
				toggle();
				return;
			}
			setQueue(
				rows.map( ( r ) => r.t ),
				index
			);
			if ( t.type === 'video' ) {
				open();
			}
		} );
	} );

	// The page's rows are the queue that is playing, so a row tap toggles instead of restarting.
	const sameQueue = () =>
		queue.length === rows.length &&
		rows.every( ( r, i ) => r.t.id === queue[ i ].id );

	// ---- The queue.
	function setQueue( tracks, index, { play = true, at = 0 } = {} ) {
		stopAll();
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
	}

	function toggle() {
		const m = el();
		if ( ! track() ) {
			return;
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

	// ---- Media events. Both elements report through the same handlers; only the one in use counts.
	for ( const m of [ audio, video ] ) {
		const live = () => m === el();
		m.addEventListener( 'play', () => live() && paint() );
		m.addEventListener( 'pause', () => live() && paint() );
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

	// ---- The filament. The played part of the bar's seek line is a wire that glows with the music:
	// lit from a live analyser where there is one, a slow breath otherwise. Its colour follows its heat,
	// near-black red when barely lit, through amber, to a pale yellow-white at the peaks, and cutting
	// the current cools it rather than switching it off. What counts as fully lit is whatever the
	// track has been reaching lately, so a quiet recording and a loud mix each use the whole wire.
	const wire = $( '[data-riff-wire]' );
	const hot = $( '[data-riff-hot]' );
	const halo = $( '[data-riff-halo]' );
	const npGlow = $( '[data-riff-npglow]' );
	const isIOS =
		/iP(hone|ad|od)/.test( navigator.userAgent ) ||
		( navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1 );
	let analyser = null;
	let meterRaf = 0;
	let coolRaf = 0;
	let breath = null;
	let bars = [];
	let bright = 0;
	let ember = 0;
	let ref = 0.5;
	let lastBright = 0;

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
			analyser.fftSize = 64;
			analyser.smoothingTimeConstant = 0.7;
			src.connect( analyser );
			analyser.connect( ctx.destination );
			audio.addEventListener( 'play', () =>
				ctx.resume().catch( () => {} )
			);
			ctx.resume().catch( () => {} );
		} catch {
			analyser = null;
		}
	}

	// Four stops, interpolated. The accent sits at the working temperature of the wire.
	const KELVIN = [
		[ 0, [ 74, 16, 0 ] ],
		[ 0.35, [ 190, 58, 12 ] ],
		[ 0.7, [ 255, 176, 32 ] ],
		[ 1, [ 255, 232, 190 ] ],
	];
	function heatColor( b ) {
		let k = 1;
		while ( k < KELVIN.length - 1 && KELVIN[ k ][ 0 ] < b ) {
			k++;
		}
		const [ t0, c0 ] = KELVIN[ k - 1 ];
		const [ t1, c1 ] = KELVIN[ k ];
		const f = Math.min( 1, Math.max( 0, ( b - t0 ) / ( t1 - t0 ) ) );
		return `rgb(${ c0
			.map( ( v, n ) => Math.round( v + ( c1[ n ] - v ) * f ) )
			.join( ' ' ) })`;
	}

	// A square root lifts the quiet end into view: speech sits around a tenth of full scale.
	function paintGlow( b ) {
		b = Math.sqrt( b );
		const c = heatColor( b );
		for ( const node of [ wire, halo, npGlow ] ) {
			if ( node ) {
				node.style.color = c;
			}
		}
		if ( wire ) {
			wire.style.opacity = ( 0.25 + 0.75 * b ).toFixed( 3 );
		}
		if ( hot ) {
			hot.style.opacity = ( 0.6 * b * b * b ).toFixed( 3 );
		}
		if ( halo ) {
			halo.style.opacity = ( 0.45 * b * b ).toFixed( 3 );
		}
		if ( npGlow ) {
			npGlow.style.opacity = ( 0.5 * b * b ).toFixed( 3 );
		}
	}

	// Pause fades it over a second and a half: fast at first, then the long red tail.
	function coolDown( from ) {
		cancelAnimationFrame( coolRaf );
		if ( reduce() ) {
			paintGlow( 0 );
			return;
		}
		const t0 = performance.now();
		const step = ( now ) => {
			const k = Math.min( 1, ( now - t0 ) / 1500 );
			paintGlow( from * Math.pow( 1 - k, 2.2 ) );
			if ( k < 1 ) {
				coolRaf = requestAnimationFrame( step );
			}
		};
		coolRaf = requestAnimationFrame( step );
	}

	function meterStop() {
		if ( ! meterRaf && ! breath ) {
			return;
		}
		cancelAnimationFrame( meterRaf );
		meterRaf = 0;
		breath?.cancel();
		breath = null;
		root.removeAttribute( 'data-live' );
		for ( const bar of bars ) {
			bar.style.transform = '';
		}
		coolDown( lastBright );
		lastBright = 0;
	}

	const liveBars = () => [
		...document.querySelectorAll(
			'.riff-row[data-current] .riff-row-state i, .riff-queue-list [aria-current] .riff-row-state i'
		),
	];

	function meterStart() {
		cancelAnimationFrame( coolRaf );
		bright = 0;
		ember = 0;
		ref = 0.5;
		if ( reduce() ) {
			paintGlow( 0.5 );
			return;
		}
		ensureAnalyser();
		if ( ! analyser || el() !== audio || ! wire ) {
			if ( wire ) {
				wire.style.color = '';
				breath = wire.animate(
					[ { opacity: 0.25 }, { opacity: 0.7 }, { opacity: 0.25 } ],
					{
						duration: 2600,
						iterations: Infinity,
						easing: 'ease-in-out',
					}
				);
			}
			return;
		}
		const bins = new Uint8Array( analyser.frequencyBinCount );
		const bands = [
			[ 1, 4 ],
			[ 4, 10 ],
			[ 10, 24 ],
		];
		root.dataset.live = '';
		bars = liveBars();
		let last = 0;
		const tick = ( now = 0 ) => {
			const dt = last ? Math.min( 0.1, ( now - last ) / 1000 ) : 0.016;
			last = now;
			analyser.getByteFrequencyData( bins );
			const levels = bands.map( ( [ a, b ] ) => {
				let sum = 0;
				for ( let n = a; n < b; n++ ) {
					sum += bins[ n ];
				}
				return Math.min( 1, sum / ( b - a ) / 200 );
			} );
			bars.forEach( ( bar, k ) => {
				bar.style.transform = `scaleY(${ ( 0.3 + 0.7 * levels[ k ] ).toFixed( 2 ) })`;
			} );
			// It lights in ~90 ms and cools over ~400 ms, so peaks swell and settle rather than
			// twitch; a slower store (~1.4 s) holds the residual heat between phrases. The
			// reference rises to a peak at once and forgets it over a few seconds.
			const raw =
				levels[ 0 ] * 0.5 + levels[ 1 ] * 0.3 + levels[ 2 ] * 0.2;
			ref =
				raw > ref
					? raw
					: ref + ( raw - ref ) * ( 1 - Math.exp( -dt / 6 ) );
			const target = Math.min( 1, raw / Math.max( 0.12, ref ) );
			const tau = target > bright ? 0.09 : 0.4;
			bright += ( target - bright ) * ( 1 - Math.exp( -dt / tau ) );
			ember += ( bright - ember ) * ( 1 - Math.exp( -dt / 1.4 ) );
			lastBright = Math.max( bright, ember * 0.45 );
			paintGlow( Math.min( 1, lastBright ) );
			meterRaf = requestAnimationFrame( tick );
		};
		tick();
	}

	// Called from paint(): the wire follows whatever is playing, and the bars follow the current row.
	function meterSync() {
		const t = track();
		if ( t && ! el().paused && ! document.hidden ) {
			if ( ! meterRaf && ! breath ) {
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
		root.style.setProperty( '--riff-p', ratio.toFixed( 4 ) );
		text( 'current', time( m.currentTime ) );
		text( 'duration', time( duration ) );
		if ( ! seeking ) {
			for ( const input of $$( '[data-riff-seek]' ) ) {
				input.value = String( Math.round( ratio * 1000 ) );
				input.setAttribute(
					'aria-valuetext',
					`${ time( m.currentTime ) } / ${ time( duration ) }`
				);
			}
		}
	}

	function text( name, value ) {
		for ( const node of $$( `[data-riff-text="${ name }"]` ) ) {
			if ( node.textContent !== value ) {
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
			root.style.setProperty(
				'--riff-p',
				( Number( input.value ) / 1000 ).toFixed( 4 )
			);
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
		for ( const node of document.body.children ) {
			if ( node !== root && ! node.inert ) {
				node.inert = true;
				node.dataset.riffInert = '';
			}
		}
		for ( const b of $$( '.riff-chevron' ) ) {
			b.setAttribute( 'aria-expanded', 'true' );
		}
		history.pushState( { ...history.state, riff: 'open' }, '' );
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
	// change track. Nothing fires while typing, and Space leaves buttons and links alone.
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
		const target = e.target;
		if (
			target.closest?.(
				'input, textarea, select, [contenteditable=""], [contenteditable="true"]'
			)
		) {
			return;
		}
		const m = el();
		const key = e.key.toLowerCase();
		if ( e.key === 'Escape' && ! np.hidden ) {
			close();
		} else if (
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

	// ---- AirPlay in Safari, Cast in Chrome. The button shows only while a device is in reach.
	const castButton = $( '[data-riff-action="cast"]' );
	if ( window.WebKitPlaybackTargetAvailabilityEvent ) {
		audio.addEventListener(
			'webkitplaybacktargetavailabilitychanged',
			( e ) => {
				castButton.hidden = e.availability !== 'available';
			}
		);
	} else if ( audio.remote?.watchAvailability ) {
		audio.remote
			.watchAvailability(
				( available ) => ( castButton.hidden = ! available )
			)
			.catch( () => {} );
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
	// session, so a reload or a link to another page shows the same track, paused at the same place.
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
			} )
		);
	}
	function forget() {
		try {
			sessionStorage.removeItem( STATE );
		} catch {}
	}
	window.addEventListener( 'pagehide', save );

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
		load( { play: false, at: Number( saved.at ) || 0 } );
	} else {
		paint();
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
