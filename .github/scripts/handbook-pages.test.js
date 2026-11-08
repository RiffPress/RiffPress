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
	for ( const md of [ '> A quote.', '<details>', 'Words, then ![a picture](a.png)', '![](a.png)', '- ![A picture](a.png)','- A list\n  - inside a list', '---', 'Underlined\n===', 'One line,\n> then a quote.', '- An item\nlazily continued.', '- An item\n\t\twith a tab.', '- An item\n  ```js\n  code\n  ```', '##### Deep', '~~~\ncode\n~~~', '1) One', '3. Three', '[a][b]', '[a](u "t")' ] ) {
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
	assert.match( player, /aria-current="page">Player<\/a>/ );
	assert.match( player, /href="https:\/\/github\.com\/RiffPress\/RiffPress\/edit\/main\/docs\/player\.md">Edit this page on GitHub/ );
	// A link to another file opens it at the commit published.
	assert.match( player, /href="https:\/\/github\.com\/RiffPress\/RiffPress\/blob\/\{\{commit\}\}\/DESIGN\.md"/ );
	const extensions = pages.get( path.join( ROOT, 'site', 'developers', 'extensions', 'index.html' ) );
	// A link to a doc the reference mirrors goes to the reference, by its name.
	assert.match( extensions, /<a href="\.\.\/hooks\/">Hooks<\/a>, <a href="\.\.\/javascript\/">JavaScript<\/a>/ );
	// So do words that are the doc's path.
	assert.match( player, /<a href="\.\.\/javascript\/">JavaScript<\/a>/ );
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

test( 'a picture on a line of its own is one of the site\'s, with its AVIFs, and one site/ lacks fails the check', () => {
	const ok = doc( '# Doc\n\nWords.\n![The editor](../../site/guide-post.png)\n\n![A phone](../../site/phone-post.png)\n', 'docs' );
	const { pages, problems } = build( [ ok ] );
	assert.deepEqual( problems, [] );
	const html = [ ...pages.values() ][ 0 ];
	assert.match( html, /<p>Words\.<\/p>\n<figure><picture><source type="image\/avif" srcset="\.\.\/\.\.\/guide-post\.avif 2880w, \.\.\/\.\.\/guide-post-1440\.avif 1440w" [^>]*><img class="desk" src="\.\.\/\.\.\/guide-post\.png" width="2880" height="1800" alt="The editor"/ );
	assert.match( html, /<figure><span class="device"><picture><source type="image\/avif" srcset="\.\.\/\.\.\/phone-post\.avif 780w" sizes="300px"><img src="\.\.\/\.\.\/phone-post\.png"/ );

	const found = build( [ doc( '# Doc\n\n![Gone](../../site/nope.png)\n\n![Not the site\'s](../../README.md)\n', 'docs' ) ] ).problems.join( '\n' );
	assert.match( found, /shows \.\.\/\.\.\/site\/nope\.png, which isn't a picture in site\// );
	assert.match( found, /shows \.\.\/\.\.\/README\.md, which isn't a picture in site\// );
} );

test( 'a link to a page of Source\'s goes to it from the page, and one it does not build fails the check', () => {
	const ok = doc( '# Doc\n\n[REST](https://source.riffpress.com/rest/#routes), [a hook](https://source.riffpress.com/hooks/riff_track/), [Add your music](https://source.riffpress.com/add-music/), [the player](https://source.riffpress.com/player/#registering-controls-and-views).\n', 'docs' );
	const { pages, problems } = build( [ ...HANDBOOKS, ok ] );
	assert.deepEqual( problems, [] );
	const html = [ ...pages.values() ].pop();
	assert.match( html, /href="\.\.\/\.\.\/developers\/rest\/#routes"/ );
	assert.match( html, /href="\.\.\/\.\.\/developers\/hooks\/riff_track\/"/ );
	assert.match( html, /href="\.\.\/\.\.\/add-music\/"/ );
	assert.match( html, /href="\.\.\/\.\.\/developers\/player\/#registering-controls-and-views"/ );

	const found = build( [ ...HANDBOOKS, doc( '# Doc\n\n[No page](https://source.riffpress.com/nope/), [Not on the host](https://source.riffpress.com/developers/rest/), [No heading](https://source.riffpress.com/player/#nope).\n', 'docs' ) ] ).problems.join( '\n' );
	assert.match( found, /nope\/, which isn't a page of Source's/ );
	assert.match( found, /developers\/rest\/, which isn't a page of Source's/ );
	assert.match( found, /player\/#nope, a heading that page doesn't have/ );
} );

test( 'a doc needs one title at its top', () => {
	assert.match( build( [ doc( 'No title.\n' ) ] ).problems.join( '\n' ), /needs one title/ );
} );
