/**
 * Riff Chimera, end to end, on the demo's Silent Night chart, whose melody (Riff Sing's) is a duet:
 * the Chimera view opens, docked in the Listen app's sidebar or as a panel beside a post, with a
 * head for each singer; CHIMERA is fetched only then; the voices start on the listener's press,
 * sing while the song plays, sing on as the listener browses the app beside them, and stop when the
 * listener presses Stop or closes the view. Whether a voice is sounding is read from its worklet's
 * own measure of its output (the view's data-sounding), not by listening. Desktop Chromium only
 * (see playwright.config.js).
 *
 * The demo albums' audio isn't in the repository, and the suite's site isn't seeded, so the chart
 * is put on one of the public-domain compositions in a post of the spec's own, beside a track with
 * no melody, and both are deleted after.
 */
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { openView } = require( '../../../riff/tests/e2e/helpers/views' );
const { own } = require( '../../../riff/tests/e2e/helpers/own' );

const FIXTURES = path.join( __dirname, '..', '..', '..', '..', 'packages', 'fixtures' );
const SILENT_NIGHT = require( path.join( FIXTURES, 'christmas-with-the-chorus', 'manifest.json' ) ).tracks.find(
	( t ) => t.id === 'silent-night'
).melody;
const made = own();
let postUrl;
let postId;
let listenUrl;
let instrumental;

