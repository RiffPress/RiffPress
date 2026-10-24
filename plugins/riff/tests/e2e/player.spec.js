/**
 * The player, end to end: a post with three tracks and a video version, played in a real browser.
 * Runs in desktop Chromium and in Chromium at an iPhone's size; the tests tagged `@smoke` also run in
 * WebKit (see playwright.config.js).
 *
 * The post is built once per run through the REST API from the public-domain fixtures, so the
 * suite needs nothing seeded and leaves nothing behind that another run would trip over.
 */
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( './own' );

// riff.js keeps audio off Web Audio for an iPhone user agent, so the meter has no analyser there.
const iosAgent = ( testInfo ) =>
	/iP(hone|ad|od)/.test( testInfo.project.use.userAgent || '' );
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

// What the theme's system colours resolve to inside an element, for its styles to be compared with:
// they follow the color-scheme there, which is dark in the player and the page's own outside it.
const systemColours = ( locator ) =>
	locator.evaluate( ( el ) => {
		const probe = document.createElement( 'div' );
		probe.style.cssText = 'forced-color-adjust: none; background: Highlight; color: GrayText';
		el.append( probe );
		const style = getComputedStyle( probe );
		const colours = { highlight: style.backgroundColor, gray: style.color };
		probe.remove();
		return colours;
	} );

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

	test( 'a locked track is listed with a lock that leads to unlocking it, and never queued or played', async ( {
		page,
	} ) => {
		// What the server writes for a track riff_can_play refused: its details, no file, and where
		// riff_unlock_url sends the visitor.
		await page.evaluate( () => {
			const open = JSON.parse(
				document.querySelector( 'figure[data-riff-track]' ).dataset.riffTrack
			);
			const fig = document.createElement( 'figure' );
			fig.className = 'wp-block-audio riff-track';
			fig.dataset.riffTrack = JSON.stringify( {
				...open,
				id: 'locked-1',
				title: 'Members Only',
				src: '',
				video: null,
				locked: true,
				unlock: 'https://example.org/join/',
			} );
			fig.innerHTML = '<audio controls></audio>';
			document
				.querySelector( 'figure[data-riff-track]' )
				.insertAdjacentElement( 'afterend', fig );
			window.riffInternal.mount();
		} );

		const locked = page.locator( '.riff-row-locked' );
		await expect( locked ).toHaveCount( 1 );
		await expect( locked ).toContainText( 'Members Only' );
		await expect( locked ).toHaveAttribute( 'href', 'https://example.org/join/' );
		await expect( locked ).toHaveAttribute( 'aria-label', 'Unlock Members Only' );
		await expect( locked.locator( '.riff-row-lock' ) ).toBeVisible();

		await page.locator( 'button.riff-row' ).first().click();
		await expect
			.poll( () => page.evaluate( () => window.riff.queue().map( ( t ) => t.id ) ) )
			.toHaveLength( 3 );
		expect(
			await page.evaluate( () => window.riff.queue().some( ( t ) => t.locked ) ),
			'the locked track is not in the queue'
		).toBe( false );

		// The player's own API leaves it out too, and starts at the next track that plays.
		const first = await page.evaluate( () => {
			const tracks = [ ...document.querySelectorAll( 'figure[data-riff-track]' ) ].map(
				( f ) => JSON.parse( f.dataset.riffTrack )
			);
			const at = tracks.findIndex( ( t ) => t.locked );
			window.riff.play( tracks, at );
			return tracks[ at + 1 ].id;
		} );
		await expect.poll( () => page.evaluate( () => window.riff.current()?.id ) ).toBe( first );
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

	test( 'the menu on a row plays a track next or adds it to the queue, and Riff\'s own features add to it', async ( {
		page,
	} ) => {
		await page.evaluate( () => {
			window.riffQueueChanges = [];
			window.wp.hooks.addAction( 'riff.queue', 'e2e', ( d ) => window.riffQueueChanges.push( d.change ) );
			window.riffInternal.listen( 'menu', ( items, t ) => [
				...items,
				{ id: 'e2e', label: 'Say hello', run: () => ( window.riffHello = t.title ) },
			] );
		} );
		const titles = () => page.evaluate( () => window.riff.queue().map( ( t ) => t.title ) );
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await expect.poll( titles ).toHaveLength( 3 );

		const third = page.locator( '.riff-track' ).nth( 2 ).locator( '.riff-more-button' );
		await third.click();
		await expect( third ).toHaveAttribute( 'aria-expanded', 'true' );
		const menu = page.locator( '.riff-menu' );
		await expect( menu.getByRole( 'menuitem' ).first() ).toBeFocused();
		await page.keyboard.press( 'Enter' ); // Play next.
		await expect.poll( titles ).toEqual( [ 'Intensities in Ten Cities', 'Trombone Detritus', 'Underground', 'Trombone Detritus' ] );
		await expect( third ).toBeFocused();

		await page.locator( '.riff-track' ).nth( 1 ).locator( '.riff-more-button' ).click();
		await menu.getByRole( 'menuitem', { name: 'Add to queue' } ).click();
		await expect.poll( async () => ( await titles() ).at( -1 ) ).toBe( 'Underground' );

		await page.locator( '.riff-track' ).nth( 0 ).locator( '.riff-more-button' ).click();
		await page.keyboard.press( 'End' );
		await expect( menu.getByRole( 'menuitem', { name: 'Say hello' } ) ).toBeFocused();
		await page.keyboard.press( 'Enter' );
		expect( await page.evaluate( () => window.riffHello ) ).toBe( 'Intensities in Ten Cities' );
		await page.locator( '.riff-track' ).nth( 0 ).locator( '.riff-more-button' ).click();
		await page.keyboard.press( 'Escape' );
		await expect( menu ).toBeHidden();
		expect( await page.evaluate( () => window.riffQueueChanges ) ).toEqual( [ 'next', 'add' ] );
	} );

	test( 'Up next reorders by keyboard and its menu, removes a track, and clears', async ( {
		page,
		isMobile,
	} ) => {
		const titles = () => page.evaluate( () => window.riff.queue().map( ( t ) => t.title ) );
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await expect.poll( titles ).toHaveLength( 3 );
		await page.evaluate( () => window.riff.open() );
		// On a phone, Up next is a sheet pulled up from its handle.
		if ( await page.locator( '.riff-peek' ).isVisible() ) {
			await page.locator( '.riff-peek' ).click();
		}
		const list = page.locator( '.riff-queue-list' );
		await expect( list.locator( 'li' ) ).toHaveCount( 3 );

		// Alt and Up moves the last track above the one before it, and keeps the focus on it. A
		// phone has no keyboard; its menu's Move up does the same.
		if ( isMobile ) {
			await list.locator( 'li' ).nth( 2 ).locator( '.riff-more-button' ).click();
			await page.locator( '.riff-menu' ).getByRole( 'menuitem', { name: 'Move up' } ).click();
		} else {
			await list.locator( 'li' ).nth( 2 ).locator( 'button' ).first().focus();
			await page.keyboard.press( 'Alt+ArrowUp' );
			await expect( list.locator( 'li' ).nth( 1 ).locator( 'button' ).first() ).toBeFocused();
		}
		await expect.poll( titles ).toEqual( [ 'Intensities in Ten Cities', 'Trombone Detritus', 'Underground' ] );
		const said = page.locator( '#a11y-speak-polite' );
		await expect( said ).toHaveText( 'Moved to 2 of 3' );

		await list.locator( 'li' ).nth( 1 ).locator( '.riff-more-button' ).click();
		// The menu opens inside the dialog, where a screen reader kept to it can reach it.
		await expect( page.locator( '.riff-np .riff-menu' ) ).toBeVisible();
		await page.locator( '.riff-menu' ).getByRole( 'menuitem', { name: 'Move down' } ).click();
		await expect.poll( titles ).toEqual( [ 'Intensities in Ten Cities', 'Underground', 'Trombone Detritus' ] );

		await list.locator( 'li' ).nth( 2 ).locator( '.riff-more-button' ).click();
		await page.locator( '.riff-menu' ).getByRole( 'menuitem', { name: 'Remove from queue' } ).click();
		await expect.poll( titles ).toEqual( [ 'Intensities in Ten Cities', 'Underground' ] );
		await expect( said ).toHaveText( 'Removed from the queue' );
		// The list is drawn again on every change; the focus stays in it, on the nearest place left.
		await expect( list.locator( 'li' ).nth( 1 ).locator( '.riff-more-button' ) ).toBeFocused();

		// Picking a track from the keyboard keeps the focus on it as it starts.
		await list.locator( 'li' ).nth( 1 ).locator( 'button' ).first().focus();
		await page.keyboard.press( 'Enter' );
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText( 'Underground' );
		await expect( list.locator( 'li' ).nth( 1 ).locator( 'button' ).first() ).toBeFocused();

		const clear = page.locator( '[data-riff-action="clear-queue"]' );
		await expect( clear ).toBeVisible();
		await clear.focus();
		await page.keyboard.press( 'Enter' );
		await expect.poll( titles ).toEqual( [ 'Underground' ] );
		await expect( clear ).toBeHidden();
		await expect( list.locator( 'li' ).first().locator( 'button' ).first(), 'Clear hides itself and hands on the focus' ).toBeFocused();
		await expect( said ).toHaveText( 'Queue cleared' );
		expect(
			await page.evaluate( () => window.riff.playing() ),
			'the track playing plays on'
		).toBe( true );
	} );

	test( 'a tap plays the track in the bar and the lock screen gets its metadata', { tag: '@smoke' }, async ( {
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
		// Its name says which track Pause is for, among rows that all play something.
		await expect( page.locator( '.riff-row' ).nth( 1 ) ).toHaveAttribute(
			'aria-label',
			'Pause Underground'
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

	test( 'the bar opens Now Playing, which closes with Escape and returns focus', { tag: '@smoke' }, async ( {
		page,
		isMobile,
	} ) => {
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await page.locator( '.riff-bar-info' ).click();
		const np = page.locator( '.riff-np' );
		await expect( np ).toBeVisible();
		// Modal on a phone, where it covers the bar; beside the bar on a wide screen, where the bar
		// is still how the music is controlled.
		await expect( np ).toHaveAttribute( 'aria-modal', isMobile ? 'true' : 'false' );
		await expect(
			np.locator( '.riff-np-title, .riff-bar-text .riff-title' ).first()
		).toContainText( 'Intensities in Ten Cities' );
		await expect(
			page.locator( 'body > :not(#riff):not(script)' ).first()
		).toHaveAttribute( 'inert', '' );
		// The page under it stays still: no scrolling behind it, no second scrollbar beside Up next.
		const scrolls = () => page.evaluate( () => getComputedStyle( document.documentElement ).overflowY );
		expect( await scrolls() ).toBe( 'hidden' );
		await page.keyboard.press( 'Escape' );
		await expect( np ).toBeHidden();
		await expect( page.locator( '.riff-bar-info' ) ).toBeFocused();
		expect( await scrolls(), 'and scrolls again once it closes' ).not.toBe( 'hidden' );
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
		const tab = await page.locator( '.riff-tab' ).first().boundingBox();
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
		// The knob is a rail as wide as the line, slid by transform, with a 14px dot at its end.
		const knob = await page.locator( '.riff-knob' ).boundingBox();
		const dot = await page.locator( '.riff-knob' ).evaluate( ( el ) => {
			const after = getComputedStyle( el, '::after' );
			return { width: after.width, height: after.height };
		} );
		expect( dot ).toEqual( { width: '14px', height: '14px' } );
		await expect( page.locator( '.riff-knob' ) ).toHaveCSS( 'opacity', '1' );
		// The seek line sits under the transport, inside the bar, with a time at each end.
		const bar = await page.locator( '.riff-bar' ).boundingBox();
		const play = await page.locator( '.riff-bar .riff-play' ).boundingBox();
		expect( seek.y ).toBeGreaterThanOrEqual( play.y + play.height );
		expect( knob.y ).toBeGreaterThanOrEqual( bar.y );
		expect( seek.y + seek.height ).toBeLessThanOrEqual( bar.y + bar.height );
		const times = page.locator( '.riff-bar .riff-time' );
		expect( ( await times.nth( 0 ).boundingBox() ).x ).toBeLessThan( seek.x );
		expect( ( await times.nth( 1 ).boundingBox() ).x ).toBeGreaterThan( seek.x + seek.width - 1 );
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

	test( 'up next lists the rest of the post and plays what is picked', { tag: '@smoke' }, async ( {
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
		await expect( list.locator( '[aria-current]' ) ).toHaveAttribute( 'aria-current', 'true' );
		await list.locator( 'li' ).nth( 2 ).locator( 'button' ).first().click();
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
		test.skip( iosAgent( testInfo ), 'no analyser on iOS' );
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
		test.skip( iosAgent( testInfo ), 'no analyser on iOS' );
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
		const post = await made.post( requestUtils, {
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
		test.skip( iosAgent( testInfo ), 'no analyser on iOS' );
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
		// A screen reader hears the new track, through WordPress's live region, which Now Playing
		// leaves out of what it makes inert.
		const said = page.locator( '#a11y-speak-polite' );
		await expect( said ).toContainText( /^Now playing Underground/ );
		expect( await said.evaluate( ( el ) => !! el.closest( '[inert]' ) ) ).toBe( false );
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

	test( 'Riff\'s own features add badges and controls to the player\'s areas, and hear the meter', async ( {
		page,
	} ) => {
		await page.evaluate( () => {
			window.riffHeard = 0;
			window.riffInternal.listen( 'badges', ( list, t ) => [ ...list, { id: 'e2e', text: t ? 'Live' : '', label: 'Recorded live' } ] );
			window.riffInternal.listen( 'controls', ( list, t ) => t ? [
				...list,
				{
					id: 'e2e',
					label: 'Pin',
					pressed: !! window.riffPinned,
					run: ( track ) => ( window.riffPinned = track.title ),
				},
			] : list );
			window.riffInternal.listen( 'meter', ( { heat } ) => heat > 0 && window.riffHeard++ );
		} );
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect.poll( () => page.evaluate( () => window.riffHeard ) ).toBeGreaterThan( 0 );
		// Paused, so the short track can't end and empty the queue under the test.
		await page.evaluate( () => document.querySelectorAll( 'audio, video' ).forEach( ( m ) => m.pause() ) );
		const end = page.locator( '.riff-bar-end' );
		// After Riff's own quality pill, in the order the listeners were added.
		await expect( end.locator( '[data-riff-area="badges"] > *' ) ).toHaveText( [ /^MP3 · /, /^Live/ ] );
		// A badge's label is read in place of its short text, not only shown to a pointer.
		await expect( end.locator( '.riff-badge-e2e [aria-hidden="true"]' ) ).toHaveText( 'Live' );
		await expect( end.locator( '.riff-badge-e2e .riff-app-sr' ) ).toHaveText( 'Recorded live' );
		// The bar's copy is for a wide screen, Now Playing's for a phone, and every copy follows a press.
		const copies = page.locator( '[data-riff-control="e2e"]' );
		await expect( copies ).toHaveCount( 2 );
		await page.locator( '.riff-bar-info' ).click();
		const pin = page.getByRole( 'button', { name: 'Pin' } ).locator( 'visible=true' ).first();
		await expect( pin ).toHaveAttribute( 'aria-pressed', 'false' );
		await pin.click();
		await expect( copies.nth( 0 ) ).toHaveAttribute( 'aria-pressed', 'true' );
		await expect( copies.nth( 1 ) ).toHaveAttribute( 'aria-pressed', 'true' );
		expect( await page.evaluate( () => window.riffPinned === window.riff.current().title ) ).toBe( true );
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

	test( 'while the seek line is dragged it stays under the pointer, and lets go where it was left', async ( {
		page,
		isMobile,
	} ) => {
		test.skip( isMobile, 'the bar\'s line is a readout on a phone; Now Playing has its own' );
		await page.setViewportSize( { width: 1440, height: 900 } );
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect
			.poll( async () => ( await audioState( page ) ).time )
			.toBeGreaterThan( 0.5 );
		const seek = await page.locator( '.riff-bar-seek' ).boundingBox();
		const y = seek.y + seek.height / 2;
		await page.mouse.move( seek.x + seek.width * 0.6, y );
		await page.mouse.down();
		await page.mouse.move( seek.x + seek.width * 0.75, y, { steps: 5 } );
		// Held still while the track plays on: every frame the line must stay where the pointer
		// put it, not swap back to the time playing, which is what shook.
		const held = await page.evaluate(
			() =>
				new Promise( ( done ) => {
					const node = document.querySelector( '.riff-bar-seek' );
					const seen = [];
					const tick = () => {
						seen.push( parseFloat( node.style.getPropertyValue( '--riff-p' ) ) );
						if ( seen.length < 30 ) {
							requestAnimationFrame( tick );
						} else {
							done( seen );
						}
					};
					requestAnimationFrame( tick );
				} )
		);
		expect( Math.min( ...held ) ).toBeGreaterThan( 0.7 );
		expect( Math.max( ...held ) - Math.min( ...held ) ).toBeLessThan( 0.01 );
		await page.mouse.up();
		await expect
			.poll( async () => {
				const { time, duration } = await page.evaluate( () => {
					const m = document.querySelector( '#riff audio' );
					return { time: m.currentTime, duration: m.duration };
				} );
				return time / duration;
			} )
			.toBeGreaterThan( 0.7 );
	} );

	test( 'while a track plays the seek line glides on the compositor, and a press that moves nothing keeps it gliding', async ( {
		page,
		isMobile,
	} ) => {
		test.skip( isMobile, 'the bar\'s line, on a wide screen' );
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		await page.setViewportSize( { width: 1440, height: 900 } );
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect
			.poll( async () => ( await audioState( page ) ).time )
			.toBeGreaterThan( 0.5 );
		// Animations on the line's layers, transforms only, running: the compositor moves them.
		const gliding = () =>
			page.evaluate( () =>
				document
					.getAnimations()
					.filter(
						( a ) =>
							a.playState === 'running' &&
							a.effect?.target?.closest?.( '.riff-bar-seek' )
					)
					.map( ( a ) =>
						Object.keys( a.effect.getKeyframes()[ 0 ] ).filter(
							( k ) => ! [ 'offset', 'easing', 'composite', 'computedOffset' ].includes( k )
						)
					)
			);
		await expect.poll( async () => ( await gliding() ).length ).toBeGreaterThan( 3 );
		expect( new Set( ( await gliding() ).flat() ) ).toEqual( new Set( [ 'transform' ] ) );
		// A press and release where the line already is changes no value, so no seek follows.
		const seek = await page.locator( '.riff-bar-seek' ).boundingBox();
		const at = await page.evaluate( () => {
			const m = document.querySelector( '#riff audio' );
			return m.currentTime / m.duration;
		} );
		await page.mouse.move( seek.x + seek.width * at, seek.y + seek.height / 2 );
		await page.mouse.down();
		await page.mouse.up();
		await expect.poll( async () => ( await gliding() ).length ).toBeGreaterThan( 3 );
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

	test( 'the keyboard plays, pauses and seeks', { tag: '@smoke' }, async ( { page } ) => {
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

	test( 'the seek line moves five seconds a key, and says where it is in words', async ( { page } ) => {
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await expect
			.poll( async () => ( await audioState( page ) ).time )
			.toBeGreaterThan( 0.5 );
		await page.evaluate( () => document.querySelectorAll( 'audio, video' ).forEach( ( m ) => m.pause() ) );
		const seek = page.locator( '.riff-bar [data-riff-seek]' );
		await seek.focus();
		const before = ( await audioState( page ) ).time;
		await page.keyboard.press( 'ArrowRight' );
		const after = ( await audioState( page ) ).time;
		expect( after - before ).toBeCloseTo( 5, 1 );
		// Read the moment the key moves it, in the time just reached: not the clock's "0:06 / 7:33".
		await expect( seek ).toHaveAttribute(
			'aria-valuetext',
			`${ Math.floor( after ) } seconds of 7 minutes, 33 seconds`
		);
		await page.keyboard.press( 'ArrowLeft' );
		expect( ( await audioState( page ) ).time ).toBeCloseTo( before, 1 );
	} );

	test( 'in a contrast theme the seek line, the current track and the open tab still show', async ( { page } ) => {
		await page.emulateMedia( { forcedColors: 'active' } );
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect( page.locator( '.riff-row' ).nth( 1 ) ).toHaveAttribute( 'data-current', '' );
		// The line is a background, which a contrast theme would otherwise paint over.
		const line = page.locator( '.riff-bar .riff-line' );
		const player = await systemColours( page.locator( '.riff-bar' ) );
		await expect( line ).toHaveCSS( 'background-color', player.gray );
		await expect( line.locator( '> i:first-child' ) ).toHaveCSS( 'background-color', player.highlight );
		await expect( line.locator( '.riff-hot' ) ).toBeHidden();
		// What plays is marked as the system marks a selection, not by a shade it would drop.
		const row = page.locator( '.riff-row' ).nth( 1 );
		const post = await systemColours( row.locator( '..' ) );
		await expect( row ).toHaveCSS( 'background-color', post.highlight );
		await page.evaluate( () => window.riff.open() );
		// On a phone, the tabs are on the Up next sheet, pulled up from its handle.
		if ( await page.locator( '.riff-peek' ).isVisible() ) {
			await page.locator( '.riff-peek' ).click();
		}
		const tab = page.locator( '#riff .riff-tab[aria-selected="true"]' ).locator( 'visible=true' ).first();
		await expect( tab ).toHaveCSS( 'border-bottom-style', 'solid' );
		await expect( tab ).toHaveCSS( 'border-bottom-width', '2px' );
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
		test.skip( iosAgent( testInfo ), 'no analyser on iOS' );
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

	test( 'the glow fades out before the knob instead of ending in a square edge', async ( {
		page,
	} ) => {
		await page.locator( '.riff-row' ).nth( 0 ).click();
		const glow = await page.evaluate( () => {
			const line = document.querySelector( '.riff-bar-seek .riff-line' );
			const after = getComputedStyle( line, '::after' );
			return {
				mask: after.maskImage || after.webkitMaskImage,
				shadow: getComputedStyle( line.querySelector( '.riff-hot' ) ).boxShadow,
			};
		} );
		// The bloom is its own layer, faded at both ends: out before the knob, and in from the
		// line's start, so the line's clip shows no edge. A box-shadow on the stretched hot layer
		// is what drew the square edge.
		const [ end, start ] = glow.mask.split( /\),\s*linear-gradient/ );
		expect( end ).toMatch( /rgba\( *0, *0, *0, *0 *\)$/ );
		expect( start ).toMatch( /^\(90deg, rgba\( *0, *0, *0, *0 *\)/ );
		expect( glow.shadow ).toBe( 'none' );
		// Now Playing's seek line is plain white: no bloom tints it.
		const np = await page.evaluate(
			() =>
				getComputedStyle(
					document.querySelector( '.riff-np-seek .riff-line' ),
					'::after'
				).content
		);
		expect( np ).toBe( 'none' );
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
			members: Object.keys( window.riff ).sort(),
		} ) );
		expect( api ).toEqual( {
			version: 1,
			current: 'Underground (remix)',
			queue: 3,
			playing: true,
			// What docs/javascript.md promises, and nothing more: a member is not taken back once added.
			members: [ 'close', 'current', 'next', 'on', 'open', 'play', 'playing', 'prev', 'queue', 'seek', 'tab', 'toggle', 'version' ],
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
