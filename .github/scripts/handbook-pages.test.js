/**
 * The handbooks are the repository's docs as pages, and the check refuses what they can't draw.
 */
const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const fs = require( 'node:fs' );
const os = require( 'node:os' );
const path = require( 'node:path' );
const { HANDBOOKS, slug, cells, blocks, build } = require( './handbook-pages.js' );

const ROOT = path.resolve( __dirname, '..', '..' );

/**
 * A doc of the test's own, as a handbook, so its links are read from where it is.
 *
 * @param {string} markdown The doc.
 * @param {string} dir      A folder in the repository to write it in, or empty for one outside.
 * @return {Object} The handbook.
 */
function doc( markdown, dir = '' ) {
	const folder = dir ? fs.mkdtempSync( path.join( ROOT, dir, '.handbook-test-' ) ) : fs.mkdtempSync( path.join( os.tmpdir(), 'riff-handbook-' ) );
	const file = path.join( folder, 'doc.md' );
	fs.writeFileSync( file, markdown );
	test.after( () => fs.rmSync( folder, { recursive: true, force: true } ) );
	return { slug: 'doc', file: path.relative( ROOT, file ).split( path.sep ).join( '/' ), label: 'Doc' };
}

test( 'a heading has the anchor GitHub gives it, repeats numbered', () => {
	const taken = new Map();
	assert.equal( slug( 'Registering controls and views', taken ), 'registering-controls-and-views' );
	assert.equal( slug( 'The `riff.view` action', taken ), 'the-riffview-action' );
	assert.equal( slug( 'Registering controls and views', taken ), 'registering-controls-and-views-1' );
} );

test( 'a table cell keeps an escaped pipe and a pipe inside code', () => {
	assert.deepEqual( cells( '| `a|b` | c \\| d |' ), [ '`a|b`', 'c | d' ] );
} );

test( 'the blocks the docs are written in: headings, wrapped lists, tables and code', () => {
	const { blocks: parts, problems } = blocks( '# Title\n\nOne\nparagraph.\n\n- An item\n  that wraps.\n- Another.\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```php\n$a = 1;\n```\n' );
	assert.deepEqual( problems, [] );
	assert.deepEqual( parts.map( ( b ) => b.type ), [ 'heading', 'paragraph', 'list', 'table', 'code' ] );
	assert.equal( parts[ 1 ].text, 'One paragraph.' );
	assert.deepEqual( parts[ 2 ].items, [ 'An item that wraps.', 'Another.' ] );
	assert.equal( parts[ 4 ].text, '$a = 1;' );
} );

test( 'Markdown the pages would not draw is refused, not dropped', () => {
	for ( const md of [ '> A quote.', '<details>', '![A picture](a.png)', '- A list\n  - inside a list', '---', 'Underlined\n===' ] ) {
		assert.ok( blocks( md ).problems.length, md );
	}
} );

test( 'every handbook is drawn from its doc, with nothing the check refuses', () => {
	const { pages, problems } = build();
	assert.deepEqual( problems, [] );
	assert.equal( pages.size, HANDBOOKS.length );
	const player = pages.get( path.join( ROOT, 'site', 'developers', 'player', 'index.html' ) );
	assert.match( player, /<h1>How the player works<\/h1>/ );
	assert.match( player, /<h2 id="registering-controls-and-views" class="is-toc-heading">/ );
	assert.match( player, /<li><a href="#registering-controls-and-views">Registering controls and views<\/a><\/li>/ );
	assert.match( player, /aria-current="true">The player<\/a>/ );
	assert.match( player, /href="https:\/\/github\.com\/RiffPress\/RiffPress\/edit\/main\/docs\/player\.md">Edit this page on GitHub/ );
	// A link to another file opens it at the commit published.
	assert.match( player, /href="https:\/\/github\.com\/RiffPress\/RiffPress\/blob\/\{\{commit\}\}\/DESIGN\.md"/ );
	const extensions = pages.get( path.join( ROOT, 'site', 'developers', 'extensions', 'index.html' ) );
	// A link to a doc the reference mirrors goes to the reference, by its name.
	assert.match( extensions, /<a href="\.\.\/hooks\/">Hooks<\/a>, <a href="\.\.\/javascript\/">JavaScript<\/a>/ );
} );

test( 'a link to a file, a heading or a hook that is not there fails the check', () => {
	const ok = doc( '# Doc\n\n## Here\n\n[Here](#here), [a hook](../../docs/hooks.md#riff_track), [the readme](../../README.md).\n', 'docs' );
	const { pages, problems } = build( [ ok ] );
	assert.deepEqual( problems, [] );
	const html = [ ...pages.values() ][ 0 ];
	assert.match( html, /href="\.\.\/hooks\/riff_track\/"/ );
	assert.match( html, /href="https:\/\/github\.com\/RiffPress\/RiffPress\/blob\/\{\{commit\}\}\/README\.md"/ );

	const bad = doc( '# Doc\n\n[Gone](#gone), [no hook](../../docs/hooks.md#riff_nothing), [no file](../../NOPE.md), [no anchor](../../docs/javascript.md#x).\n', 'docs' );
	const found = build( [ bad ] ).problems.join( '\n' );
	assert.match( found, /#gone, a heading it doesn't have/ );
	assert.match( found, /docs\/hooks\.md#riff_nothing/ );
	assert.match( found, /NOPE\.md, which isn't in the repository/ );
	assert.match( found, /docs\/javascript\.md#x/ );
} );

test( 'a doc needs one title at its top', () => {
	assert.match( build( [ doc( 'No title.\n' ) ] ).problems.join( '\n' ), /needs one title/ );
} );
