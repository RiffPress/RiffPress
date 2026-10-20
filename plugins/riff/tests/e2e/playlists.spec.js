/**
 * Playlists, end to end: made from a track's menu or from Your Library, opened, played, reordered,
 * trimmed, renamed and deleted, as the signed-in admin; and a visitor offered a way to sign in.
 */
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const AxeBuilder = require( '@axe-core/playwright' ).default;
const { own } = require( './own' );
const { expectTidy } = require( './tidy' );

const FIXTURES = path.join( __dirname, '..', '..', '..', '..', 'packages', 'fixtures', 'compositions' );
const FILES = [
	'02 - Underground [underground].mp3',
	'03 - Trombone Detritus [detritus].mp3',
	'05 - Stole Back My Soul [stole-back].mp3',
];

let postUrl;
let listenUrl;
let audio;
const made = own();

const withArg = ( url, arg ) => url + ( url.includes( '?' ) ? '&' : '?' ) + arg;
const mine = async ( requestUtils ) => ( await requestUtils.rest( { path: '/riff/v1/users/me/playlists' } ) ).items;
async function forget( requestUtils ) {
	for ( const p of await mine( requestUtils ) ) {
		await requestUtils.rest( { method: 'DELETE', path: `/riff/v1/users/me/playlists/${ p.id }` } );
	}
}
const titles = ( page ) => page.locator( '.riff-playlist-tracks .riff-row-title' );

test.beforeAll( async ( { requestUtils } ) => {
	const cover = await made.media( requestUtils, path.join( FIXTURES, 'cover.png' ) );
	audio = [];
	for ( const file of FILES ) {
		const media = await made.media( requestUtils, path.join( FIXTURES, file ) );
		await requestUtils.rest( { method: 'POST', path: `/wp/v2/media/${ media.id }`, data: { featured_media: cover.id } } );
		audio.push( media );
	}
	postUrl = (
		await made.post( requestUtils, {
			title: `Riff playlists e2e ${ Date.now() }`,
			status: 'publish',
			content: audio
				.map( ( m ) => `<!-- wp:audio {"id":${ m.id }} --><figure class="wp-block-audio"><audio controls src="${ m.source_url }"></audio></figure><!-- /wp:audio -->` )
				.join( '' ),
		} )
	).link;
	listenUrl = ( await made.page( requestUtils, { title: 'Playlists e2e', status: 'publish', content: '<!-- wp:riff/app {"align":"full"} /-->' } ) ).link;
} );

test.beforeEach( async ( { requestUtils } ) => {
	await forget( requestUtils );
} );

test.afterAll( async ( { requestUtils } ) => {
	await forget( requestUtils );
	await made.cleanUp( requestUtils );
} );

test( 'a track\'s menu makes a playlist named after it, and adds another track to it', async ( {
	page,
	requestUtils,
} ) => {
	await page.goto( postUrl );
	await page.waitForFunction( () => typeof window.riff?.createPlaylist === 'function' );
	await page.evaluate( () => {
		window.riffPlaylistChanges = [];
		window.riff.on( 'playlist', ( d ) => window.riffPlaylistChanges.push( d.change ) );
	} );
	const menu = page.locator( '.riff-menu' );
	await page.locator( '.riff-row' ).nth( 0 ).click(); // The player shows, and with it its notices.

	await page.locator( '.riff-track' ).nth( 0 ).locator( '.riff-more-button' ).click();
	await menu.getByRole( 'menuitem', { name: 'Add to playlist' } ).click();
	await expect( menu.getByRole( 'menuitem' ).first(), 'the list of playlists opens on the same button' ).toHaveText( 'New playlist' );
	await expect( menu.getByRole( 'menuitem' ).first() ).toBeFocused();
	await page.keyboard.press( 'Enter' );
	await expect( page.locator( '.riff-toast' ) ).toHaveText( 'Added to Underground' );
	// Dark on light with room around it, not the player's paragraph reset (white, no padding).
	await expect( page.locator( '.riff-toast' ) ).toHaveCSS( 'color', 'rgb(3, 3, 3)' );
	await expect( page.locator( '.riff-toast' ) ).toHaveCSS( 'padding', '12px 16px' );
	await expect.poll( async () => ( await mine( requestUtils ) ).map( ( p ) => `${ p.title }:${ p.count }` ) ).toEqual( [ 'Underground:1' ] );

	await page.locator( '.riff-track' ).nth( 1 ).locator( '.riff-more-button' ).click();
	await menu.getByRole( 'menuitem', { name: 'Add to playlist' } ).click();
	await menu.getByRole( 'menuitem', { name: 'Underground' } ).click();
	await expect( page.locator( '.riff-toast' ) ).toHaveText( 'Added to Underground' );
	await expect.poll( async () => ( await mine( requestUtils ) )[ 0 ].count ).toBe( 2 );
	expect( await page.evaluate( () => window.riffPlaylistChanges ) ).toEqual( [ 'create', 'add' ] );
	expect( await page.evaluate( () => window.riff.playlists().map( ( p ) => p.title ) ) ).toEqual( [ 'Underground' ] );
} );

