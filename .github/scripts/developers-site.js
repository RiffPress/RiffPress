#!/usr/bin/env node
/**
 * Builds Riff's two documentation hosts from the one assembled site: source.riffpress.com, getting
 * Riff and running it (Download, Add music, the Use, Run and Contribute doors, Built on the open
 * web, How Riff is built, Accessibility), and developer.riffpress.com, building on it (the
 * reference and the guides to extending Riff). site-nav.json says which host each page is on.
 *
 * site/ is written, generated and previewed with the docs under /developers/, and this runs on the
 * Pages workflow's output once its placeholders are filled, so the reference is still built from
 * the same code on every deploy. It moves each page to its host, under that host's root, copies the
 * shared files every page needs (the stylesheets, fonts, icons, the wordmark and the strings'
 * script) to both and the pictures a page shows to its host, points every link at where its target
 * is now served (relative on the same host, written out in full on the other), and writes each
 * host's sitemap, robots.txt, 404, search index, _headers and _redirects. Until this split both
 * hosts served every page, so each host's _redirects sends the addresses the other now serves
 * there, and no link to either breaks. It then checks every link and fragment on both hosts,
 * failing the deploy on one that leads nowhere. What it leaves behind is not deployed: riffpress.com
 * is the business's site, from its own repository.
 *
 * Usage: node .github/scripts/developers-site.js <out> <source-out> <developer-out> <site-url> <source-url> <developer-url>
 *
 * <site-url> is the address the pages were written for, which {{pages_url}} was filled with; links
 * to anything on it that neither host serves are written out to it in full.
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );
const { NAV, entries, rootOf } = require( './site-nav.js' );

// What moves, as [ path on the site, path on its host ]: where one host served every page before
// the split, and still each page's path on its host, but for each host's home, which is at its
// root. web/web.css goes as a shared file: every page is styled by it.
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
// What the Pages workflow puts beside Source's pages after the split: the live demo's files.
const DEMO = [ 'demo/', 'riff.zip', 'blueprint.json' ];
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
 * Which host a page or file on the site is on: the host of the deepest site-nav.json entry whose
 * path holds it, as hooks/ holds each hook's page, or null for a file no entry holds.
 *
 * @param {string} rel A path on the site.
 * @param {Object} nav The definition.
 * @return {string|null} The host's key.
 */
const ownerOf = ( rel, nav ) => {
	let best = null;
	for ( const { node, section } of entries( nav ).values() ) {
		if ( typeof node.href === 'string' && node.href && rel.startsWith( node.href ) && ( ! best || node.href.length > best.href.length ) ) {
			best = { href: node.href, host: section.host };
		}
	}
	return best ? best.host : null;
};

/**
 * Riff's documentation hosts, built from the assembled site.
 *
 * @param {Object} o       Options.
 * @param {string} o.out   The assembled site, which is only read.
 * @param {string} o.site  The site's address, ending in a slash.
 * @param {Object} o.hosts Each host by its key in site-nav.json's hosts: { dir, url }, where its
 *                         files go and its address, ending in a slash.
 * @param {Object} o.nav   The definition, site-nav.json's by default.
 * @return {{ moved: Object, redirects: Object, problems: string[] }} Each host's pages, each host's
 *                                                                   redirects, and every link
 *                                                                   that leads nowhere.
 */
