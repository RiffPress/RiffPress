/**
 * What the player and app specs share: where the fixtures are, the axe rule set, and the two sites
 * a spec plays against, each built once per spec file through the REST API from the public-domain
 * fixtures, so the suite needs nothing seeded and leaves nothing behind that another run would
 * trip over. A spec makes its site through own.js (`made`), so it removes that and nothing else.
 */
const path = require( 'node:path' );

/** The demo album's folder: ten public-domain tracks, a cover, and a video version of the first. */
const FIXTURES = path.join( __dirname, '..', '..', '..', '..', '..', 'packages', 'fixtures', 'compositions' );

/** The three tracks the player specs play, in the order their post lists them. */
const FILES = [
	'01 - Intensities in Ten Cities [intensities].mp3',
	'02 - Underground [underground].mp3',
	'03 - Trombone Detritus [detritus].mp3',
];

/** WCAG 2.2 AA, with axe's best practices: what the page is held to. */
const AXE_TAGS = [ 'wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice' ];

/**
 * Whether the project runs as an iPhone. riff.js keeps audio off Web Audio for an iPhone user
 * agent, so the meter has no analyser there.
 *
 * @param {import('@playwright/test').TestInfo} testInfo The test.
 * @return {boolean} True under an iPhone user agent.
 */
const iosAgent = ( testInfo ) => /iP(hone|ad|od)/.test( testInfo.project.use.userAgent || '' );

/**
 * What the theme's system colours resolve to inside an element, for its styles to be compared
 * with: they follow the color-scheme there, which is dark in the player and the page's own outside.
 *
 * @param {import('@playwright/test').Locator} locator The element.
 * @return {Promise<{highlight: string, gray: string}>} Highlight and GrayText as computed colours.
 */
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

/**
 * Where the player's two media elements are.
 *
 * @param {import('@playwright/test').Page} page Page.
 * @return {Promise<Object>} paused and time for the audio element, videoPaused and videoTime for the video.
 */
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

/**
 * Where the audio element is, for the app specs.
 *
 * @param {import('@playwright/test').Page} page Page.
 * @return {Promise<{paused: boolean, time: number}>} Paused and time.
 */
const playing = ( page ) =>
	page.evaluate( () => {
		const a = document.querySelector( '.riff-audio' );
		return { paused: a.paused, time: a.currentTime };
	} );

/**
 * Starts keeping what the polite live region says, in order, from here on. A screen reader hears
 * each message, though the region may hold the next one by the time a test reads it.
 *
 * @param {import('@playwright/test').Page} page Page.
 * @return {Promise<void>}
 */
const listen = ( page ) =>
	page.evaluate( () => {
		window.said = [];
		const region = document.getElementById( 'a11y-speak-polite' );
		new MutationObserver( () => {
			const text = region.textContent.replace( /\u00a0/g, '' ).trim();
			if ( text && text !== window.said.at( -1 ) ) {
				window.said.push( text );
			}
		} ).observe( region, { childList: true, characterData: true, subtree: true } );
	} );

/**
 * What the polite live region has said since listen().
 *
 * @param {import('@playwright/test').Page} page Page.
 * @return {Promise<string[]>} The messages, in order.
 */
const said = ( page ) => page.evaluate( () => window.said );

/**
 * The player specs' site: a post with three tracks, each with the cover as its artwork and the
 * first with a video version, and the same tracks as one playlist block (WordPress 7.1).
 *
 * @param {Object} made         From own(): remembers what is made, for cleanUp().
 * @param {Object} requestUtils Playwright's WordPress request utils.
 * @return {Promise<{postUrl: string, playlistUrl: string}>} The two posts' addresses.
 */
async function playerSite( made, requestUtils ) {
	const cover = await made.media( requestUtils, path.join( FIXTURES, 'cover.png' ) );
	const video = await made.media( requestUtils, path.join( FIXTURES, '01 - Intensities in Ten Cities [intensities].webm' ) );
	const audio = [];
	for ( const file of FILES ) {
		const media = await made.media( requestUtils, path.join( FIXTURES, file ) );
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

	// The same tracks as one playlist block, the way the editor saves it: the track blocks are
	// dynamic, so they save as self-closing comments inside the list.
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
	return { postUrl: post.link, playlistUrl: playlist.link };
}

/**
 * The app specs' site: a page holding the Listen block, a post with two tracks, and enough older
 * posts for a second page of the library.
 *
 * @param {Object} made         From own(): remembers what is made, for cleanUp().
 * @param {Object} requestUtils Playwright's WordPress request utils.
 * @return {Promise<{pageUrl: string, postId: number, extraId: number, audioMedia: Object[]}>} The
 *         Listen page's address, the post's ID, the newest extra post's ID, and the two uploads.
 */
async function appSite( made, requestUtils ) {
	const cover = await made.media( requestUtils, path.join( FIXTURES, 'cover.png' ) );
	const audio = [];
	for ( const file of FILES.slice( 1 ) ) {
		const media = await made.media( requestUtils, path.join( FIXTURES, file ) );
		await requestUtils.rest( {
			method: 'POST',
			path: `/wp/v2/media/${ media.id }`,
			data: { featured_media: cover.id },
		} );
		audio.push( media );
	}
	// Enough older posts for a second page of the library, made first so the post below is newest.
	const block = `<!-- wp:audio {"id":${ audio[ 0 ].id }} --><figure class="wp-block-audio"><audio controls src="${ audio[ 0 ].source_url }"></audio></figure><!-- /wp:audio -->`;
	let extraId = 0;
	for ( let i = 1; i <= 24; i++ ) {
		const extra = await made.post( requestUtils, {
			title: `Riff app extra ${ i }`,
			status: 'publish',
			content: block,
			date: new Date( Date.now() - ( 100 - i ) * 60000 ).toISOString(),
		} );
		extraId = extra.id;
	}
	const post = await made.post( requestUtils, {
		title: `Riff app e2e ${ Date.now() }`,
		status: 'publish',
		content: audio
			.map(
				( m ) =>
					`<!-- wp:audio {"id":${ m.id }} --><figure class="wp-block-audio"><audio controls src="${ m.source_url }"></audio></figure><!-- /wp:audio -->`
			)
			.join( '' ),
		featured_media: cover.id,
	} );
	const page = await made.page( requestUtils, {
		title: 'Listen e2e',
		status: 'publish',
		content: '<!-- wp:riff/app {"align":"full"} /-->',
	} );
	return { pageUrl: page.link, postId: post.id, extraId, audioMedia: audio };
}

module.exports = { FIXTURES, FILES, AXE_TAGS, iosAgent, systemColours, audioState, playing, listen, said, playerSite, appSite };
