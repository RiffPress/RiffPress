#!/usr/bin/env node
/* eslint-disable no-console -- a build script that says what it wrote, as og-images.js does. */
/**
 * The pictures of the player on Riff Source's pages, in site/: the Listen app, Now Playing and a
 * sung album's lyrics on a wide screen (2880×1800, with a 1440 copy), the app with nearly
 * everything open at once (desktop-everything), and a post and the lyrics on a phone (780×1688),
 * each as a PNG and an AVIF. They are taken from a site
 * that holds the demo albums and nothing else, set up as the demo's blueprint sets up Playground,
 * so the pictures show the demo a visitor will open:
 *
 *   npx wp-env reset development && npm run seed
 *   npx wp-env run cli wp option update blogname Riff   # a worktree's wp-env is named for its branch
 *   npx wp-env run cli wp theme activate twentytwentyfive   # the theme Playground's demo has
 *   npx wp-env run cli wp rewrite structure '/%postname%/' --hard
 *   npx wp-env run cli wp post create --post_type=page --post_status=publish --post_title=Listen \
 *     --post_name=listen '--post_content=<!-- wp:riff/app {"align":"full"} /-->'
 *   for who in Ada Theo Mina Jun; do user=$( echo $who | tr A-Z a-z )
 *     npx wp-env run cli wp user create $user $user@example.com --role=subscriber --user_pass=password --display_name=$who
 *     npx wp-env run cli wp user meta update $user riff_dev_avatar $user.svg
 *   done
 *
 * Ada, Theo, Mina and Jun are the other listeners in desktop-everything, signed in beside the admin
 * and each playing, so Together has someone to show. Their faces are packages/fixtures/avatars/,
 * given them by the development site's local-avatars must-use plugin as a local-avatar plugin
 * would. That picture is of a label's site, so it names the site Enqueue Records while it is
 * taken, through the settings route as its owner would, and gives the name back after.
 *
 * The page has no `listen` template, as the first-run notice's page has none: the Riff block is
 * what makes it the Listen page, and the editor's pictures fatal on WordPress 7.2 with one.
 *
 * The run stops before writing anything if the site's albums are not the demo's, so a picture
 * never shows an album the demo has dropped. AVIFs need avifenc (libavif) on the PATH.
 *
 * Run: npm run docs:shots
 *   RIFF_SHOTS_URL   the site, default http://localhost:8890
 *   RIFF_SHOTS_POST  the album post's path, default /compositions/
 *   RIFF_SHOTS_TRACK the row to play, counted from 0, default 1: Underground, which has no video
 *                    version, so a phone keeps the post on screen and Now Playing shows no Song and
 *                    Video switch
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
const TRACK = Number( process.env.RIFF_SHOTS_TRACK || 1 );
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
 * @param {Object}                          clip The part of the window to take, or the whole of it.
 */