test.beforeAll( async ( { requestUtils } ) => {
	const track = async ( file, data ) => {
		const m = await made.media( requestUtils, path.join( FIXTURES, 'compositions', file ) );
		await requestUtils.rest( { method: 'POST', path: `/wp/v2/media/${ m.id }`, data } );
		return `<!-- wp:audio {"id":${ m.id }} --><figure class="wp-block-audio"><audio controls src="${ m.source_url }"></audio></figure><!-- /wp:audio -->`;
	};
	// The instrumental: the same file again, so it is as long as the track, played in its place.
	const backing = await made.media( requestUtils, path.join( FIXTURES, 'compositions', '07 - Little Dreamer Big Dreams [little-dreamer].mp3' ) );
	instrumental = backing.source_url;
	const sung = await track( '07 - Little Dreamer Big Dreams [little-dreamer].mp3', {
		title: 'Silent Night',
		riff_sing_melody: SILENT_NIGHT,
		riff_sing_instrumental: backing.id,
	} );
	const plain = await track( '08 - Convergence [convergence].mp3', { title: 'Joy to the World' } );
	const post = await made.post( requestUtils, {
		title: `Riff Chimera e2e ${ Date.now() }`,
		status: 'publish',
		content: sung + plain,
	} );
	( { link: postUrl, id: postId } = post );
	// A Listen page, for the app, whose sidebar docks the view.
	listenUrl = (
		await made.page( requestUtils, {
			title: 'Riff Chimera Listen e2e',
			status: 'publish',
			content: '<!-- wp:riff/app {"align":"full"} /-->',
		} )
	).link;
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

async function load( page, title ) {
	await page.goto( postUrl );
	await page.locator( '.riff-row', { hasText: title } ).first().click();
	await page.evaluate( () => document.querySelectorAll( 'audio, video' ).forEach( ( m ) => m.pause() ) );
}

const play = ( page ) =>
	page.evaluate( () => {
		window.riff.seek( 0 );
		if ( ! window.riff.playing() ) {
			window.riff.toggle();
		}
	} );

test( 'the Chimera button shows only for a track with a melody', async ( { page } ) => {
	await load( page, 'Joy to the World' );
	await expect( page.locator( '.riff-bar [data-riff-control="chimera"]' ) ).toBeHidden();
	await load( page, 'Silent Night' );
	await expect( page.locator( '.riff-bar [data-riff-control="chimera"]' ) ).toBeVisible();
} );

test( 'CHIMERA is fetched when the view opens, starts with the press that opens it and stops on Stop and on close', async ( { page } ) => {
	const fetched = [];
	page.on( 'request', ( r ) => {
		if ( r.url().includes( '/riff-chimera/assets/chimera/' ) ) {
			fetched.push( new URL( r.url() ).pathname.split( '/' ).pop() );
		}
	} );
	await load( page, 'Silent Night' );
	expect( fetched, 'nothing of CHIMERA with the page' ).toEqual( [] );

	const panel = await openView( page, 'chimera' );
	const view = panel.locator( '.riff-chimera' );
	await expect( view ).toHaveAttribute( 'data-ready', 'true', { timeout: 20000 } );
	expect( fetched ).toEqual( expect.arrayContaining( [ 'chimera.js', 'chimera.wasm', 'cmudict.txt' ] ) );
	await expect( panel.locator( '.riff-chimera-head canvas' ) ).toHaveCount( 2 );
	await expect( panel.locator( '.riff-chimera-name' ) ).toHaveText( [ 'Soprano', 'Alto' ] );
	await expect( panel.locator( '.riff-chimera-words' ).first() ).toContainText( 'Silent night' );
	// The press that opened the view started the voices: with the music paused they wait for it,
	// and the view doesn't start it.
	await expect( view ).toHaveAttribute( 'data-state', 'waiting', { timeout: 15000 } );
	await expect( view ).not.toHaveAttribute( 'data-sounding', 'true' );
	expect( await page.evaluate( () => window.riff.playing() ) ).toBe( false );
	await play( page );
	await expect( view ).toHaveAttribute( 'data-state', 'singing' );
	await expect( view, 'the worklet hears itself sing' ).toHaveAttribute( 'data-sounding', 'true', { timeout: 15000 } );

	const solo = panel.getByRole( 'button', { name: 'Hear Alto alone' } );
	await solo.click();
	await expect( solo ).toHaveAttribute( 'aria-pressed', 'true' );
	await expect( panel.getByRole( 'button', { name: 'Hear Soprano alone' } ) ).toHaveAttribute( 'aria-pressed', 'false' );

	// Paused, the voices hush; played again, they sing on.
	await page.evaluate( () => window.riff.toggle() );
	await expect( view ).toHaveAttribute( 'data-state', 'waiting' );
	await expect( view ).toHaveAttribute( 'data-sounding', 'false', { timeout: 5000 } );
	await page.evaluate( () => window.riff.toggle() );
	await expect( view ).toHaveAttribute( 'data-sounding', 'true', { timeout: 15000 } );

	await panel.getByRole( 'button', { name: 'Stop' } ).click();
	await expect( view ).toHaveAttribute( 'data-state', 'idle' );
	await expect( view ).toHaveAttribute( 'data-sounding', 'false' );
	await expect( panel.getByRole( 'button', { name: 'Sing along' } ) ).toBeVisible();

	// Singing again, then the view closed: its voices go with it.
	await panel.getByRole( 'button', { name: 'Sing along' } ).click();
	await expect( view ).toHaveAttribute( 'data-sounding', 'true', { timeout: 15000 } );
	await page.locator( '.riff-bar [data-riff-control="chimera"]' ).click();
	await expect( panel ).toBeHidden();
	await expect( view, 'the voices stopped with the view' ).toHaveAttribute( 'data-sounding', 'false' );
} );

test( 'while CHIMERA sings, the instrumental plays in the recording\'s place, and the recording comes back when it stops', async ( { page } ) => {
	// What the player's song element holds, and where it is.
	const playing = () =>
		page.evaluate( () => {
			const m = document.querySelector( '#riff audio' );
			return { src: m.getAttribute( 'src' ), time: m.currentTime };
		} );
	await load( page, 'Silent Night' );
	const recording = await page.evaluate( () => window.riff.current().src );
	await play( page );
	await expect.poll( () => page.evaluate( () => window.riff.time() ) ).toBeGreaterThan( 1 );
	expect( ( await playing() ).src, 'nothing changes until CHIMERA sings' ).toBe( recording );
	const before = await page.evaluate( () => window.riff.time() );

	// Opening the view starts CHIMERA, and the instrumental with it, from the same second.
	const panel = await openView( page, 'chimera' );
	const view = panel.locator( '.riff-chimera' );
	await expect.poll( async () => ( await playing() ).src, { timeout: 20000 } ).toBe( instrumental );
	expect( ( await playing() ).time, 'from the same second' ).toBeGreaterThanOrEqual( before - 0.25 );
	await expect( view ).toHaveAttribute( 'data-state', 'singing' );
	await expect( view, 'CHIMERA follows the player\'s clock over the instrumental' ).toHaveAttribute( 'data-sounding', 'true', { timeout: 15000 } );
	await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText( 'Silent Night' );

	await panel.getByRole( 'button', { name: 'Stop' } ).click();
	await expect.poll( async () => ( await playing() ).src ).toBe( recording );
	expect( await page.evaluate( () => window.riff.playing() ), 'still playing' ).toBe( true );

	// Sing along starts it again; closing the view gives the recording back too.
	await panel.getByRole( 'button', { name: 'Sing along' } ).click();
	await expect.poll( async () => ( await playing() ).src, { timeout: 15000 } ).toBe( instrumental );
	await page.locator( '.riff-bar [data-riff-control="chimera"]' ).click();
	await expect( panel ).toBeHidden();
	await expect.poll( async () => ( await playing() ).src ).toBe( recording );

	// And so does the next track, which plays from its own file.
	await openView( page, 'chimera' );
	await expect.poll( async () => ( await playing() ).src, { timeout: 15000 } ).toBe( instrumental );
	await page.evaluate( () => window.riff.next() );
	await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText( 'Joy to the World' );
	const next = await page.evaluate( () => window.riff.current().src );
	await expect.poll( async () => ( await playing() ).src ).toBe( next );
} );

test( 'a view opened with no press, as a script opens it, waits for Sing along', async ( { page } ) => {
	// The browser's answer, that nothing was pressed: Playwright's own calls into the page count as
	// presses, so the answer is given rather than waited for.
	await page.addInitScript( () =>
		Object.defineProperty( window.Navigator.prototype, 'userActivation', {
			get: () => ( { isActive: false, hasBeenActive: false } ),
		} )
	);
	await load( page, 'Silent Night' );
	await page.evaluate( () => window.riff.openView( 'chimera' ) );
	const view = page.locator( '.riff-chimera' );
	await expect( view ).toHaveAttribute( 'data-ready', 'true', { timeout: 20000 } );
	await expect( view ).toHaveAttribute( 'data-state', 'idle' );
	await expect( page.getByRole( 'button', { name: 'Sing along' } ) ).toBeVisible();
} );

test( 'a panel beside the page where there is no sidebar: a duet\'s heads side by side, nothing wider than the panel, the canvas drawn at its size', async ( { page } ) => {
	await page.setViewportSize( { width: 1440, height: 900 } );
	await load( page, 'Silent Night' );
	const panel = await openView( page, 'chimera' );
	await expect( page.locator( '.riff-side [data-riff-panel="chimera"]' ) ).toBeVisible();
	await expect( panel.locator( '.riff-chimera' ) ).toHaveAttribute( 'data-ready', 'true', { timeout: 20000 } );
	await fits( page, panel );
	const bar = await page.locator( '.riff-bar' ).evaluate( ( e ) => e.getBoundingClientRect().toJSON() );
	// The notes scroll fully into view above the bar.
	const last = panel.locator( '.riff-chimera > p:last-child' );
	await last.scrollIntoViewIfNeeded();
	expect( ( await last.boundingBox() ).y + ( await last.boundingBox() ).height, 'the last note above the bar' ).toBeLessThanOrEqual( bar.top );
} );

test( 'docked in the Listen app\'s sidebar, CHIMERA sings on as the listener browses albums and opens Now Playing, folded to the rail too, and stops when its row closes', async ( { page } ) => {
	await page.setViewportSize( { width: 1440, height: 900 } );
	await page.goto( listenUrl.replace( /\/?$/, '/' ) + `app/?riff=${ postId }` );
	await page.locator( '[data-riff-app-action="play"]' ).click();
	await page.evaluate( () => document.querySelectorAll( 'audio, video' ).forEach( ( m ) => m.pause() ) );
	await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText( 'Silent Night' );

	const toggle = page.locator( '.riff-app-bar [data-riff-dock-opens="chimera"]' );
	await expect( toggle ).toHaveAccessibleName( 'Chimera' );
	await toggle.click();
	const panel = page.locator( '.riff-app-bar [data-riff-panel="chimera"]' );
	const view = panel.locator( '.riff-chimera' );
	await expect( view ).toHaveAttribute( 'data-ready', 'true', { timeout: 20000 } );
	await expect( page.locator( '.riff-bar [data-riff-control="chimera"]' ) ).toHaveAttribute( 'aria-pressed', 'true' );
	await fits( page, panel );
	// The press on its row started the voices, as a press of its button does.
	await expect( view ).toHaveAttribute( 'data-state', 'waiting', { timeout: 15000 } );
	await play( page );
	await expect( view, 'the worklet hears itself sing' ).toHaveAttribute( 'data-sounding', 'true', { timeout: 15000 } );

	await page.locator( '.riff-app-bar a.riff-app-tab[href*="albums"]' ).click();
	await expect( page.locator( '.riff-app-brand' ) ).toHaveAttribute( 'data-riff-view', 'albums' );
	await page.locator( '.riff-bar-info' ).click();
	await expect( page.locator( '.riff-np' ) ).toBeVisible();
	await page.keyboard.press( 'Escape' );
	await expect( page.locator( '.riff-np' ) ).toBeHidden();
	await expect( view, 'still singing, browsing beside it' ).toHaveAttribute( 'data-state', 'singing' );
	await expect( view ).toHaveAttribute( 'data-sounding', 'true' );

	await page.locator( '.riff-app-collapse' ).click();
	await expect( page.locator( '[data-riff-app]' ) ).toHaveAttribute( 'data-sidebar', 'mini' );
	await expect( toggle ).toBeVisible();
	await expect( view, 'and on the rail' ).toHaveAttribute( 'data-sounding', 'true' );
	await toggle.click();
	await expect( page.locator( '[data-riff-app]' ) ).toHaveAttribute( 'data-sidebar', 'full' );
	await expect( panel ).toBeVisible();

	await toggle.click();
	await expect( panel ).toBeHidden();
	await expect( view, 'the voices stopped with the view' ).toHaveAttribute( 'data-sounding', 'false' );
} );

// Nothing in the view is wider than where it is, and a head's canvas is drawn at its size on screen
// and the screen's pixel ratio (at most 2), so it is neither blurred nor stretched.
async function fits( page, panel ) {
	expect(
		await panel.evaluate( ( el ) => [ ...el.querySelectorAll( '*' ) ].every( ( n ) => n.getBoundingClientRect().right <= el.getBoundingClientRect().right + 1 ) ),
		'nothing wider than the view'
	).toBe( true );
	const heads = await panel.locator( '.riff-chimera-heads' ).boundingBox();
	const head = await panel.locator( '.riff-chimera-head' ).first().boundingBox();
	expect( head.width, 'a duet\'s two side by side' ).toBeLessThan( heads.width / 2 );
	await expect
		.poll( () =>
			panel.locator( '.riff-chimera-head canvas' ).first().evaluate( ( c ) => {
				const r = Math.min( 2, window.devicePixelRatio || 1 );
				return c.width === Math.round( c.clientWidth * r ) && c.height === Math.round( c.clientHeight * r );
			} )
		)
		.toBe( true );
}
