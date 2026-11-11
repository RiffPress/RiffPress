/**
 * Protected files: the Media Library box moves a file behind ?riff-file=ID, which plays and seeks
 * for whoever may play it and refuses everyone else.
 */
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );

const { FIXTURES } = require( '../helpers/site' );

const made = own();
let open;
let hidden;
let openPost;

const block = ( media ) =>
	`<!-- wp:audio {"id":${ media.id }} --><figure class="wp-block-audio"><audio controls src="${ media.source_url }"></audio></figure><!-- /wp:audio -->`;

test.beforeAll( async ( { requestUtils } ) => {
	open = await made.media(
		requestUtils,
		path.join( FIXTURES, '02 - Underground [underground].mp3' )
	);
	hidden = await made.media(
		requestUtils,
		path.join( FIXTURES, '03 - Trombone Detritus [detritus].mp3' )
	);
	openPost = await made.post( requestUtils, {
		title: 'Protected, and published',
		status: 'publish',
		content: block( open ),
	} );
	const privatePost = await made.post( requestUtils, {
		title: 'Protected, and private',
		status: 'private',
		content: block( hidden ),
	} );
	for ( const [ media, post ] of [
		[ open, openPost ],
		[ hidden, privatePost ],
	] ) {
		await requestUtils.rest( {
			method: 'POST',
			path: `/wp/v2/media/${ media.id }`,
			data: { post: post.id },
		} );
	}
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

/**
 * Ticks Protected on a file's edit screen and saves.
 *
 * @param {Object} admin The admin fixture.
 * @param {Object} page  The page.
 * @param {Object} media The attachment.
 */
async function protect( admin, page, media ) {
	await admin.visitAdminPage( 'post.php', `post=${ media.id }&action=edit` );
	await page.locator( `#attachments-${ media.id }-riff_protected` ).check();
	await page.locator( '#publish' ).click();
	await expect( page.locator( '#message' ) ).toBeVisible();
}

test( 'a protected file plays and seeks through WordPress, and its post links to the new address', { tag: '@smoke' }, async ( {
	admin,
	page,
	requestUtils,
	request,
} ) => {
	await protect( admin, page, open );
	const media = await requestUtils.rest( {
		path: `/wp/v2/media/${ open.id }`,
	} );
	expect( media.source_url ).toContain( `riff-file=${ open.id }` );
	expect(
		( await request.get( open.source_url ) ).status(),
		'the old address no longer serves the file'
	).not.toBe( 200 );

	await page.goto( openPost.link );
	await expect( page.locator( '.wp-block-audio audio' ) ).toHaveAttribute(
		'src',
		new RegExp( `riff-file=${ open.id }` )
	);
	// Wait for playback, not for a 206: WebKit on Linux (GStreamer) fetches the file whole first and
	// only sometimes follows with a ranged request, so a browser's 206 is not something to wait for.
	// The direct request at the end checks Range support.
	await page.locator( '.riff-row' ).first().click();
	await expect
		.poll( () => page.evaluate( () => window.riff.playing() ), {
			timeout: 15000,
		} )
		.toBe( true );
	expect(
		await page.evaluate( () => document.querySelector( '.riff-audio' ).currentSrc )
	).toContain( `riff-file=${ open.id }` );
	await page.evaluate( () => window.riff.seek( 120 ) );
	await expect
		.poll( () =>
			page.evaluate( () => document.querySelector( '.riff-audio' ).currentTime )
		)
		.toBeGreaterThanOrEqual( 120 );

	const part = await request.get( media.source_url, {
		headers: { Range: 'bytes=100-199' },
	} );
	expect( part.status() ).toBe( 206 );
	expect( part.headers()[ 'content-range' ] ).toMatch( /^bytes 100-199\/\d+$/ );
	expect( ( await part.body() ).length ).toBe( 100 );
} );

test( 'a private post\'s protected file is refused to a visitor, and a signed address lets the player through', async ( {
	admin,
	page,
	requestUtils,
	playwright,
	baseURL,
} ) => {
	await protect( admin, page, hidden );
	const media = await requestUtils.rest( {
		path: `/wp/v2/media/${ hidden.id }`,
		params: { context: 'edit' },
	} );
	// No cookies: the suite's own requests are signed in.
	const visitor = await playwright.request.newContext( {
		baseURL,
		storageState: { cookies: [], origins: [] },
	} );

	expect( ( await visitor.get( media.source_url ) ).status() ).toBe( 403 );

	const signed = media.riff_track.src;
	expect( signed ).toContain( 'riff-sig=' );
	const answer = await visitor.get( signed, {
		headers: { Range: 'bytes=0-9' },
	} );
	expect( answer.status() ).toBe( 206 );
	expect(
		( await visitor.get( signed.replace( /riff-sig=[^&]+/, 'riff-sig=0' ) ) ).status(),
		'a forged signature'
	).toBe( 403 );
	await visitor.dispose();
} );

/**
 * A protected file on a published post, playing there from its signed address.
 *
 * @param {Object} fixtures              The test's fixtures.
 * @param {Object} fixtures.admin        The admin fixture.
 * @param {Object} fixtures.page         The page.
 * @param {Object} fixtures.requestUtils The REST helpers.
 * @param {string} title                 The post's title.
 * @return {Promise<{src: Function, signed: RegExp}>} The audio element's address, and what a
 * signed address for the file looks like.
 */
async function playingProtected( { admin, page, requestUtils }, title ) {
	const kept = await made.media(
		requestUtils,
		path.join( FIXTURES, '04 - It\'s a Brand New Day [new-day].mp3' )
	);
	const post = await made.post( requestUtils, {
		title,
		status: 'publish',
		content: block( kept ),
	} );
	await requestUtils.rest( {
		method: 'POST',
		path: `/wp/v2/media/${ kept.id }`,
		data: { post: post.id },
	} );
	await protect( admin, page, kept );
	await page.goto( post.link );
	await page.locator( '.riff-row' ).first().click();
	await expect
		.poll( () => page.evaluate( () => window.riff.playing() ), { timeout: 15000 } )
		.toBe( true );
	const src = () =>
		page.evaluate( () => document.querySelector( '.riff-audio' ).getAttribute( 'src' ) );
	const signed = new RegExp( `riff-file=${ kept.id }&riff-expires=\\d+&riff-sig=[0-9a-f]{32}$` );
	expect( await src() ).toMatch( signed );
	return { src, signed };
}

// Plays the queue's first track again from an address that ran out an hour ago, `times` times in
// a row, as Recently played hands a track back as it was kept.
const replayRanOut = ( page, times = 1 ) =>
	page.evaluate( ( n ) => {
		const t = window.riff.queue()[ 0 ];
		const src = t.src
			.replace( /riff-expires=\d+/, `riff-expires=${ Math.floor( Date.now() / 1000 ) - 3600 }` )
			.replace( /riff-sig=[^&]+/, 'riff-sig=ranout' );
		for ( let i = 0; i < n; i++ ) {
			window.riff.play( [ { ...t, src } ] );
		}
	}, times );

const tracksRoute = ( url ) => decodeURIComponent( url.href ).includes( '/riff/v1/tracks' );

test( 'a queue picked up, or a track played again from Recently played, after its signed address ran out plays from one signed again', async ( {
	admin,
	page,
	requestUtils,
} ) => {
	const { src, signed } = await playingProtected(
		{ admin, page, requestUtils },
		'Protected, and kept overnight'
	);

	// As the tab keeps it, an hour after the address stopped working; this browser's cookie would
	// still let it through, so it is the address that is checked, not that it plays.
	await page.evaluate( () => {
		const ran = ( a ) =>
			a
				.replace( /riff-expires=\d+/, `riff-expires=${ Math.floor( Date.now() / 1000 ) - 3600 }` )
				.replace( /riff-sig=[^&]+/, 'riff-sig=ranout' );
		const queue = JSON.parse( sessionStorage.getItem( 'riff:queue' ) );
		for ( const t of queue.queue ) {
			t.src = ran( t.src );
		}
		sessionStorage.setItem( 'riff:queue', JSON.stringify( queue ) );
	} );
	await page.reload();
	await expect.poll( src ).toMatch( signed );
	expect(
		await page.evaluate( () => sessionStorage.getItem( 'riff:queue' ) ),
		'the tab keeps the address signed again'
	).not.toContain( 'riff-sig=ranout' );

	// Played again from Recently played, which hands the tracks back as they were kept.
	await replayRanOut( page );
	await expect.poll( () => page.evaluate( () => window.riff.playing() ), { timeout: 15000 } ).toBe( true );
	expect( await src() ).toMatch( signed );
} );

test( 'a track whose address ran out still loads, from the address it has, when asking for a new one never answers', async ( {
	admin,
	page,
	requestUtils,
} ) => {
	const { src } = await playingProtected(
		{ admin, page, requestUtils },
		'Protected, and the site is slow'
	);
	// Asked, and never answered.
	await page.route( tracksRoute, () => {} );
	await replayRanOut( page );
	await expect.poll( src, { timeout: 6000 } ).toContain( 'riff-sig=ranout' );
} );

test( 'a track whose address ran out, played twice before the site answers, is asked for once and loads once', async ( {
	admin,
	page,
	requestUtils,
} ) => {
	const { src, signed } = await playingProtected(
		{ admin, page, requestUtils },
		'Protected, and pressed twice'
	);
	let asked = 0;
	await page.route( tracksRoute, async ( route ) => {
		asked++;
		await new Promise( ( done ) => setTimeout( done, 500 ) );
		await route.continue();
	} );
	await page.evaluate( () => {
		window.loaded = 0;
		document.addEventListener( 'riff:track', () => window.loaded++ );
	} );
	await replayRanOut( page, 2 );
	await expect.poll( () => page.evaluate( () => window.loaded ) ).toBe( 1 );
	expect( await src() ).toMatch( signed );
	// Long enough for a second answer, had there been a second request.
	await page.waitForTimeout( 1000 );
	expect( asked, 'one request' ).toBe( 1 );
	expect( await page.evaluate( () => window.loaded ), 'one load' ).toBe( 1 );
} );

test( 'a protected file plays from a folder outside the web root, and its old uploads address is gone', async ( {
	admin,
	page,
	requestUtils,
	request,
} ) => {
	const outside = await made.media(
		requestUtils,
		path.join( FIXTURES, '01 - Intensities in Ten Cities [intensities].mp3' )
	);
	const post = await made.post( requestUtils, {
		title: 'Protected, outside the web root',
		status: 'publish',
		content: block( outside ),
	} );
	await requestUtils.rest( {
		method: 'POST',
		path: `/wp/v2/media/${ outside.id }`,
		data: { post: post.id },
	} );
	const keepIn = ( folder ) =>
		requestUtils.rest( {
			method: 'POST',
			path: '/riff-test/v1/protected-path',
			data: { path: folder },
		} );
	const onDisk = async () =>
		( await requestUtils.rest( { path: `/riff-test/v1/file/${ outside.id }` } ) ).file;

	// Outside the tests site's /var/www/html, as a host's private folder is.
	await keepIn( '/tmp/riff-e2e-protected' );
	try {
		await protect( admin, page, outside );
		expect( await onDisk() ).toMatch( /^\/tmp\/riff-e2e-protected\/riff-protected-[a-z0-9]{20}\// );
		expect(
			( await request.get( outside.source_url ) ).status(),
			'nothing left at the uploads address'
		).toBe( 404 );

		const media = await requestUtils.rest( { path: `/wp/v2/media/${ outside.id }` } );
		expect( media.source_url ).toContain( `riff-file=${ outside.id }` );
		await page.goto( post.link );
		await page.locator( '.riff-row' ).first().click();
		await expect
			.poll( () => page.evaluate( () => window.riff.playing() ), { timeout: 15000 } )
			.toBe( true );
		expect(
			await page.evaluate( () => document.querySelector( '.riff-audio' ).currentSrc )
		).toContain( `riff-file=${ outside.id }` );
		const part = await request.get( media.source_url, {
			headers: { Range: 'bytes=0-99' },
		} );
		expect( part.status(), 'streamed by PHP, with ranges' ).toBe( 206 );
		expect( ( await part.body() ).length ).toBe( 100 );
	} finally {
		// Back under uploads, moved there as when a host takes the path away.
		await keepIn( '' );
	}
	expect( await onDisk() ).toMatch( /\/wp-content\/uploads\/riff-protected-[a-z0-9]{20}\// );
	expect(
		( await request.get( outside.source_url ) ).status(),
		'the uploads address still serves nothing'
	).toBe( 404 );
	expect(
		(
			await request.get( `${ outside.source_url.split( '/wp-content/' )[ 0 ] }/?riff-file=${ outside.id }`, {
				headers: { Range: 'bytes=0-9' },
			} )
		).status(),
		'and the file plays from the folder under uploads again'
	).toBe( 206 );
} );