function split( { out, site, hosts, nav = NAV } ) {
	const keys = Object.keys( nav.hosts );
	for ( const key of keys ) {
		if ( ! hosts[ key ] ) {
			throw new Error( `no folder and address for the ${ key } host` );
		}
	}
	const files = walk( out );
	// Each host's home sits at its root; everything else as MOVED has it.
	const rules = [
		...keys.map( ( key ) => [ rootOf( nav, key ).href, '' ] ),
		...MOVED,
	].sort( ( a, b ) => b[ 0 ].length - a[ 0 ].length );
	// Where a path on the site was served before the split, on the one host that served it all.
	const legacy = ( rel ) => {
		const rule = MOVED.find( ( [ from ] ) => rel.startsWith( from ) );
		return rule ? rule[ 1 ] + rel.slice( rule[ 0 ].length ) : null;
	};
	// The pages, keyed by their path on the site: "developers/php/" => { host, rel: "php/" }.
	const pages = new Map();
	for ( const file of files ) {
		const rule = rules.find( ( [ from ] ) => file.startsWith( from ) );
		if ( rule && file.endsWith( '.html' ) ) {
			const host = ownerOf( pageOf( file ), nav );
			if ( host ) {
				pages.set( pageOf( file ), { host, rel: rule[ 1 ] + pageOf( file ).slice( rule[ 0 ].length ) } );
			}
		}
	}
	for ( const key of keys ) {
		if ( ! pages.has( rootOf( nav, key ).href ) ) {
			throw new Error( `no ${ rootOf( nav, key ).href }index.html in ${ out }` );
		}
	}

	// A path on the site, as the host that now serves it has it, or null if neither does.
	const moves = ( rel ) => {
		const bare = rel.replace( /[?#].*$/, '' );
		const tail = rel.slice( bare.length );
		if ( pages.has( bare ) ) {
			const p = pages.get( bare );
			return { host: p.host, rel: p.rel + tail };
		}
		// Anything else under a moved folder goes with it; web/ keeps its stylesheet.
		const rule = rules.find( ( [ from ] ) => from !== 'web/' && bare.startsWith( from ) );
		const host = rule && ownerOf( bare, nav );
		return host ? { host, rel: rule[ 1 ] + bare.slice( rule[ 0 ].length ) + tail } : null;
	};
	// The site's own files a page shows, such as a screenshot: copied to the host that shows it.
	const assets = Object.fromEntries( keys.map( ( k ) => [ k, new Set() ] ) );
	// A path on the site from a page on `from`: a page or file of either host, a shared file, a
	// picture the page shows, or back on the site.
	const place = ( rel, from ) => {
		const moved = moves( rel );
		if ( moved !== null ) {
			return moved;
		}
		const bare = rel.replace( /[?#].*$/, '' );
		const top = bare.split( '/' )[ 0 ];
		if ( SHARED.includes( top ) || rel.startsWith( 'web/web.css' ) ) {
			return { host: from, rel };
		}
		if (
			/\.[a-z0-9]+$/i.test( bare ) &&
			! bare.endsWith( '.html' ) &&
			files.includes( bare )
		) {
			assets[ from ].add( bare );
			return { host: from, rel };
		}
		return { host: null, rel };
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

	// Links to the site that neither host serves. riffpress.com isn't built from here, so only its
	// home, written out in full, is a page there to link to; anything else leads nowhere.
	const strays = [];
	for ( const key of keys ) {
		fs.rmSync( hosts[ key ].dir, { recursive: true, force: true } );
		fs.mkdirSync( hosts[ key ].dir, { recursive: true } );
	}
	for ( const file of files ) {
		const shared = SHARED.includes( file.split( '/' )[ 0 ] ) || file === 'web/web.css';
		const where = shared ? null : moves( file ) ?? ( file.startsWith( 'web/' ) ? { host: ownerOf( file, nav ), rel: file } : null );
		const targets = shared ? keys.map( ( k ) => ( { host: k, rel: file } ) ) : where && where.host ? [ where ] : [];
		for ( const target of targets ) {
			const to = path.join( hosts[ target.host ].dir, target.rel );
			fs.mkdirSync( path.dirname( to ), { recursive: true } );
			if ( ! file.endsWith( '.html' ) ) {
				fs.copyFileSync( path.join( out, file ), to );
				continue;
			}
			const page = pageOf( file );
			const at = pages.get( page )?.rel ?? page;
			const html = rewrite(
				fs.readFileSync( path.join( out, file ), 'utf8' ),
				( name, value ) =>
					each( name, value, ( u ) => {
						const rel = onSite( u, page );
						if ( rel === null ) {
							return u;
						}
						const there = place( rel, target.host );
						const absolute = /^[a-z]+:/i.test( u );
						if ( there.host === null ) {
							if ( ! absolute || there.rel !== '' ) {
								strays.push( `${ path.relative( process.cwd(), to ) }: ${ site + there.rel }` );
							}
							return site + there.rel;
						}
						// The other host is always written out in full.
						if ( absolute || there.host !== target.host ) {
							return hosts[ there.host ].url + there.rel;
						}
						return relative( at, there.rel );
					} )
			);
			fs.writeFileSync( to, html );
		}
	}

	for ( const key of keys ) {
		const { dir, url } = hosts[ key ];
		// What search reads: every page's title, door, summary and headings.
		fs.writeFileSync( path.join( dir, 'search.json' ), JSON.stringify( searchIndex( dir, nav ) ) );
		fs.writeFileSync( path.join( dir, 'robots.txt' ), `User-agent: *\nAllow: /\nSitemap: ${ url }sitemap.xml\n` );
		for ( const file of assets[ key ] ) {
			fs.mkdirSync( path.dirname( path.join( dir, file ) ), { recursive: true } );
			fs.copyFileSync( path.join( out, file ), path.join( dir, file ) );
		}
		// As the site caches them: stamped by commit, so kept for good; the pages are fetched fresh.
		// X-Riff-Site names the build, so a deploy can tell which one a host is serving.
		fs.writeFileSync(
			path.join( dir, '_headers' ),
			`/*\n  X-Riff-Site: ${ key }\n` +
				[ '/:name.css', '/web/web.css', '/fonts/*' ]
					.map( ( p ) => `${ p }\n  Cache-Control: public, max-age=31536000, immutable\n` )
					.join( '' ) +
				'/index.html\n  Cache-Control: no-cache\n'
		);
	}

	// The sitemaps: each host's pages, at their new addresses.
	const map = path.join( out, 'sitemap.xml' );
	if ( fs.existsSync( map ) ) {
		const xml = fs.readFileSync( map, 'utf8' );
		const urls = xml.match( /^\s*<url>.*<\/url>\n/gm ) || [];
		const give = Object.fromEntries( keys.map( ( k ) => [ k, [] ] ) );
		for ( const entry of urls ) {
			const loc = entry.match( /<loc>([^<]*)<\/loc>/ )[ 1 ];
			const there = loc.startsWith( site ) ? moves( loc.slice( site.length ) ) : null;
			if ( there !== null ) {
				give[ there.host ].push( entry.replace( loc, hosts[ there.host ].url + there.rel ) );
			}
		}
		const [ open ] = xml.split( urls[ 0 ] );
		for ( const key of keys ) {
			fs.writeFileSync( path.join( hosts[ key ].dir, 'sitemap.xml' ), open + give[ key ].join( '' ) + '</urlset>\n' );
		}
	}
	// Each host's 404, whose links are all absolute, serves for a miss anywhere on the host: Source's
	// is 404.html, another host's 404-<host>.html where it has one of its own.
	for ( const key of keys ) {
		const own = path.join( out, `404-${ key }.html` );
		const from = fs.existsSync( own ) ? own : path.join( out, '404.html' );
		if ( ! fs.existsSync( from ) ) {
			continue;
		}
		const html = rewrite( fs.readFileSync( from, 'utf8' ), ( name, value ) =>
			each( name, value, ( u ) => {
				const rel = onSite( u, '' );
				const there = rel === null ? null : place( rel, key );
				return there?.host ? hosts[ there.host ].url + there.rel : u;
			} )
		);
		fs.writeFileSync( path.join( hosts[ key ].dir, '404.html' ), html );
	}

	// The redirects. Before the split one host served every page at the paths legacy() gives, so an
	// address a host no longer serves goes, for good, to where the other host serves it now. A
	// folder that moves whole is one rule for everything under it; a page that moves to another path
	// on the other host (Build on Riff, to its root) is a rule of its own.
	const redirects = Object.fromEntries( keys.map( ( k ) => [ k, [] ] ) );
	const folders = Object.fromEntries( keys.map( ( k ) => [ k, new Map() ] ) );
	for ( const [ page, { host, rel } ] of pages ) {
		const old = legacy( page );
		const top = old && old.split( '/' )[ 0 ];
		// A page now at another path on its own host still answers at the old one.
		if ( old && old !== rel ) {
			redirects[ host ].push( [ `/${ old }`, hosts[ host ].url + rel ] );
		}
		for ( const other of keys.filter( ( k ) => k !== host ) ) {
			if ( old === null || old === '' ) {
				continue;
			}
			if ( old === rel && rel.includes( '/' ) ) {
				const f = folders[ other ].get( top ) || { host, pages: [] };
				f.pages.push( `/${ old }` );
				folders[ other ].set( top, f );
			} else {
				redirects[ other ].push( [ `/${ old }`, hosts[ host ].url + rel ] );
			}
		}
	}
	// What the workflow adds to Source beside the pages: the demo's files.
	for ( const key of keys.filter( ( k ) => k !== 'source' ) ) {
		for ( const name of DEMO ) {
			if ( name.endsWith( '/' ) ) {
				folders[ key ].set( name.slice( 0, -1 ), { host: 'source', pages: [] } );
			} else {
				redirects[ key ].push( [ `/${ name }`, hosts.source.url + name ] );
			}
		}
	}
	for ( const key of keys ) {
		const lines = [];
		for ( const [ top, { host, pages: list } ] of [ ...folders[ key ] ].sort() ) {
			// A folder the host still serves a file in, as web/ its stylesheet, goes page by page.
			if ( fs.existsSync( path.join( hosts[ key ].dir, top ) ) ) {
				redirects[ key ].push( ...list.map( ( from ) => [ from, hosts[ host ].url + from.slice( 1 ) ] ) );
				continue;
			}
			lines.push( `/${ top } ${ hosts[ host ].url }${ top }/ 301`, `/${ top }/* ${ hosts[ host ].url }${ top }/:splat 301` );
		}
		for ( const [ from, to ] of redirects[ key ].sort() ) {
			lines.push( `${ from } ${ to } 301` );
			if ( from.endsWith( '/' ) ) {
				lines.push( `${ from.slice( 0, -1 ) } ${ to } 301` );
			}
		}
		redirects[ key ] = lines;
		fs.writeFileSync( path.join( hosts[ key ].dir, '_redirects' ), lines.join( '\n' ) + '\n' );
	}

	const moved = Object.fromEntries( keys.map( ( k ) => [ k, [ ...pages ].filter( ( [ , p ] ) => p.host === k ).map( ( [ page ] ) => page ) ] ) );
	return {
		moved,
		redirects,
		problems: [
			...new Set( strays ),
			...check( { hosts: keys.map( ( k ) => [ hosts[ k ].url, hosts[ k ].dir ] ) } ),
			...checkRedirects( { hosts, redirects } ),
		],
	};
}

/**
 * Every redirect that leads nowhere: one whose target is not a page or folder on the host it names.
 *
 * @param {Object} o           Options.
 * @param {Object} o.hosts     As split() takes them.
 * @param {Object} o.redirects Each host's _redirects lines.
 * @return {string[]} Problems.
 */
function checkRedirects( { hosts, redirects } ) {
	const problems = [];
	for ( const [ key, lines ] of Object.entries( redirects ) ) {
		for ( const line of lines ) {
			const to = line.split( ' ' )[ 1 ].replace( /:splat$/, '' );
			const home = Object.values( hosts ).find( ( h ) => to.startsWith( h.url ) );
			const rel = home ? to.slice( home.url.length ) : null;
			if ( rel === null || ! fs.existsSync( path.join( home.dir, rel ) ) ) {
				// The demo's files are put beside the pages after the split.
				if ( ! DEMO.some( ( d ) => rel === d ) ) {
					problems.push( `${ key }/_redirects: ${ line }` );
				}
			}
		}
	}
	return problems;
}

/**
 * The search index for a host: for each page, its address from the host's root, its title, the
 * door it is in, its summary, and each heading with an id, so a result can lead to the section.
 * Entities are decoded and tags dropped; nothing else is kept, so the file stays small.
 *
 * @param {string} dev A host, as written.
 * @param {Object} nav The definition, for the hosts' names.
 * @return {Array} [ { u, t, d, s, h: [ [ id, text ] ] } ].
 */
function searchIndex( dev, nav = NAV ) {
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
	// The page's own title, less its host's name: " | Riff Source".
	const names = new RegExp( ` \\| (?:${ Object.values( nav.hosts ).join( '|' ) })$` );
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
			t: title ? text( title[ 1 ] ).replace( names, '' ) : '',
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
 * Every link on the hosts that leads nowhere: a page or file that is not there, or a fragment no
 * element on its page carries, on the page's own host or, written out in full, on the other. Pages
 * are read for their links, stylesheets for their url()s and modules for their relative imports,
 * so a shared file left behind fails too. Links off both hosts are left alone.
 *
 * @param {Object} o       Options.
 * @param {Array}  o.hosts [ address, folder ] for each host.
 * @return {string[]} Problems, as "file: url".
 */
function check( { hosts } ) {
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

module.exports = { searchIndex, split, check, relative, ownerOf, MOVED, DEMO };

if ( require.main === module ) {
	const [ out, sourceDir, developerDir, site, source, developer ] = process.argv.slice( 2 );
	const address = /^https?:\/\/[a-z0-9.-]+(:[0-9]+)?\/([^\s?#]*\/)?$/;
	if (
		! out ||
		! sourceDir ||
		! developerDir ||
		sourceDir === developerDir ||
		! [ site, source, developer ].every( ( a ) => address.test( a || '' ) ) ||
		new Set( [ site, source, developer ] ).size !== 3
	) {
		process.stderr.write(
			'Usage: developers-site.js <out> <source-out> <developer-out> <site-url/> <source-url/> <developer-url/>\n'
		);
		process.exit( 1 );
	}
	const { moved, problems } = split( {
		out,
		site,
		hosts: {
			source: { dir: sourceDir, url: source },
			developer: { dir: developerDir, url: developer },
		},
	} );
	if ( problems.length ) {
		process.stderr.write(
			`${ problems.length } link(s) lead nowhere:\n${ problems.map( ( p ) => `  ${ p }\n` ).join( '' ) }`
		);
		process.exit( 1 );
	}
	process.stdout.write(
		`${ moved.source.length } pages on ${ source } and ${ moved.developer.length } on ${ developer }; every link on them resolves\n`
	);
}
