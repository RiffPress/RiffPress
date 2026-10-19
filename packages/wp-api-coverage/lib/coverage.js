/**
 * Matches a plugin scan against the catalog and groups the result by area.
 */
const path = require( 'node:path' );
const { scanPlugin } = require( './scan.js' );
const { hookShape } = require( './php.js' );

const DEFAULT_CATALOG = path.join( __dirname, '..', 'catalog', 'wordpress.json' );
const REFERENCE = 'https://developer.wordpress.org/reference/';
const PACKAGES = 'https://developer.wordpress.org/block-editor/reference-guides/packages/packages-';
const SUPPORTS = 'https://developer.wordpress.org/block-editor/reference-guides/block-api/block-supports/#';

// The code reference's slug for a hook: `save_post_{$post->post_type}` is save_post_post-post_type.
const hookSlug = ( name ) => name.toLowerCase().replace( /->/g, '-' ).replace( /[{}$'"[\]]/g, '' );

function url( kind, name ) {
	switch ( kind ) {
		case 'function':
			return `${ REFERENCE }functions/${ name.toLowerCase() }/`;
		case 'class':
			return `${ REFERENCE }classes/${ name.toLowerCase() }/`;
		case 'action':
		case 'filter':
			return `${ REFERENCE }hooks/${ hookSlug( name ) }/`;
		case 'package':
		case 'module':
			return `${ PACKAGES }${ name.split( '/' )[ 1 ] }/`;
		case 'support':
			return `${ SUPPORTS }${ name.split( '.' )[ 0 ].toLowerCase() }`;
	}
	return null;
}

// A release as one sortable number: 7.1 is 701, and 0.71, the first release, is 71.
const release = ( since ) => {
	const m = /^(\d+)\.(\d+)/.exec( since || '' );
	return m ? Number( m[ 1 ] ) * 100 + Number( m[ 2 ] ) : 0;
};

/**
 * Turns a dynamic hook name from the catalog into a pattern a concrete name can be tested against,
 * or null when the name has too little literal text to be told apart from any other hook.
 *
 * @param {string} name A catalog hook name, like `save_post_{$post->post_type}`.
 * @return {RegExp|null} The pattern.
 */
function hookPattern( name ) {
	const parts = name.split( /\{[^}]*\}/ );
	if ( parts.join( '' ).replace( /[_-]/g, '' ).length < 3 ) {
		return null;
	}
	return new RegExp( '^' + parts.map( ( p ) => p.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' ) ).join( '.+' ) + '$' );
}

function hookIndex( hooks ) {
	const exact = new Map();
	const shapes = new Map();
	const patterns = [];
	for ( const hook of hooks ) {
		exact.set( hook.name, hook );
		if ( hook.name.includes( '{' ) ) {
			shapes.set( hookShape( hook.name ), hook );
			const re = hookPattern( hook.name );
			if ( re ) {
				patterns.push( [ re, hook, hook.name.replace( /\{[^}]*\}/g, '' ).length ] );
			}
		}
	}
	// The most specific pattern wins: rest_prepare_{$post_type} over rest_{$x}.
	patterns.sort( ( a, b ) => b[ 2 ] - a[ 2 ] );
	return ( name ) => {
		if ( exact.has( name ) ) {
			return exact.get( name );
		}
		if ( name.includes( '{' ) ) {
			return shapes.get( hookShape( name ) ) || null;
		}
		const hit = patterns.find( ( [ re ] ) => re.test( name ) );
		return hit ? hit[ 1 ] : null;
	};
}

/**
 * Builds the coverage report for a plugin folder.
 *
 * @param {string} dir               The plugin folder.
 * @param {Object} [options]
 * @param {Object} [options.catalog] A catalog object; defaults to the bundled one.
 * @param {Array}  [options.ignore]  Folder names to skip.
 * @return {Object} The report: the WordPress version, what was scanned, and one entry per area.
 */
function coverage( dir, options = {} ) {
	const catalog = options.catalog || require( DEFAULT_CATALOG );
	const scan = scanPlugin( dir, options );
	const { found } = scan;

	const used = new Map(); // catalog entry → use
	const mark = ( entry, kind, use ) => {
		if ( ! entry ) {
			return;
		}
		const had = used.get( entry );
		if ( had ) {
			had.count += use.count;
		} else {
			used.set( entry, { kind, count: use.count, at: use.at } );
		}
	};

	const functions = new Map( catalog.functions.map( ( f ) => [ f.name.toLowerCase(), f ] ) );
	const classes = new Map( catalog.classes.map( ( c ) => [ c.name.toLowerCase(), c ] ) );
	for ( const [ name, use ] of found.functions.map ) {
		mark( functions.get( name ), 'function', use );
	}
	for ( const [ name, use ] of found.classes.map ) {
		mark( classes.get( name ), 'class', use );
	}
	const findHook = hookIndex( catalog.hooks );
	for ( const [ name, use ] of found.hooks.map ) {
		const hook = findHook( name );
		mark( hook, hook && hook.type, use );
	}

	const byPackage = new Map( catalog.packages.map( ( p ) => [ p.name, p ] ) );
	const byHandle = new Map( catalog.packages.map( ( p ) => [ p.handle, p ] ) );
	const byGlobal = new Map( catalog.packages.map( ( p ) => [ p.global, p ] ) );
	const modules = new Map( catalog.modules.map( ( m ) => [ m.name, m ] ) );
	for ( const [ name, use ] of found.handles.map ) {
		mark( byHandle.get( name ), 'package', use );
	}
	for ( const [ name, use ] of found.globals.map ) {
		mark( byGlobal.get( name ), 'package', use );
	}
	for ( const source of [ found.imports, found.modules ] ) {
		for ( const [ name, use ] of source.map ) {
			if ( modules.has( name ) ) {
				mark( modules.get( name ), 'module', use );
			} else {
				mark( byPackage.get( name.split( '/' ).slice( 0, 2 ).join( '/' ) ), 'package', use );
			}
		}
	}
	const supports = new Map( catalog.supports.map( ( s ) => [ s.name, s ] ) );
	for ( const [ name, use ] of found.supports.map ) {
		mark( supports.get( name ), 'support', use );
	}

	// Every entry, with its kind, so used and unused can be laid side by side.
	const entries = [
		...catalog.functions.map( ( e ) => [ e, 'function' ] ),
		...catalog.classes.map( ( e ) => [ e, 'class' ] ),
		...catalog.hooks.map( ( e ) => [ e, e.type ] ),
		...catalog.packages.map( ( e ) => [ e, 'package' ] ),
		...catalog.modules.map( ( e ) => [ e, 'module' ] ),
		...catalog.supports.map( ( e ) => [ e, 'support' ] ),
	];
	const usedFiles = new Set( [ ...used.keys() ].map( ( e ) => e.file ).filter( Boolean ) );
	// How many releases ago each version was, counting only versions that added something.
	const releases = [ ...new Set( entries.map( ( [ e ] ) => release( e.since ) ).filter( Boolean ) ) ].sort( ( a, b ) => b - a );
	const ago = ( since ) => releases.indexOf( release( since ) );
	const areas = new Map();
	const deprecated = [];
	const internal = [];
	for ( const [ entry, kind ] of entries ) {
		if ( ! areas.has( entry.area ) ) {
			areas.set( entry.area, { area: entry.area, used: [], unused: [] } );
		}
		const group = areas.get( entry.area );
		const use = used.get( entry );
		const item = { kind, name: entry.name };
		if ( entry.since ) {
			item.since = entry.since;
		}
		if ( entry.file ) {
			item.file = entry.file;
		}
		item.url = url( kind, entry.name );
		if ( use ) {
			item.uses = use.count;
			item.at = use.at;
			if ( entry.deprecated ) {
				deprecated.push( item );
			} else if ( entry.private ) {
				internal.push( item );
			}
			group.used.push( item );
		} else if ( ! entry.private && ! entry.deprecated ) {
			// What the plugin has not touched, newest first, and among those what sits in a file it already calls into.
			const age = entry.since ? ago( entry.since ) : -1;
			let fresh = 0;
			if ( age >= 0 && age <= 2 ) {
				fresh = 2;
			} else if ( age > 2 && age <= 5 ) {
				fresh = 1;
			}
			item.score = fresh * 2 + ( usedFiles.has( entry.file ) ? 1 : 0 );
			group.unused.push( item );
		}
	}
	const list = [ ...areas.values() ].map( ( g ) => {
		g.used.sort( ( a, b ) => b.uses - a.uses || a.name.localeCompare( b.name ) );
		g.unused.sort( ( a, b ) => b.score - a.score || release( b.since ) - release( a.since ) || a.name.localeCompare( b.name ) );
		const available = g.used.length + g.unused.length;
		return {
			area: g.area,
			usedCount: g.used.length,
			available,
			coverage: available ? Math.round( ( g.used.length / available ) * 1000 ) / 10 : 0,
			used: g.used,
			unused: g.unused,
		};
	} );
	list.sort( ( a, b ) => b.usedCount - a.usedCount || b.available - a.available || a.area.localeCompare( b.area ) );
	const total = list.reduce( ( n, a ) => n + a.available, 0 );
	const usedTotal = list.reduce( ( n, a ) => n + a.usedCount, 0 );
	return {
		plugin: path.basename( scan.root ),
		wordpress: catalog.wordpress,
		scanned: scan.files,
		summary: { used: usedTotal, available: total, coverage: total ? Math.round( ( usedTotal / total ) * 1000 ) / 10 : 0 },
		deprecated,
		internal,
		areas: list,
	};
}

module.exports = { coverage, hookPattern, hookSlug, url };
