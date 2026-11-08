#!/usr/bin/env node
/**
 * Builds source.riffpress.com from the assembled site: the reference (/developers/, which becomes
 * the host's root, and the /web/ pages, Built on the open web) and the pages about the software
 * (Download, Add music, How Riff is built, Accessibility), with the site's own files they show.
 *
 * site/ is written, generated and previewed with the reference under /developers/, and this runs
 * on the Pages workflow's output once its placeholders are filled, so the reference is still built
 * from the same code on every deploy. It moves the pages, copies the shared files they need (the
 * stylesheets, fonts, icons, the wordmark and the strings' script) and the pictures they show,
 * points every link at where the host now serves it, writes the host's sitemap, and then checks
 * every link and fragment on the host, failing the deploy on one that leads nowhere. What it
 * leaves behind is not deployed: riffpress.com is the business's site, from its own repository.
 *
 * Usage: node .github/scripts/developers-site.js <out> <developers-out> <site-url> <developers-url>
 *
 * <site-url> is the address the pages were written for, which {{pages_url}} was filled with; links
 * to anything on it that the host doesn't serve are written out to it in full.
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );

// What moves, as [ path on the site, path on the developer host ]. web/web.css goes as a shared
// file: every page is styled by it.
const MOVED = [
	[ 'developers/', '' ],
	[ 'web/', 'web/' ],
	[ 'download/', 'download/' ],
	[ 'add-music/', 'add-music/' ],
	[ 'built/', 'built/' ],
	[ 'accessibility/', 'accessibility/' ],
];
// Files beside the pages that every page may need.
// tokens.css is riffpress.com's, byte for byte (tokens.js checks it): every page loads it first.
const SHARED = [ 'tokens.css', 'js', 'fonts', 'icons', 'brand' ];
const ATTRS = /(\s)(href|src|content|action|srcset)="([^"]*)"/g;
// A tag, or a block whose text is not markup: its opening tag is read, what is inside it is not.
const TAGS =
	/(<(script|style|pre|code|textarea)\b[^>]*>)([\s\S]*?)(<\/\2>)|<[a-z][^>]*>/gi;

/**
 * The URL attributes of every tag on a page, rewritten, and nothing in its text or code samples.
 *
 * @param {string}                           html The page.
 * @param {function(string, string): string} fn   ( name, value ) => the new value.
 * @return {string} The page.
 */
const rewrite = ( html, fn ) =>
	html.replace( TAGS, ( m, open, name, inner, close ) => {
		const tag = ( t ) =>
			t.replace(
				ATTRS,
				( a, sp, n, v ) => `${ sp }${ n }="${ fn( n, v ) }"`
			);
		return open ? tag( open ) + inner + close : tag( m );
	} );

/**
 * Every URL attribute on a page, as [ name, value ].
 *
 * @param {string} html The page.
 * @return {Array} Pairs.
 */
const attributes = ( html ) => {
	const found = [];
	rewrite( html, ( n, v ) => {
		found.push( [ n, v ] );
		return v;
	} );
	return found;
};

/**
 * Every file under a folder, as paths relative to it with forward slashes.
 *
 * @param {string} dir Folder.
 * @return {string[]} Paths.
 */
const walk = ( dir ) =>
	fs.existsSync( dir )
		? fs
				.readdirSync( dir, { recursive: true } )
				.map( ( f ) => f.split( path.sep ).join( '/' ) )
				.filter( ( f ) => fs.statSync( path.join( dir, f ) ).isFile() )
				.sort()
		: [];

/**
 * A page's address from its file: "developers/php/index.html" is "developers/php/".
 *
 * @param {string} file Path relative to the output.
 * @return {string} Path relative to the host.
 */
const pageOf = ( file ) => file.replace( /(^|\/)index\.html$/, '$1' );

/**
 * The path from one page to another on the same host, by way of the root, as the generated pages
 * write their own links.
 *
 * @param {string} from The linking page's path, ending in a slash or empty at the root.
 * @param {string} to   The target's path from the root.
 * @return {string} A relative URL.
 */
