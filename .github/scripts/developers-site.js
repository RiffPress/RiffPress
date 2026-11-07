#!/usr/bin/env node
/**
 * Takes the developer site out of the assembled site: the reference (/developers/ and the /web/
 * pages, Built on the open web) and the pages about the software (Download, Add music, How Riff is
 * built, Accessibility) go to source.riffpress.com, with the site's own files they show. What is
 * left is not deployed: riffpress.com is the business's site, from its own repository, and the
 * _redirects written here, a 301 from each old address to the new one, are the ones it carries.
 *
 * The sources stay one site: site/ is written, generated and previewed as riffpress.com with
 * /developers/ and /web/ in it, and this runs on the Pages workflow's output once its placeholders
 * are filled, so the reference is still built from the same code on every deploy. It moves the
 * pages, copies the shared files they need (the stylesheets, fonts, icons, the wordmark and the
 * strings' script), points every link at the host that now serves it, splits the sitemap, writes
 * the redirects, and then checks every link and fragment between the two outputs, failing the
 * deploy on one that leads nowhere.
 *
 * Usage: node .github/scripts/developers-site.js <out> <developers-out> <site-url> <developers-url>
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );

// What moves, as [ path on the site, path on the developer host ]. web/web.css stays as well:
// every page of the site is styled by it.
const MOVED = [
	[ 'developers/', '' ],
	[ 'web/', 'web/' ],
	[ 'download/', 'download/' ],
	[ 'add-music/', 'add-music/' ],
	[ 'built/', 'built/' ],
	[ 'accessibility/', 'accessibility/' ],
];
// Files beside the pages that both hosts serve.
const SHARED = [ 'neck.css', 'neck.svg', 'js', 'fonts', 'icons', 'brand' ];
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
 * The site split in two.
 *
 * @param {Object} o            Options.
 * @param {string} o.out        The assembled site, changed in place.
 * @param {string} o.dev        Where the developer host's files go.
 * @param {string} o.site       The site's address, ending in a slash.
 * @param {string} o.developers The developer host's address, ending in a slash.
 * @return {{ moved: string[], problems: string[] }} The pages moved, and every broken link.
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
						return site + where.rel;
					}
					return absolute
						? developers + where.rel
						: relative( at, where.rel );
				} )
		);
		fs.writeFileSync( to, html );
	}

	// The site: the moved pages go, and its links to them point at the new host.
	for ( const [ from ] of MOVED.filter( ( [ f ] ) => f !== 'web/' ) ) {
		fs.rmSync( path.join( out, from ), { recursive: true, force: true } );
	}
	for ( const page of pages.keys() ) {
		if ( page.startsWith( 'web/' ) ) {
			fs.rmSync( path.join( out, page, 'index.html' ), { force: true } );
		}
	}
	// The folders the pages left empty.
	for ( const dir of fs.readdirSync( path.join( out, 'web' ) ) ) {
		const full = path.join( out, 'web', dir );
		if ( fs.statSync( full ).isDirectory() && ! walk( full ).length ) {
			fs.rmSync( full, { recursive: true } );
		}
	}
	for ( const file of walk( out ).filter( ( f ) => f.endsWith( '.html' ) ) ) {
		const page = pageOf( file );
		const before = fs.readFileSync( path.join( out, file ), 'utf8' );
		const html = rewrite( before, ( name, value ) =>
			each( name, value, ( u ) => {
				const rel = onSite( u, page );
				const moved = rel === null ? null : moves( rel );
				return moved === null ? u : developers + moved;
			} )
		);
		if ( html !== before ) {
			fs.writeFileSync( path.join( out, file ), html );
		}
	}

	// The sitemap, split by host.
	const map = path.join( out, 'sitemap.xml' );
	if ( fs.existsSync( map ) ) {
		const xml = fs.readFileSync( map, 'utf8' );
		const urls = xml.match( /^\s*<url>.*<\/url>\n/gm ) || [];
		const keep = [];
		const give = [];
		for ( const entry of urls ) {
			const loc = entry.match( /<loc>([^<]*)<\/loc>/ )[ 1 ];
			const rel = loc.startsWith( site )
				? moves( loc.slice( site.length ) )
				: null;
			( rel === null ? keep : give ).push(
				rel === null ? entry : entry.replace( loc, developers + rel )
			);
		}
		const [ open ] = xml.split( urls[ 0 ] );
		const close = '</urlset>\n';
		fs.writeFileSync( map, open + keep.join( '' ) + close );
		fs.writeFileSync(
			path.join( dev, 'sitemap.xml' ),
			open + give.join( '' ) + close
		);
	}
	fs.writeFileSync(
		path.join( dev, 'robots.txt' ),
		`User-agent: *\nAllow: /\nSitemap: ${ developers }sitemap.xml\n`
	);
	// The site's own 404, whose links are all absolute, serves for a miss on either host, with what
	// it is drawn with, and what moved, taken from the developer host.
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

	// One redirect per moved page, with and without its slash, and the rest of each moved folder
	// after them. web/ has no catch-all, since its stylesheet stays.
	const base = new URL( site ).pathname;
	const lines = [];
	for ( const [ from, to ] of pages ) {
		lines.push( `${ base }${ from } ${ developers }${ to } 301` );
		if ( from.endsWith( '/' ) ) {
			lines.push(
				`${ base }${ from.slice( 0, -1 ) } ${ developers }${ to } 301`
			);
		}
	}
	for ( const [ from, to ] of MOVED.filter( ( [ f ] ) => f !== 'web/' ) ) {
		lines.push( `${ base }${ from }* ${ developers }${ to }:splat 301` );
	}
	fs.appendFileSync(
		path.join( out, '_redirects' ),
		lines.join( '\n' ) + '\n'
	);

	return {
		moved: [ ...pages.keys() ],
		problems: check( { out, dev, site, developers } ),
	};
}

/**
 * Every link between the two outputs that leads nowhere: a page or file that is not there, or a
 * fragment no element on its page carries. Pages are read for their links, stylesheets for their
 * url()s and modules for their relative imports, so a shared file left behind fails too. Links off the two hosts are left alone.
 *
 * @param {Object} o            Options, as split() takes them.
 * @param {string} o.out        The site.
 * @param {string} o.dev        The developer host.
 * @param {string} o.site       The site's address.
 * @param {string} o.developers The developer host's address.
 * @return {string[]} Problems, as "file: url".
 */
function check( { out, dev, site, developers } ) {
	const hosts = [
		[ site, out ],
		[ developers, dev ],
	];
	const redirects = fs.existsSync( path.join( out, '_redirects' ) )
		? fs
				.readFileSync( path.join( out, '_redirects' ), 'utf8' )
				.split( '\n' )
				.map( ( l ) => l.split( /\s+/ )[ 0 ] )
				.filter( Boolean )
		: [];
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
						if (
							home[ 1 ] === out &&
							redirects.includes(
								new URL( home[ 0 ] ).pathname + rel
							)
						) {
							continue;
						}
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

module.exports = { split, check, relative, MOVED };

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
		`${ moved.length } pages moved to ${ developers }; every link between the two hosts resolves\n`
	);
}
