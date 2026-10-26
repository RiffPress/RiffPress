#!/usr/bin/env node
/* eslint-disable no-console -- a build script that says what it wrote, as og-images.js does. */
/**
 * The pictures of the player on the site's landing page, in site/: the Listen app, an album open in
 * it, Now Playing and a sung album's lyrics on a wide screen (2880×1800, with a 1440 copy), and a post, Now Playing, Up
 * next and the lyrics on a phone (780×1688), each as a PNG and an AVIF. They are taken from a site
 * that holds the demo albums and nothing else, set up as the demo's blueprint sets up Playground,
 * so the pictures show the demo a visitor will open:
 *
 *   npx wp-env reset development && npm run seed
 *   npx wp-env run cli wp rewrite structure '/%postname%/' --hard
 *   npx wp-env run cli wp post create --post_type=page --post_status=publish --post_title=Listen \
 *     --post_name=listen --page_template=listen '--post_content=<!-- wp:riff/app {"align":"full"} /-->'
 *
 * The run stops before writing anything if the site's albums are not the demo's, so a picture
 * never shows an album the demo has dropped. AVIFs need avifenc (libavif) on the PATH.
 *
 * Run: npm run docs:shots
 *   RIFF_SHOTS_URL   the site, default http://localhost:8890
 *   RIFF_SHOTS_POST  the album post's path, default /compositions/
 *   RIFF_SHOTS_TRACK the row to play, counted from 0, default 0
 *   RIFF_SHOTS_LYRICS a sung album's post, for its lyrics, default /christmas-with-the-chorus/
 *   RIFF_SHOTS_USER  and RIFF_SHOTS_PASSWORD, for the editor's pictures, default wp-env's admin / password
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );
const { execFileSync } = require( 'node:child_process' );

const ROOT = path.resolve( __dirname, '..', '..' );
const SITE = path.join( ROOT, 'site' );
const FIXTURES = path.join( ROOT, 'packages', 'fixtures' );
const BASE = ( process.env.RIFF_SHOTS_URL || 'http://localhost:8890' ).replace( /\/$/, '' );
const POST = process.env.RIFF_SHOTS_POST || '/compositions/';
const TRACK = Number( process.env.RIFF_SHOTS_TRACK || 0 );
const LYRICS = process.env.RIFF_SHOTS_LYRICS || '/christmas-with-the-chorus/';
const LYRICS_AT = 26;
const USER = process.env.RIFF_SHOTS_USER || 'admin';
const PASSWORD = process.env.RIFF_SHOTS_PASSWORD || 'password';

/**
 * The demo's album names, from each fixture's manifest.
 *
 * @return {string[]} Names, sorted.
 */
function demoAlbums() {
	return fs
		.readdirSync( FIXTURES )
		.map( ( dir ) => path.join( FIXTURES, dir, 'manifest.json' ) )
		.filter( ( file ) => fs.existsSync( file ) )
		.map( ( file ) => JSON.parse( fs.readFileSync( file, 'utf8' ) ).name )
		.sort( ( a, b ) => a.localeCompare( b ) );
}

/**
 * Stops the run unless the site's albums are exactly the demo's.
 */
async function checkAlbums() {
	const res = await fetch( `${ BASE }/wp-json/riff/v1/albums?per_page=100` );
	if ( ! res.ok ) {
		throw new Error( `No Riff at ${ BASE } (${ res.status }). Start wp-env and seed it.` );
	}
	const have = ( await res.json() ).items.map( ( a ) => a.name ).sort( ( a, b ) => a.localeCompare( b ) );
	const want = demoAlbums();
	const lower = ( list ) => list.map( ( n ) => n.toLowerCase() ).join( '\n' );
	if ( lower( have ) !== lower( want ) ) {
		throw new Error( `The site's albums are not the demo's.\n  site: ${ have.join( ', ' ) }\n  demo: ${ want.join( ', ' ) }\nReset it: npx wp-env reset development && npm run seed` );
	}
}

/**
 * Writes the PNG and its AVIFs: the full size, and for a wide picture a 1440 copy.
 *
 * @param {import('@playwright/test').Page} page The page to take.
 * @param {string}                          name The file's name, without its extension.
 * @param {boolean}                         wide Whether it is a wide-screen picture.
 */
