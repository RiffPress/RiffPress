/**
 * Before the suite: WordPress's own setup, which signs in and keeps the session, then every post,
 * page and upload an earlier run made and never cleaned up, swept (helpers/own.js), so a run that
 * stopped partway can't throw the next one's counts off.
 */
const { request } = require( '@playwright/test' );
const { RequestUtils } = require( '@wordpress/e2e-test-utils-playwright' );
const wordpress = require( '@wordpress/scripts/config/playwright/global-setup.js' );
const { sweep } = require( './helpers/own' );

/**
 * @param {import('@playwright/test').FullConfig} config
 * @return {Promise<void>}
 */
module.exports = async function globalSetup( config ) {
	await wordpress( config );
	const { storageState, baseURL } = config.projects[ 0 ].use;
	const requestContext = await request.newContext( { baseURL } );
	const requestUtils = new RequestUtils( requestContext, {
		storageStatePath: typeof storageState === 'string' ? storageState : undefined,
	} );
	await requestUtils.setupRest();
	await sweep( requestUtils );
	await requestContext.dispose();
};
