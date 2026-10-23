/**
 * What the connect form accepts, what stays in the window, and how an address becomes a Listen
 * page's standalone address. Run by `npm test` in this package.
 */
const assert = require( 'node:assert/strict' );
const { test } = require( 'node:test' );
const site = require( '../src/site' );

const code = ( fn ) => {
	try {
		fn();
	} catch ( error ) {
		return error.code;
	}
	return null;
};

test( 'a bare host gets https, and this machine gets http', () => {
	assert.equal(
		site.normalize( 'example.com' ).href,
		'https://example.com/'
	);
	assert.equal(
		site.normalize( ' example.com/listen/#top ' ).href,
		'https://example.com/listen/'
	);
	assert.equal(
		site.normalize( 'localhost:8891' ).href,
		'http://localhost:8891/'
	);
	assert.equal(
		site.normalize( 'http://127.0.0.1:8891/listen/' ).href,
		'http://127.0.0.1:8891/listen/'
	);
	assert.equal(
		site.normalize( 'http://riff.localhost/' ).href,
		'http://riff.localhost/'
	);
} );

test( 'plain http is refused away from this machine, as are other schemes and credentials', () => {
	assert.equal(
		code( () => site.normalize( 'http://example.com/' ) ),
		'insecure'
	);
	assert.equal(
		code( () => site.normalize( 'http://localhost.example.com/' ) ),
		'insecure'
	);
	assert.equal(
		code( () => site.normalize( 'https://me:pw@example.com/' ) ),
		'insecure'
	);
	assert.equal(
		code( () => site.normalize( 'file:///etc/passwd' ) ),
		'invalid'
	);
	assert.equal(
		code( () => site.normalize( 'javascript://alert(1)' ) ),
		'invalid'
	);
	assert.equal(
		code( () => site.normalize( '' ) ),
		'invalid'
	);
	assert.equal(
		code( () => site.normalize( 'https://' ) ),
		'invalid'
	);
} );

test( 'only the Listen app and the login stay in the window', () => {
	const app = 'https://example.com/listen/app/';
	assert.ok( site.inWindow( app, app ) );
	assert.ok( site.inWindow( 'https://example.com/listen/app/?riff=album/12', app ) );
	assert.ok( site.inWindow( 'https://example.com/wp-login.php?action=logout', app ) );
	// The theme's pages and the dashboard are not the app.
	assert.ok( ! site.inWindow( 'https://example.com/', app ) );
	assert.ok( ! site.inWindow( 'https://example.com/listen/', app ) );
	assert.ok( ! site.inWindow( 'https://example.com/blog/', app ) );
	assert.ok( ! site.inWindow( 'https://example.com/wp-admin/', app ) );
	assert.ok( ! site.inWindow( 'https://example.org/', app ) );
	assert.ok( ! site.inWindow( 'http://example.com/listen/app/', app ) );
	assert.ok( ! site.inWindow( 'https://example.com:8443/listen/app/', app ) );
	assert.ok( ! site.inWindow( 'https://sub.example.com/listen/app/', app ) );
	assert.ok( ! site.inWindow( 'not a url', app ) );
	assert.ok( ! site.inWindow( app, undefined ) );

	// Without pretty permalinks: the same page, with riff_app.
	const plain = 'https://example.com/?page_id=7&riff_app=1';
	assert.ok( site.inWindow( 'https://example.com/?page_id=7&riff_app=1&riff=tracks', plain ) );
	assert.ok( ! site.inWindow( 'https://example.com/?page_id=7', plain ) );
	assert.ok( ! site.inWindow( 'https://example.com/?page_id=8&riff_app=1', plain ) );

	assert.ok( site.sameSite( 'https://example.com/blog/', app ) );
	assert.ok( ! site.sameSite( 'https://example.org/', app ) );
} );

test( 'only web and mail links go to the default browser', () => {
	assert.ok( site.isExternal( 'https://wordpress.org/' ) );
	assert.ok( site.isExternal( 'mailto:a@example.com' ) );
	assert.ok( ! site.isExternal( 'file:///Applications/Calculator.app' ) );
	assert.ok( ! site.isExternal( 'smb://server/share' ) );
	assert.ok( ! site.isExternal( 'javascript:alert(1)' ) );
} );

test( 'a page address is tried with app/ and with riff_app=1; an app address as it is', () => {
	assert.deepEqual( site.candidates( new URL( 'https://e.com/listen' ) ), [
		'https://e.com/listen/app/',
		'https://e.com/listen?riff_app=1',
	] );
	assert.deepEqual(
		site.candidates( new URL( 'https://e.com/listen/app/' ) ),
		[ 'https://e.com/listen/app/' ]
	);
	assert.deepEqual(
		site.candidates( new URL( 'https://e.com/?page_id=5&riff_app=1' ) ),
		[ 'https://e.com/?page_id=5&riff_app=1' ]
	);
} );

test( 'a REST route goes under either form of the root', () => {
	assert.equal(
		site.restUrl( 'https://e.com/wp-json/', 'wp/v2/pages', {
			per_page: '1',
		} ),
		'https://e.com/wp-json/wp/v2/pages?per_page=1'
	);
	assert.equal(
		site.restUrl( 'https://e.com/?rest_route=/', 'wp/v2/pages', {
			per_page: '1',
		} ),
		'https://e.com/?rest_route=%2Fwp%2Fv2%2Fpages&per_page=1'
	);
} );