async function save( page, name, wide ) {
	// The pointer to the window's far corner, so nothing under the last tap shows as hovered, and
	// not to the near one, where the admin bar's WordPress menu would open.
	const view = page.viewportSize();
	await page.mouse.move( view.width - 1, view.height - 1 );
	await page.waitForTimeout( 800 );
	const png = path.join( SITE, `${ name }.png` );
	await page.screenshot( { path: png } );
	console.log( `wrote site/${ name }.png` );
	const avif = ( out, width ) => {
		const args = [ '-q', '60', '-s', '4', '-j', 'all' ];
		if ( width ) {
			const tmp = path.join( SITE, `.${ name }-${ width }.png` );
			execFileSync( 'sips', [ '--resampleWidth', String( width ), png, '--out', tmp ], { stdio: 'ignore' } );
			execFileSync( 'avifenc', [ ...args, tmp, out ], { stdio: 'ignore' } );
			fs.rmSync( tmp );
		} else {
			execFileSync( 'avifenc', [ ...args, png, out ], { stdio: 'ignore' } );
		}
		console.log( `wrote site/${ path.basename( out ) }` );
	};
	avif( path.join( SITE, `${ name }.avif` ) );
	if ( wide ) {
		avif( path.join( SITE, `${ name }-1440.avif` ), 1440 );
	}
}

/**
 * Plays a row of the album post and lets it run a moment, so the bar shows a track a little way in.
 *
 * @param {import('@playwright/test').Page} page The page.
 */
async function play( page ) {
	await page.goto( BASE + POST );
	await page.locator( '.riff-row' ).nth( TRACK ).click();
	await page.locator( '.riff-bar' ).waitFor();
	await page.waitForTimeout( 3000 );
}