test( 'a playlist opens from Your Library, plays, reorders, loses a track, is renamed and deleted', async ( {
	page,
	requestUtils,
} ) => {
	const list = await requestUtils.rest( {
		method: 'POST',
		path: '/riff/v1/users/me/playlists',
		data: { title: 'Road trip', tracks: audio.map( ( m ) => m.id ) },
	} );
	await page.goto( withArg( listenUrl, 'riff_view=library' ) );
	await page.locator( '.riff-chip-link', { hasText: 'Playlists' } ).click();
	await expect( page ).toHaveURL( /riff_filter=playlists/ );
	const card = page.locator( `.riff-card-playlist[data-riff-playlist="${ list.id }"]` );
	await expect( card ).toContainText( 'Playlist · 3 songs' );
	expect( ( await new AxeBuilder( { page } ).include( '.riff-app' ).analyze() ).violations, 'the Playlists chip' ).toEqual( [] );

	await card.locator( '.riff-card-link' ).click();
	await expect( page ).toHaveURL( new RegExp( `riff_playlist=${ list.id }` ) );
	await expect( page.locator( '.riff-album-title' ) ).toHaveText( 'Road trip' );
	await expect( page.locator( '.riff-album-kind' ) ).toHaveText( 'Playlist' );
	await expect( titles( page ) ).toHaveText( [ 'Underground', 'Trombone Detritus', 'Stole Back My Soul' ] );
	expect( ( await new AxeBuilder( { page } ).include( '.riff-app' ).analyze() ).violations, 'a playlist' ).toEqual( [] );
	await expectTidy( page, '.riff-app-view', 'a playlist' );

	await page.locator( '[data-riff-app-action="play"]' ).click();
	await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText( 'Underground' );

	// Move down, from the row's menu: the order is kept, and the focus follows the track.
	const menu = page.locator( '.riff-menu' );
	await page.locator( '.riff-playlist-tracks .riff-more-button' ).nth( 0 ).click();
	await menu.getByRole( 'menuitem', { name: 'Move down' } ).click();
	await expect( titles( page ) ).toHaveText( [ 'Trombone Detritus', 'Underground', 'Stole Back My Soul' ] );
	await expect( page.locator( '.riff-playlist-tracks .riff-more-button' ).nth( 1 ) ).toBeFocused();
	expect( ( await requestUtils.rest( { path: `/riff/v1/users/me/playlists/${ list.id }` } ) ).ids ).toEqual( [ audio[ 1 ].id, audio[ 0 ].id, audio[ 2 ].id ] );

	await page.locator( '.riff-playlist-tracks .riff-more-button' ).nth( 2 ).click();
	await menu.getByRole( 'menuitem', { name: 'Remove from this playlist' } ).click();
	await expect( titles( page ) ).toHaveText( [ 'Trombone Detritus', 'Underground' ] );
	await expect( page.locator( '.riff-app-status' ) ).toHaveText( 'Removed from Road trip' );

	// Rename: the name becomes a field; Escape puts it back, Enter keeps the new one.
	await page.locator( '[data-riff-app-action="rename-playlist"]' ).click();
	const field = page.getByLabel( 'Playlist name' );
	await expect( field ).toBeFocused();
	await page.keyboard.press( 'Escape' );
	await expect( page.locator( '.riff-album-title' ) ).toHaveText( 'Road trip' );
	await page.locator( '[data-riff-app-action="rename-playlist"]' ).click();
	await field.fill( 'Night drive' );
	await field.press( 'Enter' );
	await expect( page.locator( '.riff-album-title' ) ).toHaveText( 'Night drive' );
	await expect( page.locator( '[data-riff-app-action="rename-playlist"]' ) ).toBeFocused();

	page.once( 'dialog', ( d ) => d.accept() );
	await page.locator( '[data-riff-app-action="delete-playlist"]' ).click();
	await expect( page ).toHaveURL( /riff_filter=playlists/ );
	await expect( page.locator( '.riff-app-empty' ) ).toContainText( 'Playlists you make show up here' );
	expect( await mine( requestUtils ) ).toEqual( [] );
} );

test( 'New playlist in the standalone app opens it, and the sidebar lists it', async ( { page } ) => {
	await page.setViewportSize( { width: 1440, height: 900 } );
	await page.goto( withArg( listenUrl.replace( /\/?$/, '/' ) + 'app/', 'riff_view=library' ) );
	await page.locator( '[data-riff-app-action="new-playlist"]' ).click();
	await expect( page ).toHaveURL( /riff_playlist=\d+/ );
	await expect( page.locator( '.riff-album-title' ) ).toHaveText( 'New playlist' );
	await expect( page.locator( '.riff-app-empty' ) ).toContainText( 'Nothing in it yet' );
	await expect( page.locator( '.riff-app-playlist[aria-current="page"]' ) ).toHaveText( 'New playlist' );
	await expectTidy( page, '.riff-app', 'a new playlist, standalone' );
	expect( ( await new AxeBuilder( { page } ).include( '.riff-app' ).analyze() ).violations ).toEqual( [] );
} );

test( 'a visitor is offered a way to sign in instead', async ( { browser, baseURL } ) => {
	const context = await browser.newContext( { baseURL, storageState: { cookies: [], origins: [] } } );
	const page = await context.newPage();
	await page.goto( postUrl );
	await page.locator( '.riff-row' ).nth( 0 ).click();
	await page.locator( '.riff-track' ).nth( 0 ).locator( '.riff-more-button' ).click();
	const item = page.locator( '.riff-menu' ).getByRole( 'menuitem', { name: 'Sign in to add to a playlist' } );
	await expect( item ).toHaveAttribute( 'href', /wp-login\.php/ );
	expect( await page.evaluate( () => window.riff.playlists() ) ).toEqual( [] );

	await page.goto( withArg( listenUrl, 'riff_view=library&riff_filter=playlists' ) );
	await expect( page.locator( '.riff-app-empty' ) ).toContainText( 'Sign in to make playlists' );
	await expect( page.locator( '[data-riff-app-action="new-playlist"]' ) ).toHaveCount( 0 );
	await context.close();
} );
