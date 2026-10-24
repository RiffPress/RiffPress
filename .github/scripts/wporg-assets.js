#!/usr/bin/env node
/* eslint-disable no-console -- a build script that says what it wrote, as og-images.js does. */
/**
 * The WordPress.org directory's pictures, in .wordpress-org/: the banner at 1544×500 and 772×250,
 * the icon at 256 and 128 and as SVG, and the six screenshots readme.txt captions. The banner and
 * icon are drawn from the brand (site/brand/, site/icons/) with the site's own fonts, as the share
 * cards are (og-images.js). The screenshots are taken from a site that holds the demo albums and
 * nothing else: a local wp-env after `npm run seed`, signed in as its admin, with a Listen page.
 * Nothing from a personal library ever goes in.
 *
 * Run: npm run docs:wporg [-- --skip-screenshots]
 *   RIFF_SHOTS_URL   the site, default http://localhost:8890
 *   RIFF_SHOTS_USER  and RIFF_SHOTS_PASSWORD, default wp-env's admin / password
 *   RIFF_SHOTS_POST  the album post's path, default /compositions/
 */
const fs = require( 'node:fs' );
const os = require( 'node:os' );
const path = require( 'node:path' );
const { pathToFileURL } = require( 'node:url' );

const ROOT = path.resolve( __dirname, '..', '..' );
const SITE = path.join( ROOT, 'site' );
const OUT = path.join( ROOT, '.wordpress-org' );
const file = ( p ) => pathToFileURL( path.join( SITE, p ) ).href;
const TRACK = process.env.RIFF_SHOTS_TRACK || 'Underground';

/**
 * The banner: the wordmark and the line on the app's black, and nothing else.
 *
 * @param {number} width The banner's width; it is drawn at 1544 and scaled.
 * @return {string} HTML.
 */
function banner( width ) {
	const scale = width / 1544;
	return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Inter; font-weight: 400 700; src: url(${ file( 'fonts/inter.woff2' ) }) format("woff2"); }