async function desktop( browser ) {
	const context = await browser.newContext( { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' } );
	// The desktop layout follows a fine pointer, which headless Chromium does not report; mark it
	// on the document as the desktop app's own tests do.
	await context.addInitScript( () => document.documentElement.classList.add( 'riff-desktop' ) );
	const page = await context.newPage();
	await play( page );
	await page.goto( `${ BASE }/listen/app/?riff_view=albums` );
	await page.locator( '[data-riff-app-ready]' ).waitFor();
	await save( page, 'desktop-listen', true );

	// The album being heard, open in the app: its cover, its tracks with the one playing marked, the
	// library beside it and the bar under it. Arriving in the app pauses, so it is played again.
	const album = await page.evaluate( async ( slug ) => ( await ( await fetch( `/wp-json/wp/v2/posts?slug=${ slug }` ) ).json() )[ 0 ].id, POST.replace( /\//g, '' ) );
	await page.goto( `${ BASE }/listen/app/?riff=${ album }` );
	await page.locator( '[data-riff-app-ready]' ).waitFor();
	await page.waitForTimeout( 1500 );
	if ( ! ( await page.evaluate( () => window.riff.playing() ) ) ) {
		await page.evaluate( () => window.riff.toggle() );
	}
	await page.waitForTimeout( 1500 );
	await save( page, 'desktop-album', true );
	await page.locator( '.riff-bar-info' ).click();
	await page.locator( '.riff-np' ).waitFor();
	await save( page, 'desktop-now-playing', true );

	// A sung album's words, timed to the music, a verse in: the line being sung stands out.
	await page.goto( BASE + LYRICS );
	await page.locator( '.riff-row' ).first().click();
	await page.locator( '.riff-bar' ).waitFor();
	await page.evaluate( ( at ) => window.riff.seek( at ), LYRICS_AT );
	await page.waitForTimeout( 1500 );
	await page.locator( '.riff-bar-info' ).click();
	await page.locator( '.riff-np' ).waitFor();
	await page.locator( '.riff-tab', { hasText: /lyrics/i } ).click();
	await save( page, 'desktop-lyrics', true );
	await context.close();
}

/**
 * Opens the Up next sheet all the way: a tap opens it halfway, and a finger dragging its handle up
 * opens it the rest. The handle takes touch and not a mouse, so the drag is sent as touches.
 *
 * @param {import('@playwright/test').BrowserContext} context The phone's context.
 * @param {import('@playwright/test').Page}           page    Now Playing, open.
 */
async function openSheet( context, page ) {
	const peek = page.locator( '.riff-peek' );
	await peek.click();
	await page.waitForTimeout( 400 );
	const box = await peek.boundingBox();
	const x = box.x + box.width / 2;
	const cdp = await context.newCDPSession( page );
	const touch = ( type, y ) => cdp.send( 'Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [ { x, y } ] } );
	await touch( 'touchStart', box.y + box.height / 2 );
	for ( let i = 1; i <= 10; i++ ) {
		await touch( 'touchMove', box.y + box.height / 2 - i * 30 );
	}
	await touch( 'touchEnd' );
	await page.waitForTimeout( 400 );
}

async function phone( browser, devices ) {
	const context = await browser.newContext( { ...devices[ 'iPhone 14' ], deviceScaleFactor: 2, colorScheme: 'dark' } );
	const page = await context.newPage();
	await play( page );
	// The post's tracks, from the line above the first row: the rows are what the picture is of.
	await page.evaluate( () => window.scrollTo( 0, document.querySelector( '.riff-row' ).getBoundingClientRect().top + window.scrollY - 100 ) );
	await save( page, 'phone-post', false );
	await page.locator( '.riff-bar-info' ).click();
	await page.locator( '.riff-np' ).waitFor();
	await save( page, 'phone-now-playing', false );
	await openSheet( context, page );
	await save( page, 'phone-up-next', false );

	// The sung album's words on a phone: Now Playing, the sheet up, Lyrics picked.
	await page.goto( BASE + LYRICS );
	await page.locator( '.riff-row' ).first().click();
	await page.locator( '.riff-bar' ).waitFor();
	await page.evaluate( ( at ) => window.riff.seek( at ), LYRICS_AT );
	await page.waitForTimeout( 1500 );
	await page.locator( '.riff-bar-info' ).click();
	await page.locator( '.riff-np' ).waitFor();
	await openSheet( context, page );
	await page.locator( '.riff-tab:visible', { hasText: /lyrics/i } ).click();
	await save( page, 'phone-lyrics', false );
	await context.close();
}

/**
 * Two of Add your music's pictures, in the editor, signed in as the site's admin: the Listen page
 * holding the Riff block, and a new post with an empty Playlist block. The editor's welcome guide
 * is turned off first, as an editor who has seen it once would have it.
 *
 * @param {import('@playwright/test').Browser} browser Chromium.
 */
async function guides( browser ) {
	const context = await browser.newContext( { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 } );
	const page = await context.newPage();
	await page.goto( `${ BASE }/wp-login.php` );
	await page.fill( '#user_login', USER );
	await page.fill( '#user_pass', PASSWORD );
	await page.click( '#wp-submit' );
	await page.waitForURL( /wp-admin/ );
	const settle = async () => {
		await page.waitForFunction( () => window.wp?.data?.select( 'core/editor' )?.getCurrentPostId() );
		await page.evaluate( () => {
			window.wp.data.dispatch( 'core/preferences' ).set( 'core/edit-post', 'welcomeGuide', false );
			window.wp.data.dispatch( 'core/preferences' ).set( 'core', 'enableChoosePatternModal', false );
			// The block toolbar in the top bar, so it does not cover the post's title.
			window.wp.data.dispatch( 'core/preferences' ).set( 'core', 'fixedToolbar', true );
		} );
		await page.keyboard.press( 'Escape' );
		await page.waitForTimeout( 2500 );
	};
	const listen = await page.evaluate( async ( b ) => ( await ( await fetch( `${ b }/wp-json/wp/v2/pages?slug=listen` ) ).json() )[ 0 ].id, BASE );
	await page.goto( `${ BASE }/wp-admin/post.php?post=${ listen }&action=edit` );
	await settle();
	await save( page, 'guide-riff-block', true );

	await page.goto( `${ BASE }/wp-admin/post-new.php` );
	await settle();
	await page.evaluate( () => {
		const { dispatch } = window.wp.data;
		dispatch( 'core/editor' ).editPost( { title: 'Songs of the Republic' } );
		const block = window.wp.blocks.createBlock( 'core/playlist' );
		dispatch( 'core/block-editor' ).insertBlocks( block );
		dispatch( 'core/block-editor' ).selectBlock( block.clientId );
	} );
	await page.waitForTimeout( 1500 );
	await save( page, 'guide-playlist-block', true );
	await context.close();
}

async function main() {
	const { chromium, devices } = require( '@playwright/test' );
	await checkAlbums();
	const browser = await chromium.launch( { args: [ '--autoplay-policy=no-user-gesture-required' ] } );
	try {
		await desktop( browser );
		await phone( browser, devices );
		await guides( browser );
	} finally {
		await browser.close();
	}
}

if ( require.main === module ) {
	main().catch( ( e ) => {
		console.error( e.message || e );
		process.exitCode = 1;
	} );
}

module.exports = { demoAlbums };
