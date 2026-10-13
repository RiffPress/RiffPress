#!/usr/bin/env node
/**
 * Writes docs/hooks.md from the plugin's own docblocks: every apply_filters() and do_action() in
 * plugins/riff that has a docblock (one starting "Filters" or "Fires") above it, with its @since,
 * its parameters, and where it fires. Run `npm run docs:hooks`; CI checks the file is current.
 *
 * Usage: node .github/scripts/hooks-reference.js [--check]
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );

const ROOT = path.resolve( __dirname, '..', '..' );
const PLUGIN = path.join( ROOT, 'plugins', 'riff' );
const OUT = path.join( ROOT, 'docs', 'hooks.md' );

function phpFiles( dir ) {
	const out = [];
	for ( const entry of fs.readdirSync( dir, { withFileTypes: true } ) ) {
		if ( entry.name === 'tests' || entry.name === 'node_modules' ) {
			continue;
		}
		const full = path.join( dir, entry.name );
		if ( entry.isDirectory() ) {
			out.push( ...phpFiles( full ) );
		} else if ( entry.name.endsWith( '.php' ) ) {
			out.push( full );
		}
	}
	return out.sort();
}

/**
 * Finds hooks in one file: a docblock immediately above a line that fires the hook.
 *
 * @param {string} file Absolute path.
 * @return {Array} Hooks found.
 */
function hooksIn( file ) {
	const src = fs.readFileSync( file, 'utf8' );
	const lines = src.split( '\n' );
	const found = [];
	const re = /(apply_filters|do_action|apply_filters_deprecated|do_action_deprecated)\(\s*'([a-z0-9_]+)'/;
	for ( let i = 0; i < lines.length; i++ ) {
		const m = re.exec( lines[ i ] );
		if ( ! m ) {
			continue;
		}
		// Walk up over the statement's own lines to the closing of a docblock.
		let j = i;
		while ( j > 0 && ! /\*\/\s*$/.test( lines[ j - 1 ] ) && j > i - 6 ) {
			j--;
		}
		let block = null;
		if ( j > 0 && /\*\/\s*$/.test( lines[ j - 1 ] ) ) {
			let k = j - 1;
			while ( k >= 0 && ! /\/\*\*/.test( lines[ k ] ) ) {
				k--;
			}
			block = lines.slice( k, j ).join( '\n' );
		}
		found.push( {
			name: m[ 2 ],
			type: m[ 1 ].startsWith( 'do_action' ) ? 'action' : 'filter',
			deprecated: m[ 1 ].endsWith( '_deprecated' ),
			file: path.relative( ROOT, file ),
			line: i + 1,
			...parse( block ),
		} );
	}
	return found;
}

/**
 * Pulls the summary, @since and @param lines out of a docblock.
 *
 * @param {string|null} block Docblock text.
 * @return {Object} Parsed fields.
 */
function parse( block ) {
	if ( ! block ) {
		return { summary: '', since: '', params: [], documented: false };
	}
	const text = block
		.split( '\n' )
		.map( ( l ) => l.replace( /^\s*\/?\*+\/?\s?/, '' ).replace( /\s*\*\/$/, '' ) )
		.filter( ( l, idx, arr ) => ! ( idx === arr.length - 1 && l.trim() === '' ) );
	const summary = [];
	const params = [];
	let since = '';
	for ( const line of text ) {
		const p = /^@param\s+(\S+)\s+(\$\S+)\s*(.*)$/.exec( line.trim() );
		if ( p ) {
			params.push( { type: p[ 1 ], name: p[ 2 ], description: p[ 3 ] } );
			continue;
		}
		const s = /^@since\s+(\S+)/.exec( line.trim() );
		if ( s ) {
			since = s[ 1 ];
			continue;
		}
		if ( ! line.trim().startsWith( '@' ) && params.length === 0 ) {
			summary.push( line.trim() );
		}
	}
	return {
		summary: summary.join( ' ' ).replace( /\s+/g, ' ' ).trim(),
		since,
		params,
		documented: true,
	};
}

function render( hooks ) {
	const byType = ( type ) => hooks.filter( ( h ) => h.type === type ).sort( ( a, b ) => a.name.localeCompare( b.name ) );
	const section = ( title, list, verb ) => {
		if ( ! list.length ) {
			return '';
		}
		let out = `## ${ title }\n\n`;
		for ( const h of list ) {
			out += `### \`${ h.name }\`\n\n`;
			if ( h.deprecated ) {
				out += 'Deprecated.\n\n';
			}
			out += `${ h.summary || `${ verb } without a docblock: add one.` }\n\n`;
			if ( h.since ) {
				out += `Since ${ h.since }. `;
			}
			out += `Fires in \`${ h.file }\` at line ${ h.line }.\n\n`;
			if ( h.params.length ) {
				out += '| Parameter | Type | Description |\n| --- | --- | --- |\n';
				for ( const p of h.params ) {
					out += `| \`${ p.name }\` | \`${ p.type }\` | ${ p.description } |\n`;
				}
				out += '\n';
			}
		}
		return out;
	};
	return (
		'# Hooks\n\n' +
		'Every filter and action Riff fires, generated from the docblocks in the plugin by `npm run docs:hooks`. ' +
		'Do not edit by hand. The stability promise is in the readme: a hook listed here keeps its name and parameters ' +
		'within a major version, and goes through a deprecated release before it is removed.\n\n' +
		section( 'Filters', byType( 'filter' ), 'Filters' ) +
		section( 'Actions', byType( 'action' ), 'Fires' )
	);
}

function main() {
	const hooks = phpFiles( PLUGIN ).flatMap( hooksIn );
	const markdown = render( hooks );
	if ( process.argv.includes( '--check' ) ) {
		const current = fs.existsSync( OUT ) ? fs.readFileSync( OUT, 'utf8' ) : '';
		if ( current !== markdown ) {
			console.error( 'docs/hooks.md is out of date: run npm run docs:hooks' );
			process.exit( 1 );
		}
		const undocumented = hooks.filter( ( h ) => ! h.documented || ! h.since );
		if ( undocumented.length ) {
			console.error( 'Hooks without a docblock or @since: ' + undocumented.map( ( h ) => h.name ).join( ', ' ) );
			process.exit( 1 );
		}
		console.log( `docs/hooks.md is current (${ hooks.length } hooks)` );
		return;
	}
	fs.mkdirSync( path.dirname( OUT ), { recursive: true } );
	fs.writeFileSync( OUT, markdown );
	console.log( `Wrote docs/hooks.md (${ hooks.length } hooks)` );
}

if ( require.main === module ) {
	main();
}

module.exports = { hooksIn, parse, render };
