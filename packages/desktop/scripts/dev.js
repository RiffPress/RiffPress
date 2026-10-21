#!/usr/bin/env node
/**
 * npm run desktop: the app from source, on the local wp-env site, with the developer tools in its
 * View menu and a reload whenever a file under plugins/ changes.
 *
 * The site's port is read as wp-env reads it, from .wp-env.json and then .wp-env.override.json, so
 * a moved port needs nothing here. Its own profile, in packages/desktop/.profile/, keeps the
 * login and stays clear of an installed copy's.
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );
const { spawn } = require( 'node:child_process' );

const ROOT = path.resolve( __dirname, '..', '..', '..' );
const APP = path.resolve( __dirname, '..' );

let port = 8888;
for ( const name of [ '.wp-env.json', '.wp-env.override.json' ] ) {
	try {
		const json = JSON.parse(
			fs.readFileSync( path.join( ROOT, name ), 'utf8' )
		);
		if ( typeof json.port === 'number' ) {
			port = json.port;
		}
	} catch {
		// No override, or one to fix; the port so far stands.
	}
}
const site = process.env.RIFF_DESKTOP_SITE || `http://localhost:${ port }/`;
console.log( `Riff for the desktop, on ${ site }` );

const child = spawn(
	require( 'electron' ),
	[ APP, `--user-data-dir=${ path.join( APP, '.profile' ) }` ],
	{
		stdio: 'inherit',
		env: {
			...process.env,
			RIFF_DESKTOP_SITE: site,
			RIFF_DESKTOP_WATCH: path.join( ROOT, 'plugins' ),
		},
	}
);
child.on( 'exit', ( code ) => process.exit( code ?? 0 ) );