/**
 * A fake site: a map of address to response.
 *
 * @param {Object} pages Address to { body, json, headers, url, status }.
 * @return {(url: string) => Promise<Object>} fetch().
 */
const fakeFetch = ( pages ) => async ( address ) => {
	const key = Object.keys( pages ).find( ( k ) =>
		k.endsWith( '*' )
			? address.startsWith( k.slice( 0, -1 ) )
			: k === address
	);
	const page = key ? pages[ key ] : { status: 404, body: 'Not found' };
	return {
		ok: ( page.status || 200 ) < 400,
		status: page.status || 200,
		url: page.url || address,
		headers: new Map( Object.entries( page.headers || {} ) ),
		text: async () => page.body || JSON.stringify( page.json ),
		json: async () => page.json,
	};
};

const STANDALONE = ( manifest ) =>
	`<!doctype html><html><head><link rel="manifest" href="${ manifest }"></head><body class="riff-standalone"><main></main></body></html>`;

test( 'the Listen page’s own address finds its app/ address, through the manifest', async () => {
	const fetch = fakeFetch( {
		'https://e.com/listen/app/': {
			body: STANDALONE( 'https://e.com/listen/app/manifest/' ),
		},
		'https://e.com/listen/app/manifest/': {
			json: {
				start_url: 'https://e.com/listen/app/',
				display: 'standalone',
			},
		},
	} );
	assert.equal(
		await site.discover( 'e.com/listen/', fetch ),
		'https://e.com/listen/app/'
	);
	assert.equal(
		await site.discover( 'https://e.com/listen/app/', fetch ),
		'https://e.com/listen/app/'
	);
} );

test( 'a site without pretty permalinks is found with riff_app=1', async () => {
	const fetch = fakeFetch( {
		'https://e.com/?page_id=5&riff_app=1': {
			body: STANDALONE(
				'https://e.com/?page_id=5&#038;riff_app=manifest'
			),
		},
		'https://e.com/?page_id=5&riff_app=manifest': {
			json: { start_url: 'https://e.com/?page_id=5&riff_app=1' },
		},
	} );
	assert.equal(
		await site.discover( 'https://e.com/?page_id=5', fetch ),
		'https://e.com/?page_id=5&riff_app=1'
	);
} );

test( 'a bare site address finds the oldest Listen page through core’s pages route', async () => {
	const fetch = fakeFetch( {
		'https://e.com/': {
			body: '<html><head></head><body class="home"></body></html>',
			headers: {
				link: '<https://e.com/wp-json/>; rel="https://api.w.org/"',
			},
		},
		'https://e.com/wp-json/wp/v2/pages?*': {
			json: [
				{ id: 9, link: 'https://e.com/music/', template: '' },
				{ id: 4, link: 'https://e.com/radio/', template: 'listen' },
			],
		},
		'https://e.com/radio/app/': {
			body: STANDALONE( '/radio/app/manifest/' ),
		},
		'https://e.com/radio/app/manifest/': {
			json: { start_url: '/radio/app/' },
		},
		'https://e.com/music/app/': {
			body: STANDALONE( '/music/app/manifest/' ),
		},
		'https://e.com/music/app/manifest/': {
			json: { start_url: '/music/app/' },
		},
	} );
	assert.equal(
		await site.discover( 'e.com', fetch ),
		'https://e.com/radio/app/'
	);
} );

test( 'a page that is not Riff’s standalone document is not taken for one', async () => {
	const fetch = fakeFetch( {
		'https://e.com/app/': {
			body: '<html><head><link rel="manifest" href="/pwa.json"></head><body class="page"></body></html>',
		},
		'https://e.com/': { body: '<html><body></body></html>' },
	} );
	await assert.rejects( site.discover( 'e.com', fetch ), {
		code: 'not-riff',
	} );
} );

test( 'a site that redirects to plain http, or another origin’s start_url, is refused', async () => {
	const fetch = fakeFetch( {
		'https://e.com/listen/app/': {
			url: 'http://e.com/listen/app/',
			body: STANDALONE( '/listen/app/manifest/' ),
		},
		'https://f.com/listen/app/': {
			body: STANDALONE( '/listen/app/manifest/' ),
		},
		'https://f.com/listen/app/manifest/': {
			json: { start_url: 'https://evil.com/' },
		},
	} );
	await assert.rejects( site.discover( 'e.com/listen', fetch ), {
		code: 'not-riff',
	} );
	// The manifest is ignored and the page's own address kept.
	assert.equal(
		await site.discover( 'f.com/listen', fetch ),
		'https://f.com/listen/app/'
	);
} );

test( 'a site that moved to www is known by the addresses it prints, not the redirect', async () => {
	// Electron's net.fetch follows the redirect and reports no Response.url.
	const fetch = async ( address ) => {
		const response = await fakeFetch( {
			'https://e.com/listen/app/': {
				body: STANDALONE( 'https://www.e.com/listen/app/manifest/' ),
			},
			'https://www.e.com/listen/app/manifest/': {
				json: { start_url: 'https://www.e.com/listen/app/' },
			},
		} )( address );
		return { ...response, url: '' };
	};
	assert.equal(
		await site.discover( 'e.com/listen', fetch ),
		'https://www.e.com/listen/app/'
	);
} );

test( 'a site that does not answer says so', async () => {
	const fetch = async () => {
		throw new Error( 'ENOTFOUND' );
	};
	await assert.rejects( site.discover( 'nowhere.invalid', fetch ), {
		code: 'unreachable',
	} );
} );
