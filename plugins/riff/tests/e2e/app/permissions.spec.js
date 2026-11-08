/**
 * Settings › Riff lists what each active Riff plugin can do, read from its isolation.json, and a
 * plugin without one says so rather than looking like it asks for nothing.
 */
const fs = require( 'fs' );
const path = require( 'path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );

const root = path.join( __dirname, '..', '..', '..', '..' );
// The extensions wp-env activates (.wp-env.json), each with its name on the Plugins screen.
const extensions = [ 'riff-lyrics', 'riff-chords', 'riff-sign-in', 'riff-sing', 'riff-meters' ];
const manifest = ( slug ) => {
	const file = path.join( root, slug, 'isolation.json' );
	return fs.existsSync( file ) ? JSON.parse( fs.readFileSync( file, 'utf8' ) ) : null;
};

test.describe( 'What each plugin can do', () => {
	test( 'Settings › Riff lists every active extension', async ( { admin, page } ) => {
		await admin.visitAdminPage( 'options-general.php', 'page=riff' );
		await expect( page.getByRole( 'heading', { name: 'What each plugin can do' } ) ).toBeVisible();
		for ( const slug of [ 'riff', ...extensions ] ) {
			const section = page.locator( `#riff-permissions-${ slug }` );
			await expect( section, slug ).toBeVisible();
			const m = manifest( slug === 'riff' ? 'riff' : slug );
			if ( ! m ) {
				await expect( section ).toContainText( "doesn't say what it does" );
				continue;
			}
			await expect( section.getByRole( 'listitem' ).first() ).toBeVisible();
			if ( ( m.riff?.functions || [] ).includes( 'riff_register_view' ) ) {
				await expect( section ).toContainText( 'Adds a view to the player' );
			}
			if ( ( m.riff?.hooks || [] ).includes( 'riff_track' ) ) {
				await expect( section ).toContainText( 'Reads your tracks' );
			}
			for ( const prefix of m.data?.options || [] ) {
				await expect( section ).toContainText( `Stores settings under ${ prefix }*` );
			}
		}
	} );

	test( "a Riff plugin's row on the Plugins screen links to its list", async ( { admin, page } ) => {
		await admin.visitAdminPage( 'plugins.php' );
		const link = page.locator( 'tr[data-slug="riff-meters"]' ).getByRole( 'link', { name: 'What it can do' } );
		await expect( link ).toHaveAttribute( 'href', /options-general\.php\?page=riff#riff-permissions-riff-meters$/ );
	} );
} );
