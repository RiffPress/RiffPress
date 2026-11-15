/**
 * Settings › Riff lists what each active Riff plugin can do, read from its isolation.json, and a
 * plugin without one says so rather than looking like it asks for nothing.
 */
const fs = require( 'fs' );
const path = require( 'path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );

const root = path.join( __dirname, '..', '..', '..', '..' );
// The extensions wp-env activates (.wp-env.json), each with its name on the Plugins screen.
const extensions = [ 'riff-lyrics', 'riff-chords', 'riff-sign-in', 'riff-sing', 'riff-chimera' ];
const manifest = ( slug ) => {
	const file = path.join( root, slug, 'isolation.json' );
	return fs.existsSync( file ) ? JSON.parse( fs.readFileSync( file, 'utf8' ) ) : null;
};

// What a plugin's section says, from its manifest: that it says nothing, or what the manifest names.
const expectedText = ( m ) =>
	m
		? [
				...( m.riff?.functions || [] ).filter( ( f ) => f === 'riff_register_view' ).map( () => 'Adds a view to the player' ),
				...( m.riff?.hooks || [] ).filter( ( h ) => h === 'riff_track' ).map( () => 'Reads your tracks' ),
				...( m.data?.options || [] ).map( ( prefix ) => `Stores settings under ${ prefix }*` ),
			]
		: [ "doesn't say what it does" ];

test.describe( 'What each plugin can do', () => {
	test( 'Settings › Riff lists every active extension', async ( { admin, page } ) => {
		await admin.visitAdminPage( 'options-general.php', 'page=riff' );
		await expect( page.getByRole( 'heading', { name: 'What each plugin can do' } ) ).toBeVisible();
		for ( const slug of [ 'riff', ...extensions ] ) {
			const section = page.locator( `#riff-permissions-${ slug }` );
			await expect( section, slug ).toBeVisible();
			for ( const text of expectedText( manifest( slug ) ) ) {
				await expect( section, slug ).toContainText( text );
			}
		}
		// A plugin with a manifest lists what it can do.
		for ( const slug of [ 'riff', ...extensions ].filter( manifest ) ) {
			await expect( page.locator( `#riff-permissions-${ slug }` ).getByRole( 'listitem' ).first(), slug ).toBeVisible();
		}
	} );

	test( "a Riff plugin's row on the Plugins screen links to its list", async ( { admin, page } ) => {
		await admin.visitAdminPage( 'plugins.php' );
		// By its file: WordPress names a row's data-slug after the plugin's name, riff-chords-experimental.
		const link = page.locator( 'tr[data-plugin="riff-chords/riff-chords.php"]' ).getByRole( 'link', { name: 'What it can do' } );
		await expect( link ).toHaveAttribute( 'href', /options-general\.php\?page=riff#riff-permissions-riff-chords$/ );
	} );
} );
