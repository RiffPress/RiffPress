/**
 * The suite cleans up after itself without touching anything else on the site it runs against.
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own, sweep, mark } = require( './own' );

test( 'a spec deletes what it made and leaves everything else on the site', async ( {
	requestUtils,
} ) => {
	const bystander = await requestUtils.createPost( {
		title: `Not the suite's ${ Date.now() }`,
		status: 'publish',
	} );
	const made = own();
	const mine = await made.post( requestUtils, {
		title: `The suite's ${ Date.now() }`,
		status: 'publish',
	} );

	await made.cleanUp( requestUtils );

	const exists = ( id ) =>
		requestUtils
			.rest( { path: `/wp/v2/posts/${ id }`, params: { context: 'edit' } } )
			.then( () => true )
			.catch( () => false );
	expect( await exists( mine.id ) ).toBe( false );
	expect( await exists( bystander.id ) ).toBe( true );

	await requestUtils.rest( {
		method: 'DELETE',
		path: `/wp/v2/posts/${ bystander.id }`,
		params: { force: true },
	} );
} );

test( 'what a stopped run left is swept before a spec makes anything, and nothing unmarked is', async ( {
	requestUtils,
} ) => {
	const exists = ( id ) =>
		requestUtils
			.rest( { path: `/wp/v2/posts/${ id }`, params: { context: 'edit' } } )
			.then( () => true )
			.catch( () => false );
	// As a run that stopped before its afterAll leaves them: this spec's, another spec's, and a
	// post the suite never made.
	const left = await requestUtils.createPost( {
		title: `Left by a stopped run ${ Date.now() }`,
		status: 'publish',
		meta: { _riff_e2e: mark() },
	} );
	const other = 'plugins/riff/tests/e2e/elsewhere.spec.js chromium';
	const elsewhere = await requestUtils.createPost( {
		title: `Left by another spec ${ Date.now() }`,
		status: 'publish',
		meta: { _riff_e2e: other },
	} );
	const bystander = await requestUtils.createPost( {
		title: `Not the suite's ${ Date.now() }`,
		status: 'publish',
	} );

	const made = own();
	await made.post( requestUtils, { title: `The suite's ${ Date.now() }`, status: 'publish' } );
	expect( await exists( left.id ), 'this spec\'s own leftover, gone before it made anything' ).toBe( false );
	expect( await exists( elsewhere.id ), 'not another spec\'s, which may be running' ).toBe( true );

	// As that spec does when it starts. global-setup.js sweeps every spec's the same way, with no
	// mark, which isn't done here: in a run on more than one worker it would sweep a spec mid-run.
	await sweep( requestUtils, other );
	expect( await exists( elsewhere.id ) ).toBe( false );
	expect( await exists( bystander.id ), 'never what the suite did not make' ).toBe( true );

	await made.cleanUp( requestUtils );
	await requestUtils.rest( {
		method: 'DELETE',
		path: `/wp/v2/posts/${ bystander.id }`,
		params: { force: true },
	} );
} );
