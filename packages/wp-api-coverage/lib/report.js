/**
 * The coverage report as plain text, for a terminal or a CI log.
 */

const pad = ( s, n ) => String( s ).padEnd( n );
const lpad = ( s, n ) => String( s ).padStart( n );

function label( item ) {
	const since = item.since ? `, since ${ item.since }` : '';
	return `${ item.name } (${ item.kind }${ since })`;
}

/**
 * Formats a report from coverage().
 *
 * @param {Object}   report              The report.
 * @param {Object}   [options]
 * @param {number}   [options.limit]     How many unused APIs to list per area. Defaults to 5.
 * @param {string[]} [options.areas]     Only these areas, by name, case-insensitive.
 * @param {boolean}  [options.untouched] Also list the areas the plugin does not use at all.
 * @return {string} The text.
 */
function formatText( report, options = {} ) {
	const limit = options.limit ?? 5;
	const only = options.areas && options.areas.length ? options.areas.map( ( a ) => a.toLowerCase() ) : null;
	const areas = report.areas.filter( ( a ) => ! only || only.includes( a.area.toLowerCase() ) );
	const lines = [];
	const s = report.scanned;
	lines.push( `WordPress API coverage for ${ report.plugin }, against WordPress ${ report.wordpress }` );
	lines.push( `Scanned ${ s.php } PHP files, ${ s.js } JavaScript files and ${ s.blockJson } block.json files.` );
	lines.push( `Uses ${ report.summary.used } of ${ report.summary.available } public APIs (${ report.summary.coverage }%).` );
	lines.push( '' );
	const width = Math.max( 4, ...areas.map( ( a ) => a.area.length ) ) + 2;
	lines.push( `${ pad( 'Area', width ) }${ lpad( 'Used', 6 ) }${ lpad( 'Available', 11 ) }${ lpad( 'Coverage', 10 ) }` );
	for ( const a of areas ) {
		lines.push( `${ pad( a.area, width ) }${ lpad( a.usedCount, 6 ) }${ lpad( a.available, 11 ) }${ lpad( a.coverage + '%', 10 ) }` );
	}
	for ( const [ list, heading ] of [
		[ report.deprecated, 'Deprecated APIs still in use:' ],
		[ report.internal, 'Private APIs in use (core marks these private or prefixes them with an underscore):' ],
	] ) {
		if ( list && list.length ) {
			lines.push( '' );
			lines.push( heading );
			for ( const item of list ) {
				lines.push( `  ${ label( item ) } at ${ item.at }` );
			}
		}
	}
	for ( const a of areas ) {
		if ( ! a.usedCount && ! options.untouched && ! only ) {
			continue;
		}
		lines.push( '' );
		lines.push( `${ a.area }: ${ a.usedCount } of ${ a.available } used` );
		if ( a.usedCount ) {
			// wp_head is a function and an action; say which when a name appears twice.
			const seen = new Map();
			for ( const i of a.used ) {
				seen.set( i.name, ( seen.get( i.name ) || 0 ) + 1 );
			}
			lines.push( `  Used: ${ a.used.map( ( i ) => ( seen.get( i.name ) > 1 ? `${ i.name } (${ i.kind })` : i.name ) ).join( ', ' ) }` );
		}
		const next = a.unused.slice( 0, limit );
		if ( next.length ) {
			lines.push( '  Not used yet:' );
			for ( const item of next ) {
				lines.push( `    ${ label( item ) } ${ item.url }` );
			}
		}
	}
	const untouched = areas.filter( ( a ) => ! a.usedCount );
	if ( untouched.length && ! options.untouched && ! only ) {
		lines.push( '' );
		lines.push( `Not touched at all: ${ untouched.map( ( a ) => `${ a.area } (${ a.available })` ).join( ', ' ) }.` );
		lines.push( 'Run with --all to list what each of these offers.' );
	}
	return lines.join( '\n' ) + '\n';
}

module.exports = { formatText };