@font-face { font-family: "EB Garamond"; font-weight: 400 700; src: url(${ file( 'fonts/eb-garamond.woff2' ) }) format("woff2"); }
html, body { margin: 0; }
body { width: 1544px; height: 500px; overflow: hidden; position: relative; background: #121212; color: #fff; font-family: Inter, sans-serif; transform: scale(${ scale }); transform-origin: 0 0; }
.word { position: absolute; left: 104px; top: 96px; height: 168px; }
h1 { position: absolute; left: 108px; top: 300px; margin: 0; font-family: "EB Garamond", serif; font-weight: 400; font-size: 60px; line-height: 1; letter-spacing: -0.01em; }
p { position: absolute; left: 108px; top: 380px; margin: 0; font-size: 23px; line-height: 1.4; color: #979aa1; }
</style></head><body>
<img class="word" src="${ file( 'brand/wordmark.svg' ) }" alt="Riff">
<h1>Own every note</h1>
<p>A music player for WordPress. Publish from the Media Library; your listeners get a streaming player.</p>
</body></html>`;
}

/**
 * The icon: the mark cropped to its tile, as the favicon is, filling the square.
 *
 * @param {number} size Width and height.
 * @return {string} HTML.
 */
function icon( size ) {
	return `<!doctype html><html><head><meta charset="utf-8"><style>
html, body { margin: 0; } body { width: ${ size }px; height: ${ size }px; overflow: hidden; background: #1e1e1e; }
img { display: block; width: ${ size }px; height: ${ size }px; }
</style></head><body><img src="${ file( 'icons/favicon.svg' ) }" alt=""></body></html>`;
}

async function drawn( browser, tmp ) {
	const page = await browser.newPage( { deviceScaleFactor: 1 } );
	const shot = async ( name, markup, width, height ) => {
		const at = path.join( tmp, `${ name }.html` );
		fs.writeFileSync( at, markup );
		await page.setViewportSize( { width, height } );
		await page.goto( pathToFileURL( at ).href );
		await page.evaluate( () => document.fonts.ready );
		await page.screenshot( { path: path.join( OUT, `${ name }.png` ) } );
		console.log( `wrote .wordpress-org/${ name }.png` );
	};
	await shot( 'banner-1544x500', banner( 1544 ), 1544, 500 );
	await shot( 'banner-772x250', banner( 772 ), 772, 250 );
	await shot( 'icon-256x256', icon( 256 ), 256, 256 );
	await shot( 'icon-128x128', icon( 128 ), 128, 128 );
	fs.copyFileSync( path.join( SITE, 'icons', 'favicon.svg' ), path.join( OUT, 'icon.svg' ) );
	console.log( 'wrote .wordpress-org/icon.svg' );
	await page.close();
}

/** The six screenshots, in the order readme.txt captions them: five as a visitor sees the site. */
async function screenshots( browser ) {
	const base = ( process.env.RIFF_SHOTS_URL || 'http://localhost:8890' ).replace( /\/$/, '' );
	const user = process.env.RIFF_SHOTS_USER || 'admin';
	const password = process.env.RIFF_SHOTS_PASSWORD || 'password';
	const post = process.env.RIFF_SHOTS_POST || '/compositions/';
	const listen = `${ base }/listen/`;
	const open = () => browser.newContext( { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, colorScheme: 'dark' } );
	const save = async ( page, n ) => {
		await page.waitForTimeout( 800 );
		await page.screenshot( { path: path.join( OUT, `screenshot-${ n }.png` ) } );
		console.log( `wrote .wordpress-org/screenshot-${ n }.png` );
	};
	const ready = ( page ) => page.locator( '[data-riff-app-ready]' ).waitFor();

	// 3 and 4: the Listen page as a first visit finds it, and an album.
	let context = await open();
	let page = await context.newPage();
	await page.goto( listen );
	await ready( page );
	await save( page, 3 );
	const album = await page.evaluate( async ( b ) => ( await ( await fetch( `${ b }/wp-json/riff/v1/albums?per_page=1` ) ).json() ).items[ 0 ], base );
	await page.goto( `${ listen }?riff_album=${ album.id }` );
	await ready( page );
	await save( page, 4 );

	// 1 and 2: the bar on a post, then Now Playing.
	await page.goto( base + post );
	await page.locator( '.riff-row' ).nth( 3 ).click();
	await page.locator( '.riff-bar' ).waitFor();
	await page.evaluate( () => window.scrollTo( 0, 0 ) );
	await save( page, 1 );
	await page.locator( '.riff-bar-info' ).click();
	await page.locator( '.riff-np' ).waitFor();
	await save( page, 2 );

	// 5: Your Library, with a few things liked the way a listener likes them: the heart in the
	// bar for the playing track, and the heart on an album's and an artist's page. A visitor's
	// likes live in the browser.
	await page.keyboard.press( 'Escape' );
	await page.locator( '.riff-np' ).waitFor( { state: 'hidden' } );
	await page.locator( '.riff-bar-end .riff-like' ).click();
	await page.locator( '[data-riff-action="next"]' ).first().click();
	await page.waitForTimeout( 400 );
	await page.locator( '.riff-bar-end .riff-like' ).click();
	const artist = await page.evaluate( async ( b ) => ( await ( await fetch( `${ b }/wp-json/riff/v1/artists?per_page=1` ) ).json() ).items[ 0 ], base );
	for ( const arg of [ `riff_album=${ album.id }`, `riff_artist=${ artist.id }` ] ) {
		await page.goto( `${ listen }?${ arg }` );
		await ready( page );
		await page.locator( '.riff-app-like' ).first().click();
		await page.waitForTimeout( 400 );
	}
	await page.goto( `${ listen }?riff_view=library` );
	await ready( page );
	await save( page, 5 );
	await context.close();

	// 6: an audio file in the Media Library, with Riff's fields, as the site's own admin on the
	// local test site.
	context = await open();
	page = await context.newPage();
	await page.goto( `${ base }/wp-login.php` );
	await page.fill( '#user_login', user );
	await page.fill( '#user_pass', password );
	await page.click( '#wp-submit' );
	await page.waitForURL( /wp-admin/ );
	// An uploaded file (the demo's streamed albums have no file of their own), scrolled to Riff's fields.
	const audio = await page.evaluate( async ( [ b, q ] ) => ( await ( await fetch( `${ b }/wp-json/riff/v1/tracks?search=${ encodeURIComponent( q ) }` ) ).json() ).items[ 0 ].id, [ base, TRACK ] );
	await page.goto( `${ base }/wp-admin/upload.php?item=${ audio }` );
	await page.locator( '.media-modal .attachment-details' ).waitFor();
	const artwork = page.locator( '.media-modal .compat-item' ).getByText( 'Artwork', { exact: true } ).first();
	await artwork.waitFor();
	await artwork.evaluate( ( el ) => el.closest( 'tr, p, .setting, label' )?.scrollIntoView( { block: 'start' } ) );
	await save( page, 6 );
	await context.close();
}

async function main() {
	const { chromium } = require( '@playwright/test' );
	fs.mkdirSync( OUT, { recursive: true } );
	const tmp = fs.mkdtempSync( path.join( os.tmpdir(), 'riff-wporg-' ) );
	const browser = await chromium.launch();
	try {
		await drawn( browser, tmp );
		if ( ! process.argv.includes( '--skip-screenshots' ) ) {
			await screenshots( browser );
		}
	} finally {
		await browser.close();
		fs.rmSync( tmp, { recursive: true, force: true } );
	}
}

if ( require.main === module ) {
	main().catch( ( e ) => {
		console.error( e );
		process.exitCode = 1;
	} );
}
