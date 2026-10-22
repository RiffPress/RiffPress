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
const { spawn, execFileSync } = require( 'node:child_process' );

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

/**
 * On a Mac, Electron.app cloned as Riff.app with Riff's name and icon, so the Dock and the app
 * switcher say Riff, as an installed copy does; elsewhere, Electron itself. The clone is
 * copy-on-write and made again only when Electron's version or the icon changes.
 *
 * @return {string} The executable to run.
 */
function electronBinary() {
	const stock = require( 'electron' );
	if ( process.platform !== 'darwin' ) {
		return stock;
	}
	const source = path.resolve( stock, '..', '..', '..' );
	const bundle = path.join( APP, '.dev', 'Riff.app' );
	const binary = path.join( bundle, 'Contents', 'MacOS', 'Electron' );
	const icon = path.join( APP, 'resources', 'icon.png' );
	const version = `${ require( 'electron/package.json' ).version } ${
		fs.statSync( icon ).mtimeMs
	}`;
	const stamp = path.join( APP, '.dev', 'version' );
	try {
		if ( fs.readFileSync( stamp, 'utf8' ) === version ) {
			return binary;
		}
	} catch {
		// Not made yet.
	}
	try {
		fs.rmSync( path.join( APP, '.dev' ), { recursive: true, force: true } );
		fs.mkdirSync( path.join( APP, '.dev' ) );
		execFileSync( 'cp', [ '-Rc', source, bundle ] );
		const plist = path.join( bundle, 'Contents', 'Info.plist' );
		for ( const key of [ 'CFBundleName', 'CFBundleDisplayName' ] ) {
			execFileSync( 'plutil', [ '-replace', key, '-string', 'Riff', plist ] );
		}
		const iconset = path.join( APP, '.dev', 'icon.iconset' );
		fs.mkdirSync( iconset );
		for ( const size of [ 16, 32, 128, 256, 512 ] ) {
			for ( const scale of [ 1, 2 ] ) {
				execFileSync( 'sips', [
					'-z',
					String( size * scale ),
					String( size * scale ),
					icon,
					'--out',
					path.join(
						iconset,
						`icon_${ size }x${ size }${ scale > 1 ? '@2x' : '' }.png`
					),
				], { stdio: 'ignore' } );
			}
		}
		execFileSync( 'iconutil', [
			'-c',
			'icns',
			iconset,
			'-o',
			path.join( bundle, 'Contents', 'Resources', 'electron.icns' ),
		] );
		// The edits break Electron's signature, and an arm64 Mac runs nothing unsigned.
		execFileSync( 'codesign', [ '--force', '--deep', '--sign', '-', bundle ], {
			stdio: 'ignore',
		} );
		fs.writeFileSync( stamp, version );
		return binary;
	} catch ( error ) {
		console.warn( `Running Electron as it is: ${ error.message }` );
		return stock;
	}
}

const child = spawn(
	electronBinary(),
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
