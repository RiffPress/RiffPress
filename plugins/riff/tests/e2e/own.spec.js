/**
 * The suite cleans up after itself without touching anything else on the site it runs against.
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( './own' );

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
