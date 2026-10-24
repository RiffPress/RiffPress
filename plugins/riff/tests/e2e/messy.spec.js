/**
 * The messy library stays tidy (#446): the albums, artists and tracks a real site has, with no
 * titles, no covers, names of one word or three hundred characters, other scripts, emoji and tags
 * that look like markup, built by `packages/benchmarks/catalog.php build messy`. Each view that
 * shows them is checked at a desktop, a middle and a phone width with the same checks as
 * tidy.spec.js. The size-budget workflow builds the library and runs this; anywhere the library
 * is not built, the test skips.
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( './own' );
const { expectTidy } = require( './tidy' );

const WIDTHS = [ 1440, 790, 390 ];
const made = own();
let listenUrl;
let views = [];

test.describe.configure( { timeout: 600000 } );

test.beforeAll( async ( { requestUtils } ) => {
	const albums = async ( search ) =>
		( await requestUtils.rest( { path: '/riff/v1/albums', params: { search, per_page: 5 } } ) ).items;
	const artists = async ( search ) =>
		( await requestUtils.rest( { path: '/riff/v1/artists', params: { search, per_page: 5 } } ) ).items;
	const boxSet = await albums( 'The Complete Bench Sessions' );
	if ( ! boxSet.length ) {
		return;
	}
	listenUrl = (
		await made.page( requestUtils, {
			title: 'Messy e2e',
			status: 'publish',
			content: '<!-- wp:riff/app {"align":"full"} /-->',
		} )
	).link;
	const hits = await albums( 'Greatest Hits' );
	const long = await albums( 'A Very Long Title' );
	const one = await albums( 'Supercalifragilistic' );
	const japanese = await albums( 'ベンチの歌' );
	const compilation = await albums( 'Now That Is What I Call Bench' );
	const markup = await artists( 'AC/DC' );
	const emoji = await artists( 'Emoji Band' );
	const posts = await requestUtils.rest( { path: '/wp/v2/posts', params: { search: 'Greatest Hits', per_page: 1 } } );
	views = [
		[ 'Albums', 'riff_view=albums' ],
		[ 'Artists', 'riff_view=artists' ],
		[ 'Tracks', 'riff_view=tracks' ],
		[ 'Posts', 'riff_view=posts' ],
		[ 'the box set', `riff_album=${ boxSet[ 0 ].id }` ],
		[ 'the compilation', `riff_album=${ compilation[ 0 ].id }` ],
		...hits.map( ( a, i ) => [ `Greatest Hits ${ i + 1 }`, `riff_album=${ a.id }` ] ),
		...long.map( ( a ) => [ 'the long title', `riff_album=${ a.id }` ] ),
		...one.map( ( a ) => [ 'the one-word name', `riff_album=${ a.id }` ] ),
		...japanese.map( ( a ) => [ 'a Japanese name', `riff_album=${ a.id }` ] ),
		...markup.map( ( a ) => [ 'an artist with markup in the name', `riff_artist=${ a.id }` ] ),
		...emoji.map( ( a ) => [ 'an artist with emoji in the name', `riff_artist=${ a.id }` ] ),
		[ 'search for the long title', 'riff_search=A+Very+Long+Title' ],
		[ 'search for the one-word name', 'riff_search=Supercalifragilistic' ],
		[ 'search for a Japanese name', 'riff_search=ベンチ' ],
		[ 'search for markup', 'riff_search=Friends' ],
		...posts.slice( 0, 1 ).map( ( p ) => [ 'a post with no cover', `riff=${ p.id }` ] ),
	];
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

test( 'every view of the messy library is tidy at every width', async ( { page } ) => {
	test.skip( ! listenUrl, 'the messy library is not built: catalog.php build messy' );
	for ( const width of WIDTHS ) {
		await page.setViewportSize( { width, height: 900 } );
		for ( const [ name, arg ] of views ) {
			await page.goto( `${ listenUrl }${ listenUrl.includes( '?' ) ? '&' : '?' }${ arg }` );
			await expect( page.locator( '[data-riff-app-ready]' ) ).toHaveCount( 1 );
			await expect( page.locator( '.riff-app-view h2' ).first() ).toBeVisible();
			await expectTidy( page, '.riff-app-view', `${ name }, ${ width }px` );
		}
	}
} );
