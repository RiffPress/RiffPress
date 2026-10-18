#!/usr/bin/env node
/**
 * Checks a catalogue measurement (packages/benchmarks/catalog.php measure) against the budget in
 * packages/benchmarks/budget.json, and prints a table of both. Exits non-zero when a request goes
 * over its query budget or its time ceiling, or a budgeted request is missing.
 *
 * Usage: node .github/scripts/size-budget.js <measurement.json>
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );

const BUDGET = path.resolve( __dirname, '..', '..', 'packages', 'benchmarks', 'budget.json' );

/**
 * What went over, request by request.
 *
 * @param {Object} measured The measurement.
 * @param {Object} budget   The budget.
 * @return {string[]} Problems, empty when everything is within budget.
 */
function overBudget( measured, budget ) {
	const problems = [];
	if ( measured.tracks < budget.tracks ) {
		problems.push( `measured ${ measured.tracks } tracks, the budget is for ${ budget.tracks }` );
	}
	for ( const [ name, limit ] of Object.entries( budget.cases ) ) {
		const got = measured.cases?.[ name ];
		if ( ! got ) {
			problems.push( `${ name }: not measured` );
			continue;
		}
		if ( got.status !== 200 ) {
			problems.push( `${ name }: answered ${ got.status }` );
		}
		if ( got.queries > limit.queries ) {
			problems.push( `${ name }: ${ got.queries } queries, budget ${ limit.queries }` );
		}
		if ( got.ms > limit.ms ) {
			problems.push( `${ name }: ${ got.ms } ms, ceiling ${ limit.ms }` );
		}
	}
	return problems;
}

/**
 * A Markdown table of the measurement beside the budget.
 *
 * @param {Object} measured The measurement.
 * @param {Object} budget   The budget.
 * @return {string} Markdown.
 */
function table( measured, budget ) {
	const rows = Object.entries( budget.cases ).map( ( [ name, limit ] ) => {
		const got = measured.cases?.[ name ] || {};
		return `| ${ name } | ${ got.ms ?? '–' } ms | ${ limit.ms } ms | ${ got.queries ?? '–' } | ${ limit.queries } |`;
	} );
	return [ `${ measured.database }, ${ measured.tracks } tracks`, '', '| Request | Time | Ceiling | Queries | Budget |', '| --- | --- | --- | --- | --- |', ...rows ].join( '\n' );
}

if ( require.main === module ) {
	const measured = JSON.parse( fs.readFileSync( process.argv[ 2 ], 'utf8' ) );
	const budget = JSON.parse( fs.readFileSync( BUDGET, 'utf8' ) );
	process.stdout.write( table( measured, budget ) + '\n\n' );
	const problems = overBudget( measured, budget );
	for ( const p of problems ) {
		process.stdout.write( `::error::${ p }\n` );
	}
	process.exitCode = problems.length ? 1 : 0;
}

module.exports = { overBudget, table };
