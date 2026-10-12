'use strict';

// The demo blueprint names its plugin zip and demo files by where they sit next to it, not by a
// host: `riff.zip`, `demo/manifest.json`. The Pages workflow and the pull request preview
// each publish that same layout somewhere and resolve the names against it here.
//
// It used to carry the host. When the repository moved to another account the old Pages address
// began answering 404 for every file, Playground carried on without them, and every demo opened
// on "Nothing here yet." with nothing to say why. A name with no host cannot go stale that way,
// and `check` makes a missing file fail the run that published it.

const fs = require( 'fs' );
const path = require( 'path' );

// Largest demo file a preview will copy. The real ones are about 320 KB.
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Every `resource: url` reference in a blueprint, with the step it belongs to.
 *
 * @param {Object} blueprint Parsed blueprint.
 * @return {Array<{step: string, ref: Object}>} References, in step order.
 */
function references( blueprint ) {
	const refs = [];
	for ( const step of blueprint.steps || [] ) {
		for ( const ref of [ step.pluginData, step.data ] ) {
			if ( ref && ref.resource === 'url' ) {
				refs.push( { step: step.step, ref } );
			}
		}
	}
	return refs;
}

/**
 * The URLs a blueprint fetches.
 *
 * @param {Object} blueprint Parsed blueprint.
 * @return {string[]} URLs, in step order.
 */
function urls( blueprint ) {
	return references( blueprint ).map( ( { ref } ) => ref.url );
}

/**
 * Whether a reference names a host. The source blueprint must never.
 *
 * @param {string} url A blueprint URL.
 */
function isAbsolute( url ) {
	return /^[a-z][a-z0-9+.-]*:/i.test( url ) || url.startsWith( '//' );
}

/**
 * The blueprint with every relative reference resolved against the folder it was published to.
 *
 * @param {Object} blueprint Parsed source blueprint, whose references are all relative.
 * @param {string} base      Where the zip and `demo/` were published, ending in a slash.
 * @param {string} [version] Appended as `?v=` so a cache never serves an older file.
 * @return {Object} A new blueprint.
 */
function resolve( blueprint, base, version ) {
	if ( ! /^https:\/\/[^/]+\/(.*\/)?$/.test( base ) ) {
		// Playground runs on https, and a browser will not fetch http from it.
		throw new Error(
			`Base must be an https URL ending in a slash: ${ base }`
		);
	}
	const out = JSON.parse( JSON.stringify( blueprint ) );
	for ( const { ref } of references( out ) ) {
		if ( isAbsolute( ref.url ) ) {
			throw new Error(
				`blueprint.json names a host, which goes stale when the site moves: ${ ref.url }`
			);
		}
		ref.url =
			new URL( ref.url, base ).href +
			( version ? `?v=${ version }` : '' );
	}
	return out;
}

/**
 * The demo file names a blueprint fetches, decoded, as they are named in the fixture folder.
 *
 * @param {Object} blueprint Parsed source blueprint.
 * @return {string[]} File names.
 */
function demoFiles( blueprint ) {
	return urls( blueprint )
		.filter( ( url ) => url.startsWith( 'demo/' ) )
		.map( ( url ) => decodeURIComponent( url.slice( 'demo/'.length ) ) );
}

/**
 * Copy the demo files a blueprint names out of an untrusted folder, and nothing else.
 *
 * The names come from the blueprint, which the caller reads from the base branch, so a pull request
 * cannot choose where anything is written. What it does control is the folder's contents, so each
 * file must be a plain file of a sensible size: a symlink would copy whatever it points at on the
 * runner into a public branch.
 *
 * @param {Object} blueprint Parsed source blueprint.
 * @param {string} from      Folder of untrusted files.
 * @param {string} to        Folder to copy into.
 * @return {string[]} The names copied.
 */
