/**
 * Which release the updater reads, and whether this copy installs or only tells. Run by `npm test`
 * in this package.
 */
const assert = require( 'node:assert/strict' );
const { test } = require( 'node:test' );
const updates = require( '../src/updates' );

const release = ( tag, extra = {} ) => ( {
	tag_name: tag,
	html_url: `https://github.com/RiffPress/RiffPress/releases/tag/${ tag }`,
	draft: false,
	prerelease: false,
	...extra,
} );

test( 'the newest desktop release, whatever the plugins released since', () => {
	const picked = updates.pickRelease( [
		release( 'v4.24.0' ),
		release( 'riff-lyrics-v0.2.0' ),
		release( 'wp-api-coverage-v0.1.1' ),
		release( 'riff-desktop-v0.9.0' ),
		release( 'riff-desktop-v0.10.0' ),
		release( 'riff-desktop-v0.2.0' ),
	] );
	assert.equal( picked.tag, 'riff-desktop-v0.10.0' );
	assert.equal( picked.version, '0.10.0' );
	assert.equal(
		picked.page,
		'https://github.com/RiffPress/RiffPress/releases/tag/riff-desktop-v0.10.0'
	);
} );

test( 'drafts, prereleases and odd tags are skipped', () => {
	assert.equal(
		updates.pickRelease( [
			release( 'riff-desktop-v1.0.0', { draft: true } ),
			release( 'riff-desktop-v0.9.0', { prerelease: true } ),
			release( 'riff-desktop-vnext' ),
			release( 'riff-desktop-v0.3.0' ),
		] ).tag,
		'riff-desktop-v0.3.0'
	);
	assert.equal( updates.pickRelease( [ release( 'v4.24.0' ) ] ), null );
	assert.equal(
		updates.pickRelease( { message: 'API rate limit exceeded' } ),
		null
	);
} );

test( 'the feed is the release’s download folder', () => {
	assert.equal(
		updates.feedUrl( 'riff-desktop-v0.2.0' ),
		'https://github.com/RiffPress/RiffPress/releases/download/riff-desktop-v0.2.0'
	);
} );

test( 'an unsigned Mac copy only tells; signed Macs, Windows and AppImages install', () => {
	assert.equal(
		updates.updateMode( { platform: 'darwin', signed: false } ),
		'notify'
	);
	assert.equal(
		updates.updateMode( { platform: 'darwin', signed: true } ),
		'install'
	);
	assert.equal(
		updates.updateMode( { platform: 'win32', signed: false } ),
		'install'
	);
	assert.equal(
		updates.updateMode( { platform: 'linux', appImage: true } ),
		'install'
	);
	assert.equal(
		updates.updateMode( { platform: 'linux', appImage: false } ),
		'notify'
	);
} );

test( 'a Developer ID signature is told apart from an ad hoc one', () => {
	assert.ok(
		updates.isDeveloperId(
			'Executable=/Applications/Riff.app/Contents/MacOS/Riff\nAuthority=Developer ID Application: RiffPress (ABCDE12345)\nAuthority=Developer ID Certification Authority\n'
		)
	);
	assert.ok(
		! updates.isDeveloperId(
			'Executable=/Applications/Riff.app/Contents/MacOS/Riff\nSignature=adhoc\n'
		)
	);
	assert.ok( ! updates.isDeveloperId( '' ) );
} );

test( 'versions compare as numbers', () => {
	assert.ok( updates.compare( '0.10.0', '0.9.9' ) > 0 );
	assert.equal( updates.compare( '1.2.3', '1.2.3' ), 0 );
	assert.ok( updates.compare( '1.2.3', '1.3.0' ) < 0 );
} );
