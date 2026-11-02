#!/usr/bin/env node
/**
 * The handbooks under /developers/, beside the reference, as developer.wordpress.org keeps its
 * handbooks beside its code reference: each a page built from one of the repository's own docs,
 * so the page is the Markdown a contributor reads and edits, and cannot say something else.
 *
 * The pages link to the code at the commit being published, so they are built at deploy time and
 * are not committed. The Markdown is read in the subset the docs are written in: headings,
 * paragraphs, lists, tables, fenced code, and inline code, bold, emphasis and links. A link to
 * another doc that has a page goes to that page; a link to any other file in the repository opens
 * it on GitHub.
 *
 * --check fails when a doc uses Markdown outside that subset, has no title, or links to a file,
 * a heading or a hook that isn't there.
 *
 * Usage: node .github/scripts/handbook-pages.js [--check]
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );
const { esc, referencePage, HANDBOOKS } = require( './site-shell.js' );
const hooks = require( './hooks-reference.js' );

const ROOT = path.resolve( __dirname, '..', '..' );
const SITE = path.join( ROOT, 'site', 'developers' );
// The deploy fills {{commit}} with the SHA it publishes, so every link opens the code as deployed.
const REPO = 'https://github.com/RiffPress/RiffPress/';

// The generated references the docs link to, by the Markdown that mirrors them.
// A link whose words are only the file's name takes the page's name instead.
const REFERENCES = {
	'docs/hooks.md': [ 'hooks/', 'Hooks' ],
	'docs/javascript.md': [ 'javascript/', 'JavaScript' ],
};

/**
 * A heading's anchor as GitHub writes it, so a link into a doc works on GitHub and on its page.
 *
 * @param {string} text  The heading's Markdown.
 * @param {Map}    taken Anchors so far on the page, counted, for GitHub's -1, -2 on a repeat.
 * @return {string} The anchor.
 */
function slug( text, taken = new Map() ) {
	const base = text
		.replace( /\[([^\]]*)\]\([^)]*\)/g, '$1' )
		.toLowerCase()
		.replace( /[^\p{L}\p{N}\s_-]/gu, '' )
		.trim()
		.replace( /\s/g, '-' );
	const n = taken.get( base ) || 0;
	taken.set( base, n + 1 );
	return n ? `${ base }-${ n }` : base;
}

/**
 * A heading's text as plain words, for "In this article" and the title.
 *
 * @param {string} text Markdown.
 * @return {string} Words.
 */
