/**
 * A release zip is attested before it is uploaded (release-attest.js), and build-zip.sh makes the
 * same bytes from the same commit, so a rebuilt zip's hash matches the attested one.
 */
const { test } = require( 'node:test' );
const assert = require( 'node:assert' );
const { execFileSync } = require( 'node:child_process' );
const crypto = require( 'node:crypto' );
const fs = require( 'node:fs' );
const os = require( 'node:os' );
const path = require( 'node:path' );
const { jobs, problems, check } = require( './release-attest.js' );

const root = path.join( __dirname, '..', '..' );
const SHA = '4d101475d8b20a2381f78447822ac1eab6504dd8';

const workflow = ( steps, perms = '      id-token: write\n      attestations: write\n' ) =>
	`name: Release\non: push\njobs:\n  release:\n    runs-on: ubuntu-24.04\n    permissions:\n      contents: write\n${ perms }    steps:\n${ steps }`;
const build = '      - run: bash .github/scripts/build-zip.sh riff-lyrics\n';
const attest = ( ref = SHA ) =>
	`      - uses: actions/attest-build-provenance@${ ref } # v4\n        with:\n          subject-path: build/riff-lyrics.zip\n`;
const upload = '      - run: gh release upload --clobber "$TAG_NAME" build/riff-lyrics.zip\n';
const found = ( text ) => jobs( text ).flatMap( problems );

test( 'every workflow attests each zip it releases', () => {
	assert.deepStrictEqual( check( path.join( root, '.github/workflows' ) ), [] );
} );

test( 'the release workflow attests riff.zip and each extension', () => {
	const text = fs.readFileSync( path.join( root, '.github/workflows/release-please.yml' ), 'utf8' );
	for ( const name of [ 'riff', 'riff-lyrics', 'riff-chords', 'riff-sign-in', 'riff-sing', 'riff-chimera' ] ) {
		assert.match( text, new RegExp( `subject-path: build/${ name }\\.zip\\n` ), name );
		assert.match( text, new RegExp( `build-zip\\.sh ${ name }\\n` ), `${ name } is built by build-zip.sh` );
	}
	assert.doesNotMatch( text, /zip -qr/, 'every release zip comes from build-zip.sh' );
} );

test( 'a job that builds and uploads without attesting fails', () => {
	assert.deepStrictEqual( found( workflow( build + upload ) ), [
		'uploads build/riff-lyrics.zip without attesting it first',
		'builds build/riff-lyrics.zip without attesting it',
	] );
} );

test( 'a job that attests only after the upload fails', () => {
	assert.deepStrictEqual( found( workflow( build + upload + attest() ) ), [
		'uploads build/riff-lyrics.zip without attesting it first',
	] );
} );

test( 'an attest step on a tag, or without its permissions, fails', () => {
	assert.deepStrictEqual( found( workflow( build + attest( 'v4' ) + upload ) ), [
		'uses attest-build-provenance without pinning it to a commit',
	] );
	assert.deepStrictEqual( found( workflow( build + attest() + upload, '' ) ), [
		'attests without id-token: write',
		'attests without attestations: write',
	] );
} );

test( 'every way of putting a zip on a release counts as an upload', () => {
	const ways = [
		'      - run: gh release create "$TAG" build/riff-lyrics.zip\n',
		'      - run: |\n          gh release upload --clobber "$TAG_NAME" \\\n            build/riff-lyrics.zip\n',
		'      - uses: softprops/action-gh-release@0123456789012345678901234567890123456789 # v2\n        with:\n          files: build/riff-lyrics.zip\n',
	];
	for ( const way of ways ) {
		assert.deepStrictEqual( found( workflow( way ) ), [ 'uploads build/riff-lyrics.zip without attesting it first' ], way );
	}
	assert.deepStrictEqual( found( workflow( '      - run: gh release upload "$TAG" build/*.zip\n' ) ), [
		'uploads build/*.zip without attesting it first',
	] );
	assert.deepStrictEqual( found( workflow( '      - run: gh release upload "$TAG" build/\n' ) ), [
		'uploads to a release without naming each zip, so its attestation cannot be checked',
	] );
} );

test( 'an attest step that can be skipped, or fail quietly, attests nothing', () => {
	for ( const guard of [ "        if: github.event_name == 'push'\n", '        continue-on-error: true\n' ] ) {
		const skippable = attest().replace( '        with:\n', `${ guard }        with:\n` );
		assert.deepStrictEqual( found( workflow( build + skippable + upload ) ), [
			'attests in a step that can be skipped or fail without failing the job',
			'uploads build/riff-lyrics.zip without attesting it first',
			'builds build/riff-lyrics.zip without attesting it',
		], guard );
	}
} );

test( 'a job that builds, attests, then uploads passes', () => {
	assert.deepStrictEqual( found( workflow( build + attest() + upload ) ), [] );
} );

test( 'build-zip.sh makes the same zip twice, whenever and wherever the files were checked out', () => {
	const hash = ( file ) => crypto.createHash( 'sha256' ).update( fs.readFileSync( file ) ).digest( 'hex' );
	const dirs = [ 1, 2, 3 ].map( () => fs.mkdtempSync( path.join( os.tmpdir(), 'riff-zip-' ) ) );
	const epoch = execFileSync( 'git', [ '-C', root, 'log', '-1', '--format=%ct' ] ).toString().trim();
	try {
		execFileSync( 'bash', [ path.join( root, '.github/scripts/build-zip.sh' ), 'riff', dirs[ 0 ] ], {
			env: { ...process.env, TZ: 'UTC' },
		} );
		// A later checkout of the same commit: every file newer, another time zone, a tighter umask.
		const copy = dirs[ 2 ];
		for ( const p of [ '.github/scripts', 'plugins', '.distignore' ] ) {
			fs.cpSync( path.join( root, p ), path.join( copy, p ), { recursive: true } );
		}
		// Its files as a checkout under umask 077 leaves them: owner only.
		const later = new Date( Date.now() + 3600e3 );
		for ( const f of fs.readdirSync( path.join( copy, 'plugins' ), { recursive: true } ) ) {
			const file = path.join( copy, 'plugins', f );
			fs.chmodSync( file, fs.statSync( file ).isDirectory() ? 0o700 : 0o600 );
			fs.utimesSync( file, later, later );
		}
		execFileSync(
			'bash',
			[ '-c', 'umask 077 && bash "$0" riff "$1"', path.join( copy, '.github/scripts/build-zip.sh' ), dirs[ 1 ] ],
			{ env: { ...process.env, TZ: 'Asia/Tokyo', SOURCE_DATE_EPOCH: epoch } }
		);
		assert.strictEqual( hash( path.join( dirs[ 0 ], 'riff.zip' ) ), hash( path.join( dirs[ 1 ], 'riff.zip' ) ) );
	} finally {
		dirs.forEach( ( d ) => fs.rmSync( d, { recursive: true, force: true } ) );
	}
} );
