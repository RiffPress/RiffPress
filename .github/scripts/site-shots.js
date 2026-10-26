#!/usr/bin/env node
/* eslint-disable no-console -- a build script that says what it wrote, as og-images.js does. */
/**
 * The pictures of the player on the site's landing page, in site/: the Listen app and Now Playing
 * on a wide screen (2880×1800, with a 1440 copy), and a post, Now Playing and Up next on a phone
 * (780×1688), each as a PNG and an AVIF. They are taken from a site that holds the demo albums and
 * nothing else, set up as the demo's blueprint sets up Playground, so the pictures show the demo a
 * visitor will open:
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
	// The pointer off the page, so nothing under the last tap shows as hovered.
	await page.mouse.move( 0, 0 );
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
	await page.locator( '.riff-bar-info' ).click();
	await page.locator( '.riff-np' ).waitFor();
	await save( page, 'desktop-now-playing', true );
	await context.close();
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
	// A tap opens Up next halfway; a finger dragging its handle up opens it the rest of the way.
	// The handle takes touch and not a mouse, so the drag is sent as touches.
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
	await save( page, 'phone-up-next', false );
	await context.close();
}

async function main() {
	const { chromium, devices } = require( '@playwright/test' );
	await checkAlbums();
	const browser = await chromium.launch( { args: [ '--autoplay-policy=no-user-gesture-required' ] } );
	try {
		await desktop( browser );
		await phone( browser, devices );
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
