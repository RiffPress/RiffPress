/**
 * What a spec makes, so it removes that and nothing else. requestUtils.deleteAllPosts() and its
 * siblings empty the whole site, and the hook runs the suite against a site people also use.
 *
 * Everything made here is marked, on the site, with the spec file and the project that made it
 * (tests/components). A run that stopped before its afterAll, asleep or killed, leaves its posts
 * behind, and the next run's counts would be off by them: so before a spec makes anything it sweeps
 * what it made last time, and global-setup.js sweeps every spec's once as the suite starts.
 */
const path = require( 'node:path' );
const { test } = require( '@wordpress/e2e-test-utils-playwright' );

/** The repository's root, which the marks are relative to. */
const ROOT = path.join( __dirname, '..', '..', '..', '..', '..' );

/**
 * The mark for what the running spec makes: its file and its project, so the same spec running
 * under another project at the same time is never swept by this one.
 *
 * @return {string} Mark.
 */
function mark() {
	const info = test.info();
	return `${ path.relative( ROOT, info.file ) } ${ info.project.name }`;
}

/**
 * Deletes what the suite made: one mark's, or every mark's.
 *
 * @param {Object} requestUtils Playwright's WordPress request utils.
 * @param {string} [spec]       A mark from mark(); every one without it.
 * @return {Promise<number>} How many were deleted.
 */
async function sweep( requestUtils, spec = '' ) {
	const done = await requestUtils.rest( {
		method: 'DELETE',
		path: '/riff-test/v1/made',
		params: spec ? { spec } : {},
	} );
	return Number( done?.deleted ) || 0;
}

/**
 * @return {Object} media(), post() and page() make and remember; cleanUp() deletes what they made.
 */
function own() {
	const made = [];
	// The marks swept: each once, before this spec first makes anything under it.
	const swept = new Set();
	const remember = ( type ) => ( item ) => {
		made.push( `${ type }/${ item.id }` );
		return item;
	};
	// What the last run of this spec left, gone before anything new is made.
	async function first( requestUtils ) {
		const spec = mark();
		if ( ! swept.has( spec ) ) {
			swept.add( spec );
			await sweep( requestUtils, spec );
		}
		return spec;
	}
	return {
		async media( requestUtils, file ) {
			const spec = await first( requestUtils );
			const item = await requestUtils.uploadMedia( file );
			remember( 'media' )( item );
			await requestUtils.rest( {
				method: 'POST',
				path: `/wp/v2/media/${ item.id }`,
				data: { meta: { _riff_e2e: spec } },
			} );
			return item;
		},
		async post( requestUtils, data ) {
			const spec = await first( requestUtils );
			return requestUtils
				.createPost( { ...data, meta: { ...data.meta, _riff_e2e: spec } } )
				.then( remember( 'posts' ) );
		},
		async page( requestUtils, data ) {
			const spec = await first( requestUtils );
			return requestUtils
				.createPage( { ...data, meta: { ...data.meta, _riff_e2e: spec } } )
				.then( remember( 'pages' ) );
		},
		async cleanUp( requestUtils ) {
			for ( const item of made.splice( 0 ).reverse() ) {
				await requestUtils
					.rest( {
						method: 'DELETE',
						path: `/wp/v2/${ item }`,
						params: { force: true },
					} )
					// Already gone is fine: a test may have deleted it.
					.catch( () => {} );
			}
		},
	};
}

module.exports = { own, sweep, mark };
