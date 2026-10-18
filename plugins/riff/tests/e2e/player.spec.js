/**
 * The player, end to end: a post with three tracks and a video version, played in a real browser.
 * Runs on desktop and on an iPhone viewport (see playwright.config.js).
 *
 * The post is built once per run through the REST API from the public-domain fixtures, so the
 * suite needs nothing seeded and leaves nothing behind that another run would trip over.
 */
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( './own' );
const AxeBuilder = require( '@axe-core/playwright' ).default;

const FIXTURES = path.join(
	__dirname,
	'..',
	'..',
	'..',
	'..',
	'packages',
	'fixtures',
	'compositions'
);
const FILES = [
	'01 - Intensities in Ten Cities [intensities].mp3',
	'02 - Underground [underground].mp3',
	'03 - Trombone Detritus [detritus].mp3',
];

let postUrl;
let playlistUrl;

const made = own();

test.beforeAll( async ( { requestUtils } ) => {
	const cover = await made.media( requestUtils,
		path.join( FIXTURES, 'cover.png' )
	);
	const video = await made.media( requestUtils,
		path.join(
			FIXTURES,
			'01 - Intensities in Ten Cities [intensities].webm'
		)
	);
	const audio = [];
	for ( const file of FILES ) {
		const media = await made.media( requestUtils,
			path.join( FIXTURES, file )
		);
		await requestUtils.rest( {
			method: 'POST',
			path: `/wp/v2/media/${ media.id }`,
			data: { featured_media: cover.id },
		} );
		audio.push( media );
	}
	await requestUtils.rest( {
		method: 'POST',
		path: `/wp/v2/media/${ audio[ 0 ].id }`,
		data: { meta: { _riff_video: video.id } },
	} );
	const content = audio
		.map(
			( m ) =>
				`<!-- wp:audio {"id":${ m.id }} --><figure class="wp-block-audio"><audio controls src="${ m.source_url }"></audio></figure><!-- /wp:audio -->`
		)
		.join( '' );
	const post = await made.post( requestUtils, {
		title: `Riff e2e ${ Date.now() }`,
		status: 'publish',
		content,
		featured_media: cover.id,
	} );
	postUrl = post.link;

	// The same tracks as one playlist block (WordPress 7.1), the way the editor saves it: the
	// track blocks are dynamic, so they save as self-closing comments inside the list.
	const items = audio
		.map(
			( m ) =>
				`<!-- wp:playlist-track {"id":${ m.id },"src":"${ m.source_url }","title":"${ m.title.raw }"} /-->`
		)
		.join( '' );
	const playlist = await made.post( requestUtils, {
		title: `Riff e2e playlist ${ Date.now() }`,
		status: 'publish',
		content: `<!-- wp:playlist --><figure class="wp-block-playlist"><ol class="wp-block-playlist__tracklist wp-block-playlist__tracklist-show-numbers">${ items }</ol></figure><!-- /wp:playlist -->`,
		featured_media: cover.id,
	} );
	playlistUrl = playlist.link;
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

const audioState = ( page ) =>
	page.evaluate( () => {
		const a = document.querySelector( '.riff-audio' );
		const v = document.querySelector( '.riff-video' );
		return {
			paused: a.paused,
			time: a.currentTime,
			videoPaused: v.paused,
			videoTime: v.currentTime,
		};
	} );

test.describe( 'Player', () => {
	test.beforeEach( async ( { page } ) => {
		await page.goto( postUrl );
	} );

	test( 'the post lists its tracks and the player stays hidden until one plays', async ( {
		page,
	} ) => {
		await expect( page.locator( '.riff-row' ) ).toHaveCount( 3 );
		await expect( page.locator( '.riff-row' ).nth( 0 ) ).toContainText(
			'Intensities in Ten Cities'
		);
		await expect( page.locator( '.riff-row' ).nth( 1 ) ).toContainText(
			'Airmen of Note'
		);
		await expect( page.locator( '#riff' ) ).toBeHidden();
		await expect(
			page.locator( '.wp-block-audio audio' ).first()
		).toBeHidden();
	} );

	test( 'a playlist block is rows too, played through the one player, with its own player kept off', async ( {
		page,
	} ) => {
		await page.goto( playlistUrl );
		// Before 7.1 the track blocks are unknown to WordPress and render as nothing.
		test.skip(
			( await page.locator( '.wp-block-playlist-track' ).count() ) === 0,
			'The playlist block arrived in WordPress 7.1.'
		);
		const rows = page.locator( '.wp-block-playlist .riff-row' );
		await expect( rows ).toHaveCount( 3 );
		await expect( rows.nth( 2 ) ).toContainText( 'Trombone Detritus' );
		// Core's player markup is there, but neither it nor its track buttons show, and the player
		// never starts, so the file is not fetched to draw a waveform.
		await expect(
			page.locator( '.wp-block-playlist__waveform-player' )
		).toBeAttached();
		await expect(
			page.locator( '.wp-block-playlist__waveform-player' )
		).toBeHidden();
		await expect(
			page.locator( '.wp-block-playlist-track__button' ).first()
		).toBeHidden();
		await expect(
			page.locator( '.wp-block-playlist__waveform-player canvas' )
		).toHaveCount( 0 );

		await rows.nth( 1 ).click();
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText(
			'Underground'
		);
		await expect
			.poll( async () => ( await audioState( page ) ).paused )
			.toBe( false );
		await expect( page.locator( '.riff-queue-list li' ) ).toHaveCount( 3 );
	} );

	test( 'a tap plays the track in the bar and the lock screen gets its metadata', async ( {
		page,
	} ) => {
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect( page.locator( '.riff-bar' ) ).toBeVisible();
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText(
			'Underground'
		);
		await expect
			.poll( async () => ( await audioState( page ) ).paused )
			.toBe( false );
		await expect
			.poll( async () => ( await audioState( page ) ).time )
			.toBeGreaterThan( 0.5 );
		await expect( page.locator( '.riff-row' ).nth( 1 ) ).toHaveAttribute(
			'data-playing',
			'true'
		);
		const session = await page.evaluate( () => ( {
			title: navigator.mediaSession?.metadata?.title,
			state: navigator.mediaSession?.playbackState,
			artwork: navigator.mediaSession?.metadata?.artwork?.length,
		} ) );
		expect( session.title ).toBe( 'Underground' );
		expect( session.state ).toBe( 'playing' );
		expect( session.artwork ).toBeGreaterThan( 0 );
	} );

	test( 'the bar opens Now Playing, which closes with Escape and returns focus', async ( {
		page,
	} ) => {
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await page.locator( '.riff-bar-info' ).click();
		const np = page.locator( '.riff-np' );
		await expect( np ).toBeVisible();
		await expect(
			np.locator( '.riff-np-title, .riff-bar-text .riff-title' ).first()
		).toContainText( 'Intensities in Ten Cities' );
		await expect(
			page.locator( 'body > :not(#riff):not(script)' ).first()
		).toHaveAttribute( 'inert', '' );
		await page.keyboard.press( 'Escape' );
		await expect( np ).toBeHidden();
		await expect( page.locator( '.riff-bar-info' ) ).toBeFocused();
	} );

	test( 'on a wide screen the art stays square and the bar keeps its measurements', async ( {
		page,
		isMobile,
	} ) => {
		test.skip( isMobile, 'the wide layout only' );
		// Tall enough that the stage could hold more than 640px of art: the cap, not the stage, must win.
		await page.setViewportSize( { width: 1440, height: 900 } );
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await page.locator( '.riff-chevron' ).click();
		const cover = await page.locator( '.riff-cover' ).boundingBox();
		expect( cover.width ).toBe( cover.height );
		expect( cover.width ).toBe( 640 );
		const tabs = await page.locator( '.riff-tabs' ).boundingBox();
		const tab = await page.locator( '.riff-tab' ).boundingBox();
		expect( tab.x ).toBe( tabs.x );
		const colors = await page.evaluate( () => ( {
			repeat: getComputedStyle(
				document.querySelector(
					'.riff-bar [data-riff-action="repeat"]'
				)
			).color,
			chevron: getComputedStyle(
				document.querySelector( '.riff-chevron' )
			).color,
		} ) );
		expect( colors.repeat ).toBe( 'rgb(144, 144, 144)' );
		expect( colors.chevron ).toBe( 'rgb(255, 255, 255)' );
		const seek = await page.locator( '.riff-bar-seek' ).boundingBox();
		await page.mouse.move( seek.x + 300, seek.y + seek.height / 2 );
		const knob = await page.locator( '.riff-knob' ).boundingBox();
		expect( knob.width ).toBe( 14 );
		// The knob rises above the bar into Now Playing's space and is drawn over it, whole.
		await expect( page.locator( '.riff-np' ) ).toBeVisible();
		await expect( page.locator( '.riff-knob' ) ).toHaveCSS( 'opacity', '1' );
		const onTop = await page.evaluate(
			( { x, y } ) =>
				!! document.elementFromPoint( x, y )?.closest( '.riff-bar' ),
			{ x: knob.x + knob.width / 2, y: knob.y + 2 }
		);
		expect( onTop ).toBe( true );
	} );

	test( 'a track with a video switches to it without losing its place', async ( {
		page,
	} ) => {
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await page.locator( '.riff-bar-info' ).click();
		const modes = page.locator( '.riff-modes' );
		await expect( modes ).toBeVisible();
		await expect
			.poll( async () => ( await audioState( page ) ).time )
			.toBeGreaterThan( 1 );
		const before = await audioState( page );
		await page.locator( '[data-riff-mode="video"]' ).click();
		await expect( page.locator( '#riff' ) ).toHaveAttribute(
			'data-mode',
			'video'
		);
		await expect
			.poll( async () => ( await audioState( page ) ).videoPaused )
			.toBe( false );
		const after = await audioState( page );
		expect( after.paused ).toBe( true );
		expect( after.videoTime ).toBeGreaterThanOrEqual( before.time - 0.5 );
		await page.locator( '[data-riff-mode="song"]' ).click();
		await expect
			.poll( async () => ( await audioState( page ) ).paused )
			.toBe( false );
		expect( ( await audioState( page ) ).videoPaused ).toBe( true );
	} );

	test( 'a track without a video has no switch', async ( { page } ) => {
		await page.locator( '.riff-row' ).nth( 2 ).click();
		await page.locator( '.riff-bar-info' ).click();
		await expect( page.locator( '.riff-modes' ) ).toBeHidden();
	} );

	test( 'up next lists the rest of the post and plays what is picked', async ( {
		page,
	} ) => {
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await page.locator( '.riff-bar-info' ).click();
		const list = page.locator( '.riff-queue-list' );
		if ( await page.locator( '.riff-peek' ).isVisible() ) {
			await page.locator( '.riff-peek' ).click();
		}
		await expect( list ).toBeVisible();
		await expect( list.locator( 'li' ) ).toHaveCount( 3 );
		await expect( list.locator( '[aria-current]' ) ).toContainText(
			'Intensities in Ten Cities'
		);
		await list.locator( 'li' ).nth( 2 ).locator( 'button' ).click();
		await expect( list.locator( '[aria-current]' ) ).toContainText(
			'Trombone Detritus'
		);
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText(
			'Trombone Detritus'
		);
	} );

	test( 'up next scrolls with a thin dark scrollbar, not the page\'s light one', async ( {
		page,
	} ) => {
		await page.locator( '.riff-row' ).nth( 0 ).click();
		const list = page.locator( '.riff-queue-list' );
		await expect( list ).toHaveCSS( 'scrollbar-width', 'thin' );
		await expect( list ).toHaveCSS( 'color-scheme', 'dark' );
	} );

	test( 'the bars on the current Up next item follow the music, like the row\'s', async ( {
		page,
	}, testInfo ) => {
		test.skip( testInfo.project.name === 'iphone', 'no analyser on iOS' );
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		await page.reload();
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-live', '' );
		await page.locator( '.riff-bar-info' ).click();
		if ( await page.locator( '.riff-peek' ).isVisible() ) {
			await page.locator( '.riff-peek' ).click();
		}
		const bar = page.locator( '.riff-queue-list [aria-current] .riff-row-state i' ).first();
		await expect( bar ).toBeAttached();
		// A live reading writes a transform each frame; the keyframes are off while it runs.
		await expect
			.poll( () => bar.evaluate( ( b ) => b.style.transform ) )
			.toMatch( /scaleY\(/ );
	} );

	test( 'a file from another origin that shares over CORS is analysed; one that does not still plays', async ( {
		page,
		requestUtils,
	}, testInfo ) => {
		test.skip( testInfo.project.name === 'iphone', 'no analyser on iOS' );
		const body = require( 'node:fs' ).readFileSync( path.join( FIXTURES, FILES[ 1 ] ) );
		// Playwright answers CORS for any response it fulfils, so the origin that does not share
		// refuses the player's CORS check outright, as a browser would see it.
		const serve = ( cors ) => ( route ) =>
			! cors && route.request().method() === 'HEAD'
				? route.abort()
				: route.fulfill( {
						status: 200,
						contentType: 'audio/mpeg',
						headers: { 'Access-Control-Allow-Origin': '*' },
						body: route.request().method() === 'HEAD' ? '' : body,
				  } );
		await page.route( 'https://shares.riff.test/**', serve( true ) );
		await page.route( 'https://private.riff.test/**', serve( false ) );
		const block = ( src ) =>
			`<!-- wp:audio --><figure class="wp-block-audio"><audio controls src="${ src }"></audio></figure><!-- /wp:audio -->`;
		const post = await requestUtils.createPost( {
			title: 'Streamed',
			status: 'publish',
			content:
				block( 'https://shares.riff.test/underground.mp3' ) +
				block( 'https://private.riff.test/underground.mp3' ),
		} );
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		await page.goto( post.link );
		const rows = page.locator( '.riff-row' );
		await rows.nth( 0 ).click();
		await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-live', '' );
		await expect
			.poll( () => page.evaluate( () => document.querySelector( '.riff-audio' ).crossOrigin ) )
			.toBe( 'anonymous' );
		// Without CORS the file plays as it always has, out of Web Audio's reach, never silenced.
		await rows.nth( 1 ).click();
		await expect
			.poll( () =>
				page.evaluate( () =>
					[ ...document.querySelectorAll( '.riff-audio, .riff-video' ) ].some(
						( m ) => m.src.includes( 'private.riff.test' ) && ! m.paused && m.currentTime > 0.5 && m.crossOrigin === null
					)
				)
			)
			.toBe( true );
	} );

	test( 'each bar on the playing row swings through its own range, not a fixed staircase', async ( {
		page,
	}, testInfo ) => {
		test.skip( testInfo.project.name === 'iphone', 'no analyser on iOS' );
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		await page.reload();
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-live', '' );
		// Three seconds of heights, read in the page every 100 ms, past the opening four seconds
		// where every band is still learning its range.
		const heights = await page.evaluate(
			() =>
				new Promise( ( resolve ) => {
					const seen = [ [], [], [] ];
					setTimeout( () => {
						const every = setInterval( () => {
							document
								.querySelector( '.riff-row[data-current]' )
								.querySelectorAll( '.riff-row-state i' )
								.forEach( ( b, k ) =>
									seen[ k ].push( parseFloat( b.style.transform.slice( 7 ) ) )
								);
							if ( seen[ 0 ].length === 30 ) {
								clearInterval( every );
								resolve( seen );
							}
						}, 100 );
					}, 4000 );
				} )
		);
		// One scale for all three bands pinned the bass bar near the top and kept the others in a
		// narrow band below it.
		for ( const bar of heights ) {
			expect( Math.max( ...bar ) - Math.min( ...bar ) ).toBeGreaterThan( 0.3 );
		}
	} );

	test( 'next, previous, repeat and shuffle', async ( { page } ) => {
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await page.locator( '.riff-bar-info' ).click();
		await expect( page.locator( '.riff-np' ) ).toBeVisible();
		const control = ( action ) =>
			page.locator( `[data-riff-action="${ action }"]:visible` ).first();
		await control( 'next' ).click();
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText(
			'Underground'
		);
		await control( 'prev' ).click();
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText(
			'Intensities in Ten Cities'
		);
		const repeat = control( 'repeat' );
		await expect( repeat ).toHaveAttribute( 'aria-label', 'Repeat off' );
		await repeat.click();
		await expect( repeat ).toHaveAttribute( 'aria-label', 'Repeat all' );
		await repeat.click();
		await expect( repeat ).toHaveAttribute( 'aria-label', 'Repeat one' );
		await expect( repeat ).toHaveAttribute( 'data-repeat', 'one' );
		const shuffle = control( 'shuffle' );
		await shuffle.click();
		await expect( shuffle ).toHaveAttribute( 'aria-pressed', 'true' );
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText(
			'Intensities in Ten Cities',
			{ timeout: 1000 }
		);
	} );

	test( 'the playing track shows its format and bit rate in the bar and Now Playing', async ( {
		page,
	} ) => {
		// In the bar and Now Playing only: in a list it is noise.
		const row = page.locator( '.riff-row' ).nth( 1 );
		await expect( row.locator( '.riff-quality' ) ).toHaveCount( 0 );
		await row.click();
		await expect(
			page.locator( '.riff-bar-end .riff-quality' )
		).toHaveText( /^MP3 · \d+ kbps$/ );
		await page.locator( '.riff-bar-info' ).click();
		await expect(
			page.locator( '.riff-np-quality .riff-quality' )
		).toHaveText( /^MP3 · \d+ kbps$/ );
	} );

	test( 'a lossless track shows its bit depth and sample rate instead of a bit rate', async ( {
		page,
		requestUtils,
	} ) => {
		const flac = await made.media( requestUtils,
			path.join( FIXTURES, '..', 'test', 'tone-24-96.flac' )
		);
		const post = await made.post( requestUtils, {
			title: `Riff e2e lossless ${ Date.now() }`,
			status: 'publish',
			content: `<!-- wp:audio {"id":${ flac.id }} --><figure class="wp-block-audio"><audio controls src="${ flac.source_url }"></audio></figure><!-- /wp:audio -->`,
		} );
		await page.goto( post.link );
		await page.locator( '.riff-row' ).first().click();
		await expect( page.locator( '.riff-bar' ) ).toBeVisible();
		await expect(
			page.locator( '.riff-np-quality .riff-quality' )
		).toHaveText( 'FLAC · 24-bit 96 kHz' );
	} );

	test( 'the single-key shortcuts can be turned off, as WCAG 2.1.4 asks', async ( {
		page,
	} ) => {
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect
			.poll( async () => ( await audioState( page ) ).time )
			.toBeGreaterThan( 0.5 );
		await page.locator( 'body' ).click( { position: { x: 5, y: 5 } } );
		await page.evaluate( () =>
			window.wp.hooks.addFilter( 'riff.shortcuts', 'test', () => false )
		);
		const before = ( await audioState( page ) ).time;
		await page.keyboard.press( 'k' );
		// Still playing: the time keeps moving past where it was when K was pressed.
		await expect
			.poll( async () => ( await audioState( page ) ).time )
			.toBeGreaterThan( before + 0.3 );
		expect( ( await audioState( page ) ).paused ).toBe( false );
		await page.evaluate( () =>
			window.wp.hooks.removeFilter( 'riff.shortcuts', 'test' )
		);
		await page.keyboard.press( 'k' );
		await expect
			.poll( async () => ( await audioState( page ) ).paused )
			.toBe( true );
	} );

	test( 'right to left, the played part grows from the right', async ( {
		page,
	} ) => {
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect( page.locator( '.riff-bar' ) ).toBeVisible();
		const origin = await page.evaluate( () => {
			document.documentElement.dir = 'rtl';
			const fill = document.querySelector(
				'.riff-bar-seek .riff-line i'
			);
			const x = parseFloat( getComputedStyle( fill ).transformOrigin );
			// Layout width: the fill is scaled by the played fraction, which is 0 before playback.
			const width = fill.offsetWidth;
			document.documentElement.dir = 'ltr';
			return { x, width };
		} );
		expect( Math.abs( origin.x - origin.width ) ).toBeLessThan( 1 );
	} );

	test( 'the seek bar shows how far the file has loaded', async ( {
		page,
	} ) => {
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect
			.poll( async () => ( await audioState( page ) ).time )
			.toBeGreaterThan( 0.5 );
		await expect
			.poll( () =>
				page.evaluate( () =>
					parseFloat(
						getComputedStyle(
							document.querySelector( '.riff-bar-seek' )
						).getPropertyValue( '--riff-buffered' )
					)
				)
			)
			.toBeGreaterThan( 0 );
	} );

	test( 'a track with a video carries a film mark by its title, nothing on the right', async ( {
		page,
	} ) => {
		const first = page.locator( '.riff-row' ).nth( 0 );
		await expect(
			first.locator( '.riff-row-title .riff-row-video' )
		).toHaveAttribute( 'aria-label', 'Video' );
		await expect( first.locator( '.riff-row-badge' ) ).toHaveCount( 0 );
		await expect(
			page.locator( '.riff-row' ).nth( 1 ).locator( '.riff-row-video' )
		).toHaveCount( 0 );
	} );

	test( 'the keyboard plays, pauses and seeks', async ( { page } ) => {
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect
			.poll( async () => ( await audioState( page ) ).time )
			.toBeGreaterThan( 0.5 );
		await page.locator( 'body' ).click( { position: { x: 5, y: 5 } } );
		await page.keyboard.press( 'Space' );
		await expect
			.poll( async () => ( await audioState( page ) ).paused )
			.toBe( true );
		const paused = ( await audioState( page ) ).time;
		await page.keyboard.press( 'l' );
		await expect
			.poll( async () => ( await audioState( page ) ).time )
			.toBeGreaterThan( paused + 9 );
		await page.keyboard.press( 'j' );
		await expect
			.poll( async () => ( await audioState( page ) ).time )
			.toBeLessThan( paused + 1 );
		await page.keyboard.press( 'k' );
		await expect
			.poll( async () => ( await audioState( page ) ).paused )
			.toBe( false );
	} );

	test( 'a reload picks up paused where it left off', async ( { page } ) => {
		await page.locator( '.riff-row' ).nth( 2 ).click();
		await expect
			.poll( async () => ( await audioState( page ) ).time )
			.toBeGreaterThan( 2 );
		await page.reload();
		await expect( page.locator( '.riff-bar' ) ).toBeVisible();
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText(
			'Trombone Detritus'
		);
		const state = await audioState( page );
		expect( state.paused ).toBe( true );
		expect( state.time ).toBeGreaterThan( 1.5 );
	} );

	test( 'a link to another page keeps playing', async ( { page } ) => {
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect
			.poll( async () => ( await audioState( page ) ).time )
			.toBeGreaterThan( 2 );
		// Any same-site link will do; the home page has no tracks of its own.
		await page.evaluate( () => {
			const a = document.createElement( 'a' );
			a.href = '/';
			a.id = 'riff-e2e-link';
			a.textContent = 'Home';
			document.body.prepend( a );
		} );
		await page.locator( '#riff-e2e-link' ).click();
		await page.waitForURL( /\/$/ );
		await expect( page.locator( '.riff-bar' ) ).toBeVisible();
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText(
			'Underground'
		);
		await expect
			.poll( async () => ( await audioState( page ) ).paused )
			.toBe( false );
		expect( ( await audioState( page ) ).time ).toBeGreaterThan( 1.5 );
	} );

	test( 'the filament lights with the music and cools when paused', async ( {
		page,
	}, testInfo ) => {
		// iOS keeps the breath: routing audio through Web Audio there breaks background playback.
		test.skip( testInfo.project.name === 'iphone', 'no analyser on iOS' );
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		await page.reload();
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await expect( page.locator( '#riff' ) ).toHaveAttribute(
			'data-live',
			''
		);
		await expect
			.poll( () =>
				page.evaluate( () =>
					Number(
						getComputedStyle(
							document.querySelector(
								'.riff-bar-seek .riff-line'
							)
						).getPropertyValue( '--riff-heat' )
					)
				)
			)
			.toBeGreaterThan( 0.2 );
		await page.locator( '.riff-bar [data-riff-action="toggle"]' ).click();
		await expect( page.locator( '#riff' ) ).not.toHaveAttribute(
			'data-live',
			''
		);
		await expect
			.poll(
				() =>
					page.evaluate( () =>
						Number(
							getComputedStyle(
								document.querySelector(
									'.riff-bar-seek .riff-line'
								)
							).getPropertyValue( '--riff-heat' )
						)
					),
				{ timeout: 6000 }
			)
			.toBeLessThan( 0.1 );
	} );

	test( 'a script can listen to the player and reshape what it plays', async ( {
		page,
	} ) => {
		// The extension surface: wp.hooks actions and filters, riff:* events, and window.riff.
		await page.evaluate( () => {
			window.__seen = [];
			window.wp.hooks.addAction( 'riff.track', 'e2e', ( detail ) =>
				window.__seen.push( 'hook:' + detail.track.title )
			);
			document
				.getElementById( 'riff' )
				.addEventListener( 'riff:play', () =>
					window.__seen.push( 'event:play' )
				);
			window.wp.hooks.addFilter( 'riff.track', 'e2e', ( track ) => ( {
				...track,
				title: track.title + ' (remix)',
			} ) );
		} );
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText(
			'Underground (remix)'
		);
		await expect
			.poll( () => page.evaluate( () => window.__seen ) )
			.toEqual(
				expect.arrayContaining( [
					'hook:Underground (remix)',
					'event:play',
				] )
			);
		const api = await page.evaluate( () => ( {
			version: window.riff.version,
			current: window.riff.current().title,
			queue: window.riff.queue().length,
			playing: window.riff.playing(),
		} ) );
		expect( api ).toEqual( {
			version: 1,
			current: 'Underground (remix)',
			queue: 3,
			playing: true,
		} );
		await page.evaluate( () => window.riff.next() );
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText(
			'Trombone Detritus (remix)'
		);
	} );

	test( 'Now Playing has no accessibility violations', async ( { page } ) => {
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await page.locator( '.riff-bar-info' ).click();
		await expect( page.locator( '.riff-np' ) ).toBeVisible();
		const results = await new AxeBuilder( { page } )
			.include( '#riff' )
			.analyze();
		expect( results.violations ).toEqual( [] );
	} );
} );