async function save( page, name, wide, clip ) {
	// The pointer to the window's far corner, so nothing under the last tap shows as hovered, and
	// not to the near one, where the admin bar's WordPress menu would open.
	const view = page.viewportSize();
	await page.mouse.move( view.width - 1, view.height - 1 );
	await page.waitForTimeout( 800 );
	const png = path.join( SITE, `${ name }.png` );
	await page.screenshot( { path: png, ...( clip ? { clip } : {} ) } );
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
	const page = await context.newPage();
	await play( page );
	await page.goto( `${ BASE }/listen/app/?riff_view=albums` );
	await page.locator( '[data-riff-app-ready]' ).waitFor();
	await save( page, 'desktop-listen', true );

	// The album being heard, open in the app, for Now Playing to open from. Arriving in the app
	// pauses, so it is played again.
	const album = await page.evaluate( async ( slug ) => ( await ( await fetch( `/wp-json/wp/v2/posts?slug=${ slug }` ) ).json() )[ 0 ].id, POST.replace( /\//g, '' ) );
	await page.goto( `${ BASE }/listen/app/?riff=${ album }` );
	await page.locator( '[data-riff-app-ready]' ).waitFor();
	await page.waitForTimeout( 1500 );
	if ( ! ( await page.evaluate( () => window.riff.playing() ) ) ) {
		await page.evaluate( () => window.riff.toggle() );
	}
	await page.waitForTimeout( 1500 );

	// Now Playing from the bar, wide: the sleeve set down beside the turntable.
	await page.locator( '.riff-bar-info' ).click();
	await page.locator( '.riff-np' ).waitFor();
	await page.waitForTimeout( 1500 );
	await save( page, 'desktop-now-playing', true );

	// A sung album's words, timed to the music, a verse in: the line being sung stands out.
	await page.goto( BASE + LYRICS );
	await page.locator( '.riff-row' ).first().click();
	await page.locator( '.riff-bar' ).waitFor();
	await page.evaluate( ( at ) => window.riff.seek( at ), LYRICS_AT );
	await page.waitForTimeout( 1500 );
	await page.locator( '.riff-bar [data-riff-control="lyrics"]' ).click();
	await save( page, 'desktop-lyrics', true );
	await context.close();
}

async function phone( browser, devices ) {
	const context = await browser.newContext( { ...devices[ 'iPhone 14' ], deviceScaleFactor: 2, colorScheme: 'dark' } );
	const page = await context.newPage();
	await play( page );
	// The post's tracks, from the line above the first row: the rows are what the picture is of.
	await page.evaluate( () => window.scrollTo( 0, document.querySelector( '.riff-row' ).getBoundingClientRect().top + window.scrollY - 100 ) );
	await save( page, 'phone-post', false );

	// The sung album's words on a phone: Now Playing, then Lyrics from its chip.
	await page.goto( BASE + LYRICS );
	await page.locator( '.riff-row' ).first().click();
	await page.locator( '.riff-bar' ).waitFor();
	await page.evaluate( ( at ) => window.riff.seek( at ), LYRICS_AT );
	await page.waitForTimeout( 1500 );
	await page.locator( '.riff-bar-info' ).click();
	await page.locator( '.riff-np' ).waitFor();
	await page.locator( '[data-riff-chip="lyrics"]' ).click();
	await save( page, 'phone-lyrics', false );
	await context.close();
}

/**
 * Signs a browser's page in.
 *
 * @param {import('@playwright/test').Page} page     The page.
 * @param {string}                          user     The user's login.
 * @param {string}                          password Their password.
 */
async function signIn( page, user, password ) {
	await page.goto( `${ BASE }/wp-login.php` );
	await page.fill( '#user_login', user );
	await page.fill( '#user_pass', password );
	await page.click( '#wp-submit' );
	await page.waitForURL( /wp-admin/ );
}

/**
 * An album's post ID, by its path.
 *
 * @param {import('@playwright/test').Page} page The page, on the site.
 * @param {string}                          post The post's path.
 * @return {Promise<number>} The ID.
 */
function postId( page, post ) {
	return page.evaluate( async ( slug ) => ( await ( await fetch( `/wp-json/wp/v2/posts?slug=${ slug }` ) ).json() )[ 0 ].id, post.replace( /\//g, '' ) );
}

/**
 * A listener's session with nearly everything open at once, as one can have it: signed in, in the
 * Listen app, the sung album's page beside the library with a playlist of their own, the track
 * playing a verse in and liked, and Together open beside the page with four others listening. Now
 * Playing is left closed: it covers the library, and beside the turntable no panel opens.
 *
 * @param {import('@playwright/test').Browser} browser Chromium.
 */
async function everything( browser ) {
	const options = { viewport: { width: 1440, height: 900 }, colorScheme: 'dark' };
	// The others, each playing in a window of their own until the picture is taken.
	const others = [];
	const listening = [
		[ 'ada', LYRICS, 8 ],
		[ 'theo', '/songs-of-the-republic/', 2 ],
		[ 'mina', '/carols-of-the-season/', 4 ],
		[ 'jun', POST, 3 ],
	];
	for ( const [ user, post, row ] of listening ) {
		const them = await browser.newContext( options );
		const page = await them.newPage();
		await signIn( page, user, PASSWORD );
		await page.goto( `${ BASE }/listen/app/?riff=${ await postId( page, post ) }` );
		await page.locator( '[data-riff-app-ready]' ).waitFor();
		await page.locator( '.riff-row' ).nth( row ).click();
		others.push( them );
	}

	const context = await browser.newContext( { ...options, deviceScaleFactor: 2 } );
	const page = await context.newPage();
	await signIn( page, USER, PASSWORD );
	// The label's name for the site, and a playlist of their own, made once, as the library's +
	// makes it.
	await page.goto( `${ BASE }/listen/app/` );
	const rest = ( route, method = 'GET', body ) =>
		page.evaluate(
			async ( [ r, m, b ] ) => {
				window.riffShotsNonce ??= await ( await fetch( '/wp-admin/admin-ajax.php?action=rest-nonce' ) ).text();
				const headers = { 'X-WP-Nonce': window.riffShotsNonce, 'Content-Type': 'application/json' };
				return ( await fetch( `/wp-json${ r }`, { method: m, headers, body: b && JSON.stringify( b ) } ) ).json();
			},
			[ route, method, body ]
		);
	const name = ( await rest( '/wp/v2/settings' ) ).title;
	await rest( '/wp/v2/settings', 'POST', { title: 'Enqueue Records' } );
	try {
		const playlists = '/riff/v1/users/me/playlists';
		if ( ! JSON.stringify( await rest( playlists ) ).includes( 'Winter evenings' ) ) {
			const carols = ( await rest( '/wp/v2/posts?slug=carols-of-the-season' ) )[ 0 ];
			const media = await rest( `/wp/v2/media?parent=${ carols.id }&media_type=audio&per_page=5` );
			await rest( playlists, 'POST', { title: 'Winter evenings', tracks: media.map( ( m ) => m.id ) } );
		}
		await session( page );
	} finally {
		await rest( '/wp/v2/settings', 'POST', { title: name } );
	}
	await context.close();
	await Promise.all( others.map( ( them ) => them.close() ) );
}

/**
 * The sung album playing a verse in, liked, with Together open and everyone else in it.
 *
 * @param {import('@playwright/test').Page} page The admin's page, signed in.
 */
async function session( page ) {
	await page.goto( `${ BASE }/listen/app/?riff=${ await postId( page, LYRICS ) }` );
	await page.locator( '[data-riff-app-ready]' ).waitFor();
	await page.locator( '.riff-row' ).first().click();
	await page.locator( '.riff-bar' ).waitFor();
	await page.evaluate( ( at ) => window.riff.seek( at ), LYRICS_AT );
	await page.waitForTimeout( 1000 );
	const like = page.locator( '.riff-bar [data-riff-control="like"]' );
	if ( ( await like.getAttribute( 'aria-pressed' ) ) !== 'true' ) {
		await like.click();
	}
	await page.locator( '.riff-bar [data-riff-control="together"]' ).click();
	const panel = page.locator( '[data-riff-panel="together"]' );
	for ( const who of [ 'Ada', 'Theo', 'Mina', 'Jun' ] ) {
		await panel.getByText( who ).waitFor( { timeout: 30000 } );
	}
	// Their faces loaded, not still coming.
	await page.waitForFunction( () => [ ...document.querySelectorAll( '[data-riff-panel="together"] img' ) ].every( ( img ) => img.complete && img.naturalWidth ) );
	await save( page, 'desktop-everything', true );
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
		await everything( browser );
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