function stage( blueprint, from, to ) {
	fs.mkdirSync( to, { recursive: true } );
	const names = demoFiles( blueprint );
	for ( const name of names ) {
		if ( name !== path.basename( name ) || name.startsWith( '.' ) ) {
			throw new Error( `Not a plain file name: ${ name }` );
		}
		const source = path.join( from, name );
		let stat;
		try {
			stat = fs.lstatSync( source );
		} catch {
			throw new Error( `Missing from the build: ${ name }` );
		}
		if ( ! stat.isFile() ) {
			throw new Error( `Not a regular file: ${ name }` );
		}
		if ( stat.size > MAX_FILE_BYTES ) {
			throw new Error(
				`Larger than ${ MAX_FILE_BYTES } bytes: ${ name }`
			);
		}
		fs.copyFileSync( source, path.join( to, name ) );
	}
	return names;
}

/**
 * Fetch every URL a published blueprint names, as Playground will: from another origin.
 *
 * @param {string[]} list          URLs.
 * @param {Object}   options       Retries, for a deploy that is still reaching the edge.
 * @param            options.tries
 * @param            options.wait
 * @param {Function} [fetcher]     Injected in tests.
 * @return {Promise<string[]>} One line per failure. Empty when every URL answered.
 */
async function check(
	list,
	{ tries = 1, wait = 10000 } = {},
	fetcher = fetch
) {
	let failures = [];
	for ( let attempt = 1; attempt <= tries; attempt++ ) {
		failures = [];
		for ( const url of list ) {
			try {
				const res = await fetcher( url, {
					headers: { Origin: 'https://playground.wordpress.net' },
				} );
				if ( res.body && res.body.cancel ) {
					await res.body.cancel();
				}
				if ( res.status !== 200 ) {
					failures.push( `${ res.status } ${ url }` );
				} else if (
					! res.headers.get( 'access-control-allow-origin' )
				) {
					failures.push( `no access-control-allow-origin ${ url }` );
				}
			} catch ( error ) {
				failures.push( `${ error.message } ${ url }` );
			}
		}
		if ( ! failures.length || attempt === tries ) {
			break;
		}
		await new Promise( ( done ) => setTimeout( done, wait ) );
	}
	return failures;
}

module.exports = { urls, isAbsolute, resolve, demoFiles, stage, check };

if ( require.main === module ) {
	const [ command, ...args ] = process.argv.slice( 2 );
	const read = ( file ) => JSON.parse( fs.readFileSync( file, 'utf8' ) );
	( async () => {
		switch ( command ) {
			// resolve <blueprint.json> <base> [version]  ->  the published blueprint, on stdout
			case 'resolve':
				process.stdout.write(
					JSON.stringify(
						resolve( read( args[ 0 ] ), args[ 1 ], args[ 2 ] ),
						null,
						2
					) + '\n'
				);
				break;
			// stage <blueprint.json> <from> <to>
			case 'stage':
				for ( const name of stage(
					read( args[ 0 ] ),
					args[ 1 ],
					args[ 2 ]
				) ) {
					process.stdout.write( `${ name }\n` );
				}
				break;
			// check <published blueprint URL or file> [tries]
			case 'check': {
				const source = args[ 0 ];
				const tries = Number( args[ 1 ] || 1 );
				let blueprint;
				if ( ! /^https:/.test( source ) ) {
					blueprint = read( source );
				} else {
					// A fresh deploy can answer 404 for the blueprint itself for a little while.
					for ( let attempt = 1; ! blueprint; attempt++ ) {
						const res = await fetch( source );
						if ( res.ok ) {
							blueprint = await res.json();
						} else if ( attempt >= tries ) {
							throw new Error( `${ res.status } ${ source }` );
						} else {
							await new Promise( ( done ) =>
								setTimeout( done, 10000 )
							);
						}
					}
				}
				const list = urls( blueprint );
				const failures = await check( list, { tries } );
				for ( const line of failures ) {
					process.stderr.write(
						`::error::Demo file not reachable: ${ line }\n`
					);
				}
				process.stdout.write(
					`${ list.length - failures.length } of ${ list.length } reachable\n`
				);
				process.exitCode = failures.length ? 1 : 0;
				break;
			}
			default:
				process.stderr.write(
					'usage: demo-blueprint.js resolve|stage|check ...\n'
				);
				process.exitCode = 2;
		}
	} )().catch( ( error ) => {
		process.stderr.write( `::error::${ error.message }\n` );
		process.exitCode = 1;
	} );
}
