/**
 * What the app remembers between launches, in settings.json in its user data folder: the site's
 * standalone address and the window's size and position. The login itself is the site's cookie, in
 * the window's persistent session.
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );

/**
 * Settings stored in a folder.
 *
 * @param {string} dir Folder.
 * @return {{get: (key: string) => unknown, set: (key: string, value: unknown) => void}} Accessors.
 */
function settings( dir ) {
	const file = path.join( dir, 'settings.json' );
	let data = {};
	try {
		data = JSON.parse( fs.readFileSync( file, 'utf8' ) ) || {};
	} catch {
		// First launch, or a file to start over from.
	}
	return {
		get: ( key ) => data[ key ],
		set( key, value ) {
			data = { ...data, [ key ]: value };
			fs.mkdirSync( dir, { recursive: true } );
			// Through a temporary file, so a crash mid-write leaves the old settings, not half of them.
			fs.writeFileSync(
				file + '.tmp',
				JSON.stringify( data, null, '\t' )
			);
			fs.renameSync( file + '.tmp', file );
		},
	};
}

module.exports = { settings };