const relative = ( from, to ) =>
	'../'.repeat( from.split( '/' ).length - 1 ) + to || './';

/**
 * The developer host, built from the assembled site.
 *
 * @param {Object} o            Options.
 * @param {string} o.out        The assembled site, which is only read.
 * @param {string} o.dev        Where the developer host's files go.
 * @param {string} o.site       The site's address, ending in a slash.
 * @param {string} o.developers The developer host's address, ending in a slash.
 * @return {{ moved: string[], problems: string[] }} The pages moved, and every link that leads
 *                                                  nowhere.
 */
function split( { out, dev, site, developers } ) {
	const files = walk( out );
	// The moved pages, keyed by their old path: "developers/php/" => "php/".
	const pages = new Map();
	for ( const file of files ) {
		const rule = MOVED.find( ( [ from ] ) => file.startsWith( from ) );
		if ( rule && file.endsWith( '.html' ) ) {
			pages.set(
				pageOf( file ),
				rule[ 1 ] + pageOf( file ).slice( rule[ 0 ].length )
			);
		}
	}
	if ( ! pages.has( 'developers/' ) ) {
		throw new Error( `no developers/index.html in ${ out }` );
	}

	// A path on the site, where the developer host now serves it, or null if it stays.
	const moves = ( rel ) => {
		const bare = rel.replace( /[?#].*$/, '' );
		const tail = rel.slice( bare.length );
		if ( pages.has( bare ) ) {
			return pages.get( bare ) + tail;
		}
		// Anything else under a moved folder goes with it; web/ keeps its stylesheet.
		const rule = MOVED.find(
			( [ from ] ) => from !== 'web/' && bare.startsWith( from )
		);
		return rule ? rule[ 1 ] + bare.slice( rule[ 0 ].length ) + tail : null;
	};
	// The site's own files a moved page shows, such as a screenshot: copied to the developer host.
	const assets = new Set();
	// A path on the site from the developer host: moved, shared, or back on the site.
	const fromDev = ( rel ) => {
		const moved = moves( rel );
		if ( moved !== null ) {
			return { host: 'dev', rel: moved };
		}
		const bare = rel.replace( /[?#].*$/, '' );
		const top = bare.split( '/' )[ 0 ];
		if ( SHARED.includes( top ) || rel.startsWith( 'web/web.css' ) ) {
			return { host: 'dev', rel };
		}
		if (
			/\.[a-z0-9]+$/i.test( bare ) &&
			! bare.endsWith( '.html' ) &&
			files.includes( bare )
		) {
			assets.add( bare );
			return { host: 'dev', rel };
		}
		return { host: 'site', rel };
	};
	// A URL as written on a page at the site's `page`, resolved to a path on the site, or null.
	const onSite = ( value, page ) => {
		if ( ! value || /^(#|mailto:|data:|javascript:)/i.test( value ) ) {
			return null;
		}
		let url;
		try {
			url = new URL( value, site + page );
		} catch {
			return null;
		}
		return url.href.startsWith( site )
			? url.href.slice( site.length )
			: null;
	};
	// Each URL in an attribute's value: one, or a srcset's list.
	// A meta's content is only a URL when it reads as one.
	const each = ( name, value, fn ) =>
		name === 'content' && ! /^https?:/.test( value )
			? value
			: name === 'srcset'
				? value
						.split( ',' )
						.map( ( part ) =>
							part.replace(
								/^(\s*)(\S+)/,
								( m, sp, u ) => sp + fn( u )
							)
						)
						.join( ',' )
				: fn( value );

	// Links to the site that the host doesn't serve. riffpress.com isn't built from here, so only its
	// home, written out in full, is a page there to link to; anything else leads nowhere.
	const strays = [];
	// The developer host: the pages, the files beside them, the shared files.
	fs.rmSync( dev, { recursive: true, force: true } );
	for ( const file of files ) {
		const target = SHARED.includes( file.split( '/' )[ 0 ] )
			? file
			: ( moves( file ) ?? ( file.startsWith( 'web/' ) ? file : null ) );
		if ( target === null ) {
			continue;
		}
		const to = path.join( dev, target );
		fs.mkdirSync( path.dirname( to ), { recursive: true } );
		if ( ! file.endsWith( '.html' ) ) {
			fs.copyFileSync( path.join( out, file ), to );
			continue;
		}
		const page = pageOf( file );
		const at = pages.get( page );
		const html = rewrite(
			fs.readFileSync( path.join( out, file ), 'utf8' ),
			( name, value ) =>
				each( name, value, ( u ) => {
					const rel = onSite( u, page );
					if ( rel === null ) {
						return u;
					}
					const where = fromDev( rel );
					const absolute = /^[a-z]+:/i.test( u );
					if ( where.host === 'site' ) {
						if ( ! absolute || where.rel !== '' ) {
							strays.push( `${ path.relative( process.cwd(), to ) }: ${ site + where.rel }` );
						}
						return site + where.rel;
					}
					return absolute
						? developers + where.rel
						: relative( at, where.rel );
				} )
		);
		fs.writeFileSync( to, html );
	}

	// What search reads: every page's title, door, summary and headings.
	fs.writeFileSync( path.join( dev, 'search.json' ), JSON.stringify( searchIndex( dev ) ) );

	// The sitemap: the host's pages, at their new addresses.
	const map = path.join( out, 'sitemap.xml' );
	if ( fs.existsSync( map ) ) {
		const xml = fs.readFileSync( map, 'utf8' );
		const urls = xml.match( /^\s*<url>.*<\/url>\n/gm ) || [];
		const give = [];
		for ( const entry of urls ) {
			const loc = entry.match( /<loc>([^<]*)<\/loc>/ )[ 1 ];
			const rel = loc.startsWith( site )
				? moves( loc.slice( site.length ) )
				: null;
			if ( rel !== null ) {
				give.push( entry.replace( loc, developers + rel ) );
			}
		}
		const [ open ] = xml.split( urls[ 0 ] );
		fs.writeFileSync(
			path.join( dev, 'sitemap.xml' ),
			open + give.join( '' ) + '</urlset>\n'
		);
	}
	fs.writeFileSync(
		path.join( dev, 'robots.txt' ),
		`User-agent: *\nAllow: /\nSitemap: ${ developers }sitemap.xml\n`
	);
	// The 404, whose links are all absolute, serves for a miss anywhere on the host, its links
	// pointed at the host.
	if ( fs.existsSync( path.join( out, '404.html' ) ) ) {
		const html = rewrite(
			fs.readFileSync( path.join( out, '404.html' ), 'utf8' ),
			( name, value ) =>
				each( name, value, ( u ) => {
					const rel = onSite( u, '' );
					const where = rel === null ? null : fromDev( rel );
					return where?.host === 'dev' ? developers + where.rel : u;
				} )
		);
		fs.writeFileSync( path.join( dev, '404.html' ), html );
	}
	for ( const file of assets ) {
		fs.mkdirSync( path.dirname( path.join( dev, file ) ), {
			recursive: true,
		} );
		fs.copyFileSync( path.join( out, file ), path.join( dev, file ) );
	}
	// As the site caches them: stamped by commit, so kept for good; the pages are fetched fresh.
	fs.writeFileSync(
		path.join( dev, '_headers' ),
		[ '/:name.css', '/web/web.css', '/fonts/*' ]
			.map(
				( p ) =>
					`${ p }\n  Cache-Control: public, max-age=31536000, immutable\n`
			)
			.join( '' ) + '/index.html\n  Cache-Control: no-cache\n'
	);

	return {
		moved: [ ...pages.keys() ],
		problems: [ ...new Set( strays ), ...check( { dev, developers } ) ],
	};
}

/**
 * The search index for the host: for each page, its address from the host's root, its title, the
 * door it is in, its summary, and each heading with an id, so a result can lead to the section.
 * Entities are decoded and tags dropped; nothing else is kept, so the file stays small.
 *
 * @param {string} dev The developer host, as written.
 * @return {Array} [ { u, t, d, s, h: [ [ id, text ] ] } ].
 */
function searchIndex( dev ) {
	// Tags are dropped until none are left, then each entity is decoded once, in one pass, so
	// "&amp;lt;" stays "&lt;" and no decoded "<" can form a tag.
	const named = { quot: '"', lt: '<', gt: '>', amp: '&', apos: "'" };
	const text = ( html ) => {
		let out = html;
		let before = '';
		while ( before !== out ) {
			before = out;
			out = out.replace( /<[^<>]*>/g, '' );
		}
		return out
			.replace( /[<>]/g, '' )
			.replace( /&(?:#(\d+)|#x([0-9a-f]+)|(quot|lt|gt|amp|apos));/gi, ( m, dec, hex, name ) => {
				if ( dec ) {
					return String.fromCodePoint( Number( dec ) );
				}
				if ( hex ) {
					return String.fromCodePoint( parseInt( hex, 16 ) );
				}
				return named[ name.toLowerCase() ];
			} )
			.replace( /\s+/g, ' ' )
			.trim();
	};
	const pages = fs
		.readdirSync( dev, { recursive: true } )
		.filter( ( f ) => f.endsWith( 'index.html' ) && ! f.startsWith( 'demo' ) )
		.sort();
	const index = pages.map( ( file ) => {
		const html = fs.readFileSync( path.join( dev, file ), 'utf8' );
		const main = html.slice( html.indexOf( '<main' ), html.indexOf( '</main>' ) );
		// The page's own title, less the host's name: a hook's h1 is its whole call.
		const title = html.match( /<title>([^<]*)<\/title>/ );
		const door = html.match( /<span class="docs-where-up">([^<]*)<\/span>/ ) || html.match( /<span class="docs-where">([^<]*)<\/span>/ );
		const summary = html.match( /<meta name="description" content="([^"]*)">/ );
		const headings = [ ...main.matchAll( /<h[23][^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h[23]>/g ) ].map( ( m ) => [ m[ 1 ], text( m[ 2 ] ) ] );
		return {
			u: file.replace( /index\.html$/, '' ),
			t: title ? text( title[ 1 ] ).replace( / \| Riff Source$/, '' ) : '',
			d: door ? text( door[ 1 ] ) : '',
			s: summary ? text( summary[ 1 ] ) : '',
			h: headings,
		};
	} );
	// A heading on more than three pages is the reference's own scaffolding, and would fill the
	// results with one word; the pages are found by their titles instead.
	const seen = new Map();
	for ( const p of index ) {
		for ( const [ , t ] of p.h ) {
			seen.set( t, ( seen.get( t ) || 0 ) + 1 );
		}
	}
	for ( const p of index ) {
		p.h = p.h.filter( ( [ , t ] ) => seen.get( t ) <= 3 );
	}
	return index;
}

/**
 * Every link on the host that leads nowhere: a page or file that is not there, or a fragment no
 * element on its page carries. Pages are read for their links, stylesheets for their url()s and
 * modules for their relative imports, so a shared file left behind fails too. Links off the host
 * are left alone.
 *
 * @param {Object} o            Options, as split() takes them.
 * @param {string} o.dev        The developer host.
 * @param {string} o.developers The developer host's address.
 * @return {string[]} Problems, as "file: url".
 */
function check( { dev, developers } ) {
	const hosts = [ [ developers, dev ] ];
	const ids = new Map();
	const idsOf = ( file ) => {
		if ( ! ids.has( file ) ) {
			const html = fs.readFileSync( file, 'utf8' );
			ids.set(
				file,
				new Set(
					[ ...html.matchAll( /\b(?:id|name)="([^"]+)"/g ) ].map(
						( m ) => m[ 1 ]
					)
				)
			);
		}
		return ids.get( file );
	};
	const problems = [];
	for ( const [ host, dir ] of hosts ) {
		for ( const file of walk( dir ).filter( ( f ) =>
			/\.(html|css|js)$/.test( f )
		) ) {
			const text = fs.readFileSync( path.join( dir, file ), 'utf8' );
			// A page's links; a stylesheet's url()s; a module's relative imports.
			let refs = attributes( text );
			if ( file.endsWith( '.css' ) ) {
				refs = [
					...text.matchAll( /url\(\s*["']?([^"')]+)["']?\s*\)/g ),
				].map( ( m ) => [ 'src', m[ 1 ] ] );
			} else if ( file.endsWith( '.js' ) ) {
				refs = [
					...text.matchAll(
						/(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\.{1,2}\/[^"']+)["']/g
					),
				].map( ( m ) => [ 'src', m[ 1 ] ] );
			}
			// A page's own address is its folder; a file's is itself.
			const self = file.endsWith( '.html' ) ? pageOf( file ) : file;
			for ( const [ name, value ] of refs ) {
				// A meta's content is only a URL when it reads as one.
				const urls =
					name === 'srcset'
						? value
								.split( ',' )
								.map( ( p ) => p.trim().split( /\s+/ )[ 0 ] )
						: [ value ];
				for ( const u of urls ) {
					if (
						! u ||
						/^(mailto:|data:|javascript:)/i.test( u ) ||
						( name === 'content' && ! /^https?:/.test( u ) )
					) {
						continue;
					}
					const url = new URL( u, host + self );
					const home = hosts.find( ( [ h ] ) =>
						url.href.startsWith( h )
					);
					if ( ! home ) {
						continue;
					}
					const rel = decodeURIComponent( url.pathname ).slice(
						new URL( home[ 0 ] ).pathname.length
					);
					let target = path.join(
						home[ 1 ],
						rel,
						rel === '' || rel.endsWith( '/' ) ? 'index.html' : ''
					);
					if (
						! fs.existsSync( target ) &&
						fs.existsSync(
							path.join( home[ 1 ], rel, 'index.html' )
						)
					) {
						target = path.join( home[ 1 ], rel, 'index.html' );
					}
					if (
						! fs.existsSync( target ) ||
						fs.statSync( target ).isDirectory()
					) {
						problems.push(
							`${ path.relative( process.cwd(), path.join( dir, file ) ) }: ${ u }`
						);
						continue;
					}
					const frag = url.hash.slice( 1 );
					if (
						frag &&
						target.endsWith( '.html' ) &&
						! idsOf( target ).has( decodeURIComponent( frag ) )
					) {
						problems.push(
							`${ path.relative( process.cwd(), path.join( dir, file ) ) }: ${ u } (no #${ frag })`
						);
					}
				}
			}
		}
	}
	return [ ...new Set( problems ) ];
}

module.exports = { searchIndex, split, check, relative, MOVED };

if ( require.main === module ) {
	const [ out, dev, site, developers ] = process.argv.slice( 2 );
	const address = /^https?:\/\/[a-z0-9.-]+(:[0-9]+)?\/([^\s?#]*\/)?$/;
	if (
		! out ||
		! dev ||
		! address.test( site || '' ) ||
		! address.test( developers || '' ) ||
		site === developers
	) {
		process.stderr.write(
			'Usage: developers-site.js <out> <developers-out> <site-url/> <developers-url/>\n'
		);
		process.exit( 1 );
	}
	const { moved, problems } = split( { out, dev, site, developers } );
	if ( problems.length ) {
		process.stderr.write(
			`${ problems.length } link(s) lead nowhere:\n${ problems.map( ( p ) => `  ${ p }\n` ).join( '' ) }`
		);
		process.exit( 1 );
	}
	process.stdout.write(
		`${ moved.length } pages moved to ${ developers }; every link on it resolves\n`
	);
}