const plain = ( text ) =>
	text
		.replace( /\[([^\]]*)\]\([^)]*\)/g, '$1' )
		.replace( /[`*_]/g, '' )
		.trim();

/**
 * Inline Markdown as HTML: code spans first, so nothing inside one is read as markup, then links,
 * bold and emphasis.
 *
 * @param {string}                             text Markdown.
 * @param {function(string, string): string[]} link ( href, words ) => [ the page's href, its words ].
 * @return {string} HTML.
 */
function inline( text, link ) {
	const codes = [];
	let html = text.replace( /`([^`]+)`/g, ( m, code ) => {
		codes.push( `<code>${ esc( code ) }</code>` );
		return `\u0000${ codes.length - 1 }\u0000`;
	} );
	html = esc(
		html.replace(
			/\\([\\`*_[\]|#])/g,
			( m, c ) => `\u0001${ c.charCodeAt( 0 ) }\u0001`
		)
	);
	html = html
		.replace( /\[([^\]]+)\]\(([^)\s]+)\)/g, ( m, words, href ) => {
			const [ to, said ] = link( href.replace( /&amp;/g, '&' ), words );
			return `<a href="${ esc( to ) }">${ said }</a>`;
		} )
		.replace( /\*\*([^*]+)\*\*/g, '<strong>$1</strong>' )
		.replace( /(^|[^\w*])\*([^*\s][^*]*)\*(?![\w*])/g, '$1<em>$2</em>' )
		.replace( /(^|[^\w])_([^_\s][^_]*)_(?!\w)/g, '$1<em>$2</em>' );
	return html
		.replace( /\u0001(\d+)\u0001/g, ( m, c ) =>
			esc( String.fromCharCode( Number( c ) ) )
		)
		.replace( /\u0000(\d+)\u0000/g, ( m, i ) => codes[ Number( i ) ] );
}

/**
 * A table row's cells: split at each pipe that isn't escaped or inside code.
 *
 * @param {string} line The row.
 * @return {string[]} Cells, trimmed.
 */
function cells( line ) {
	const out = [];
	let cell = '';
	let code = false;
	const row = line.trim().replace( /^\|/, '' ).replace( /\|$/, '' );
	for ( let i = 0; i < row.length; i++ ) {
		const c = row[ i ];
		if ( c === '\\' && row[ i + 1 ] === '|' ) {
			cell += '|';
			i++;
		} else if ( c === '`' ) {
			code = ! code;
			cell += c;
		} else if ( c === '|' && ! code ) {
			out.push( cell.trim() );
			cell = '';
		} else {
			cell += c;
		}
	}
	return [ ...out, cell.trim() ];
}

/**
 * One doc's blocks.
 *
 * @param {string} markdown The doc.
 * @return {{blocks: Array, problems: string[]}} Blocks: heading, paragraph, list, table and code.
 */
function blocks( markdown ) {
	const lines = markdown.replace( /\r\n/g, '\n' ).split( '\n' );
	const out = [];
	const problems = [];
	const listItem = /^([-*]|\d+\.) +(.*)$/;
	// Every line outside code, wherever it falls in a block, is held to the subset: what the pages
	// would draw wrong is refused, not drawn.
	const refused = [
		[ /^\s*>/, 'a quote' ],
		[ /^\s*<[a-zA-Z/!]/, 'HTML' ],
		[ /!\[[^\]]*\]\(/, 'an image' ],
		[ /^\s+(```|~~~)|^~~~/, 'code fenced other than with ``` at the start of a line' ],
		[ /^#{5,}/, 'a heading below ####' ],
		[ /^\s*\d+\) /, 'a list numbered with )' ],
		[ /^\t/, 'a line indented with a tab' ],
		[ /\]\[[^\]]*\]|^\s*\[[^\]]+\]:\s/, 'a reference-style link' ],
		[ /\]\([^)\s]+\s+["'(]/, 'a link with a title' ],
	];
	let fenced = false;
	lines.forEach( ( line, i ) => {
		if ( /^```/.test( line ) ) {
			fenced = ! fenced;
			return;
		}
		const hit = ! fenced && refused.find( ( [ re ] ) => re.test( line ) );
		if ( hit ) {
			problems.push( `line ${ i + 1 }: ${ hit[ 1 ] }, which the pages don't draw` );
		}
	} );
	for ( let i = 0; i < lines.length; ) {
		const line = lines[ i ];
		const at = `line ${ i + 1 }`;
		if ( ! line.trim() ) {
			i++;
			continue;
		}
		const fence = /^```([\w-]*)\s*$/.exec( line );
		if ( fence ) {
			const end = lines.findIndex(
				( l, j ) => j > i && /^```\s*$/.test( l )
			);
			if ( end < 0 ) {
				problems.push( `${ at }: a code block that never closes` );
				break;
			}
			out.push( {
				type: 'code',
				lang: fence[ 1 ],
				text: lines.slice( i + 1, end ).join( '\n' ),
			} );
			i = end + 1;
			continue;
		}
		const heading = /^(#{1,4}) +(.+?)\s*#*\s*$/.exec( line );
		if ( heading ) {
			out.push( {
				type: 'heading',
				level: heading[ 1 ].length,
				text: heading[ 2 ],
			} );
			i++;
			continue;
		}
		if (
			/^\|/.test( line ) &&
			/^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(
				lines[ i + 1 ] || ''
			)
		) {
			const head = cells( line );
			const rows = [];
			i += 2;
			while ( i < lines.length && /^\|/.test( lines[ i ] ) ) {
				const row = cells( lines[ i ] );
				if ( row.length !== head.length ) {
					problems.push(
						`line ${ i + 1 }: a table row with ${ row.length } cells under ${ head.length } headings`
					);
				}
				rows.push( row );
				i++;
			}
			out.push( { type: 'table', head, rows } );
			continue;
		}
		if ( listItem.test( line ) ) {
			const ordered = /^\d/.test( line );
			if ( ordered && ! /^1\./.test( line ) ) {
				problems.push( `${ at }: a list numbered from other than 1, which the pages would number from 1` );
			}
			const items = [];
			while ( i < lines.length ) {
				const m = listItem.exec( lines[ i ] );
				if ( m ) {
					if ( /^\d/.test( m[ 1 ] ) !== ordered ) {
						break;
					}
					items.push( [ m[ 2 ] ] );
				} else if (
					/^ {2,}\S/.test( lines[ i ] ) &&
					! listItem.test( lines[ i ].trim() )
				) {
					items[ items.length - 1 ].push( lines[ i ].trim() );
				} else if ( /^\s+([-*]|\d+\.) /.test( lines[ i ] ) ) {
					problems.push(
						`line ${ i + 1 }: a list inside a list, which the pages don't draw`
					);
					items[ items.length - 1 ].push( lines[ i ].trim() );
				} else {
					if ( lines[ i ].trim() ) {
						problems.push( `line ${ i + 1 }: a line after a list item that isn't indented, which the pages would draw as a paragraph of its own` );
					}
					break;
				}
				i++;
			}
			out.push( {
				type: 'list',
				ordered,
				items: items.map( ( words ) => words.join( ' ' ) ),
			} );
			continue;
		}
		if (
			/^(>|<|\s{4}|!\[|(-{3,}|\*{3,}|_{3,})\s*$)/.test( line ) ||
			/^(=+|-+)\s*$/.test( lines[ i + 1 ] || 'x' )
		) {
			problems.push(
				`${ at }: "${ line.trim().slice( 0, 40 ) }" is Markdown the pages don't draw (a quote, HTML, an image, a rule, an indented block or an underlined heading)`
			);
		}
		// The first line is the paragraph's whatever it is, so a line no rule above takes is still read.
		const words = [ line.trim() ];
		i++;
		while (
			i < lines.length &&
			lines[ i ].trim() &&
			! /^(```|#{1,4} |\|)/.test( lines[ i ] ) &&
			! listItem.test( lines[ i ] )
		) {
			words.push( lines[ i ].trim() );
			i++;
		}
		out.push( { type: 'paragraph', text: words.join( ' ' ) } );
	}
	return { blocks: out, problems };
}

/**
 * The hook pages, by the anchor docs/hooks.md gives each, so a link to one hook in hooks.md goes
 * to that hook's page.
 *
 * @return {Map} Anchor => the page's folder.
 */
function hookAnchors() {
	const list = hooks.collect();
	const md = hooks.render( list );
	const taken = new Map();
	const out = new Map();
	// A name can have two pages, a JavaScript filter's and an action's; hooks.md has them in the
	// same order, each under a heading of its own.
	const byName = new Map();
	for ( const p of hooks.pages( list ) ) {
		byName.set( p.name, [ ...( byName.get( p.name ) || [] ), p.slug ] );
	}
	for ( const m of md.matchAll( /^#{2,4} (.+)$/gm ) ) {
		const anchor = slug( m[ 1 ], taken );
		const name = /^`([^`]+)`$/.exec( m[ 1 ] );
		if ( name && byName.get( name[ 1 ] )?.length ) {
			out.set( anchor, byName.get( name[ 1 ] ).shift() );
		}
	}
	return out;
}

/**
 * Every handbook page, and what is wrong with any of them.
 *
 * @param {Array} list The handbooks.
 * @return {{pages: Map, problems: string[]}} Pages by file, and problems.
 */
function build( list = HANDBOOKS ) {
	const problems = [];
	const parsed = list.map( ( h ) => {
		const source = fs.readFileSync( path.join( ROOT, h.file ), 'utf8' );
		const { blocks: parts, problems: found } = blocks( source );
		problems.push( ...found.map( ( p ) => `${ h.file }, ${ p }` ) );
		const taken = new Map();
		for ( const b of parts.filter(
			( p ) => p.type === 'heading' && p.level > 1
		) ) {
			b.id = slug( b.text, taken );
		}
		return {
			...h,
			parts,
			ids: new Set( parts.filter( ( p ) => p.id ).map( ( p ) => p.id ) ),
		};
	} );
	const pages = new Map( parsed.map( ( h ) => [ h.file, h ] ) );
	let anchors = null;

	for ( const h of parsed ) {
		const titles = h.parts.filter(
			( p ) => p.type === 'heading' && p.level === 1
		);
		if ( titles.length !== 1 || h.parts[ 0 ] !== titles[ 0 ] ) {
			problems.push(
				`${ h.file } needs one title, a # heading, at its top`
			);
		}
		// A link as the doc has it, made the page's own; and its words, where they are only the
		// name of a file that has a page, the page's name.
		const link = ( href, words ) => {
			if ( /^[a-z]+:/i.test( href ) ) {
				return [ href, words ];
			}
			const [ file, frag = '' ] = href.split( '#' );
			if ( ! file ) {
				if ( ! h.ids.has( frag ) ) {
					problems.push(
						`${ h.file } links to #${ frag }, a heading it doesn't have`
					);
				}
				return [ `#${ frag }`, words ];
			}
			const to = path.posix.normalize(
				path.posix.join( path.posix.dirname( h.file ), file )
			);
			const named = ( name ) =>
				[ file, path.posix.basename( file ), to ].includes( words ) ? esc( name ) : words;
			if ( pages.has( to ) ) {
				if ( frag && ! pages.get( to ).ids.has( frag ) ) {
					problems.push(
						`${ h.file } links to ${ to }#${ frag }, a heading it doesn't have`
					);
				}
				return [
					`../${ pages.get( to ).slug }/${ frag ? `#${ frag }` : '' }`,
					named( pages.get( to ).label ),
				];
			}
			if ( REFERENCES[ to ] ) {
				const [ folder, name ] = REFERENCES[ to ];
				if ( frag ) {
					anchors = anchors || hookAnchors();
					if ( to === 'docs/hooks.md' && anchors.has( frag ) ) {
						return [ `../hooks/${ anchors.get( frag ) }/`, words ];
					}
					problems.push(
						`${ h.file } links to ${ to }#${ frag }, which has no page of its own; link to ${ to } itself`
					);
				}
				return [ `../${ folder }`, named( name ) ];
			}
			if (
				to.startsWith( '../' ) ||
				! fs.existsSync( path.join( ROOT, to ) )
			) {
				problems.push(
					`${ h.file } links to ${ file }, which isn't in the repository`
				);
				return [ `${ REPO }blob/{{commit}}/${ to }`, words ];
			}
			const kind = fs.statSync( path.join( ROOT, to ) ).isDirectory()
				? 'tree'
				: 'blob';
			return [
				`${ REPO }${ kind }/{{commit}}/${ to }${ frag ? `#${ frag }` : '' }`,
				words,
			];
		};
		h.html = '';
		h.toc = [];
		for ( const b of h.parts ) {
			if ( b.type === 'heading' && b.level === 1 ) {
				h.title = plain( b.text );
				h.h1 = `<h1>${ inline( b.text, link ) }</h1>`;
			} else if ( b.type === 'heading' ) {
				const tag = `h${ b.level }`;
				h.html += `<${ tag } id="${ b.id }" class="is-toc-heading"><a href="#${ b.id }">${ inline( b.text, link ) }</a></${ tag }>\n`;
				if ( b.level === 2 ) {
					h.toc.push( [ b.id, plain( b.text ) ] );
				} else if ( b.level === 3 && h.toc.length ) {
					const parent = h.toc[ h.toc.length - 1 ];
					parent[ 2 ] = [
						...( parent[ 2 ] || [] ),
						[ b.id, plain( b.text ) ],
					];
				}
			} else if ( b.type === 'paragraph' ) {
				h.description = h.description || plain( b.text );
				h.html += `<p>${ inline( b.text, link ) }</p>\n`;
			} else if ( b.type === 'list' ) {
				const tag = b.ordered ? 'ol' : 'ul';
				h.html += `<${ tag }>${ b.items.map( ( item ) => `<li>${ inline( item, link ) }</li>` ).join( '' ) }</${ tag }>\n`;
			} else if ( b.type === 'table' ) {
				h.html += `<table class="code-table"><thead><tr>${ b.head.map( ( c ) => `<th scope="col">${ inline( c, link ) }</th>` ).join( '' ) }</tr></thead><tbody>${ b.rows.map( ( r ) => `<tr>${ r.map( ( c ) => `<td>${ inline( c, link ) }</td>` ).join( '' ) }</tr>` ).join( '' ) }</tbody></table>\n`;
			} else if ( b.type === 'code' ) {
				h.html += hooks.codeBlock( b.text ) + '\n';
			}
		}
	}

	const out = new Map();
	for ( const h of parsed ) {
		out.set(
			path.join( SITE, h.slug, 'index.html' ),
			referencePage( {
				title: `${ h.title || h.label } | Riff`,
				description: h.description || h.label,
				url: `developers/${ h.slug }/`,
				current: h.slug,
				trail: [ [ h.title || h.label ] ],
				h1: h.h1 || `<h1>${ esc( h.label ) }</h1>`,
				toc: h.toc,
				body: `<div class="handbook">\n${ h.html }</div>\n`,
				edit: `${ REPO }edit/main/${ h.file }`,
			} )
		);
	}
	return { pages: out, problems };
}

function main() {
	const check = process.argv.includes( '--check' );
	const { pages, problems } = build();
	if ( ! check ) {
		for ( const [ file, html ] of pages ) {
			fs.rmSync( path.dirname( file ), { recursive: true, force: true } );
			fs.mkdirSync( path.dirname( file ), { recursive: true } );
			fs.writeFileSync( file, html );
		}
		console.log(
			`Wrote ${ HANDBOOKS.map( ( h ) => `site/developers/${ h.slug }/` ).join( ' and ' ) }`
		);
	}
	if ( problems.length ) {
		problems.forEach( ( p ) => console.error( p ) );
		process.exit( 1 );
	}
	if ( check ) {
		console.log(
			`The handbooks draw from their docs (${ HANDBOOKS.map( ( h ) => h.file ).join( ', ' ) })`
		);
	}
}

if ( require.main === module ) {
	main();
}

module.exports = { HANDBOOKS, slug, inline, cells, blocks, build };
