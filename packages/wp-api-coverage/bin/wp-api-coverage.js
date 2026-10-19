#!/usr/bin/env node
/* eslint-disable no-console -- a command-line tool; it talks. */
const fs = require( 'node:fs' );
const path = require( 'node:path' );
const { coverage, formatText } = require( '../lib/index.js' );

const USAGE = `Usage: wp-api-coverage <plugin folder> [options]

Options:
  --json             Print the full report as JSON.
  --limit <n>        Unused APIs to list per area (default 5).
  --area <name>      Only this area; repeat for more.
  --all              Also list the areas the plugin does not use at all.
  --ignore <names>   Comma-separated folder names to skip (default node_modules,vendor,.git,tests,test).
  --catalog <file>   Use another catalog, such as one built for a different WordPress version.
  -h, --help         Show this help.
`;

function parse( argv ) {
	const opts = { areas: [] };
	for ( let i = 0; i < argv.length; i++ ) {
		const a = argv[ i ];
		const value = () => {
			if ( i + 1 >= argv.length ) {
				throw new Error( `${ a } needs a value` );
			}
			return argv[ ++i ];
		};
		if ( a === '--json' ) {
			opts.json = true;
		} else if ( a === '--all' ) {
			opts.untouched = true;
		} else if ( a === '--limit' ) {
			opts.limit = Number( value() );
		} else if ( a === '--area' ) {
			opts.areas.push( value() );
		} else if ( a === '--ignore' ) {
			opts.ignore = value().split( ',' ).map( ( s ) => s.trim() ).filter( Boolean );
		} else if ( a === '--catalog' ) {
			opts.catalog = JSON.parse( fs.readFileSync( path.resolve( value() ), 'utf8' ) );
		} else if ( a === '-h' || a === '--help' ) {
			opts.help = true;
		} else if ( a.startsWith( '-' ) ) {
			throw new Error( `Unknown option ${ a }` );
		} else {
			opts.dir = a;
		}
	}
	return opts;
}

let opts;
try {
	opts = parse( process.argv.slice( 2 ) );
} catch ( e ) {
	console.error( `${ e.message }\n\n${ USAGE }` );
	process.exit( 2 );
}
if ( opts.help || ! opts.dir ) {
	process.stdout.write( USAGE );
	process.exit( opts.help ? 0 : 2 );
}
if ( ! fs.existsSync( opts.dir ) || ! fs.statSync( opts.dir ).isDirectory() ) {
	console.error( `Not a folder: ${ opts.dir }` );
	process.exit( 2 );
}

const report = coverage( opts.dir, { catalog: opts.catalog, ignore: opts.ignore } );
process.stdout.write( opts.json ? JSON.stringify( report, null, 2 ) + '\n' : formatText( report, opts ) );
