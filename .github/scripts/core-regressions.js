#!/usr/bin/env node
/**
 * Files an issue for each test that fails on WordPress trunk but passes on the current release:
 * the signal that a change in core broke something Riff relies on. Run by the nightly workflow
 * after both suites, with each one's results in its own folder.
 *
 * A test that fails again adds a comment to its open issue instead of opening another, and the
 * issue closes itself once the test passes on trunk. A test that fails on the release too is
 * Riff's own failure, not core's, and never opens an issue. Nothing is closed on a night when the
 * trunk suite produced no results, since that says nothing about any one test.
 *
 * Usage: node .github/scripts/core-regressions.js <trunk-dir> <release-dir> [--dry-run]
 * Each folder may hold e2e.json (Playwright's JSON reporter), phpunit.xml (JUnit) and core.txt
 * (the WordPress version the suite ran on). Needs GH_TOKEN and GITHUB_REPOSITORY unless --dry-run.
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );
const crypto = require( 'node:crypto' );
const { execFileSync } = require( 'node:child_process' );

const LABEL = 'core-regression';
const MARKER = /<!-- riff-core-regression: ([0-9a-f]{12}) -->/;

/**
 * A short, stable id for a test, kept in its issue so the next night finds it.
 *
 * @param {string} name The test's full name.
 * @return {string} Twelve hex characters.
 */
function testId( name ) {
	return crypto.createHash( 'sha1' ).update( name ).digest( 'hex' ).slice( 0, 12 );
}

/**
 * The first line of an error, without terminal colours.
 *
 * @param {string} message Error text.
 * @return {string} One line.
 */
function firstLine( message ) {
	return String( message || '' ).replace( /\u001b\[[0-9;]*m/g, '' ).split( '\n' ).find( ( l ) => l.trim() ) || '';
}

/**
 * Every test in a Playwright JSON report, with whether it failed.
 *
 * @param {Object} report Playwright's JSON report.
 * @return {Map<string, {name: string, failed: boolean, message: string}>} Keyed by test id.
 */
function playwrightResults( report ) {
	const out = new Map();
	const walk = ( suite, trail ) => {
		const here = suite.title && ! suite.title.endsWith( '.js' ) ? [ ...trail, suite.title ] : trail;
		for ( const spec of suite.specs || [] ) {
			for ( const t of spec.tests || [] ) {
				if ( t.status === 'skipped' ) {
					continue;
				}
				const name = `e2e › ${ spec.file } › ${ [ ...here, spec.title ].join( ' › ' ) } [${ t.projectName }]`;
				const last = ( t.results || [] ).at( -1 ) || {};
				out.set( testId( name ), {
					name,
					failed: t.status === 'unexpected',
					message: firstLine( last.error?.message || last.errors?.[ 0 ]?.message ),
				} );
			}
		}
		for ( const child of suite.suites || [] ) {
			walk( child, here );
		}
	};
	for ( const suite of report?.suites || [] ) {
		walk( suite, [] );
	}
	return out;
}

/**
 * Every test case in a JUnit XML file, with whether it failed.
 *
 * @param {string} xml JUnit XML, as PHPUnit's --log-junit writes it.
 * @return {Map<string, {name: string, failed: boolean, message: string}>} Keyed by test id.
 */
function junitResults( xml ) {
	const out = new Map();
	const decode = ( s ) => s.replace( /&quot;/g, '"' ).replace( /&apos;/g, "'" ).replace( /&lt;/g, '<' ).replace( /&gt;/g, '>' ).replace( /&amp;/g, '&' );
	const cases = String( xml || '' ).matchAll( /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g );
	for ( const [ , attrs, , body = '' ] of cases ) {
		const attr = ( key ) => decode( ( attrs.match( new RegExp( `\\b${ key }="([^"]*)"` ) ) || [] )[ 1 ] || '' );
		if ( /<skipped\b/.test( body ) ) {
			continue;
		}
		const name = `phpunit › ${ attr( 'class' ) }::${ attr( 'name' ) }`;
		const failure = body.match( /<(failure|error)\b[^>]*>([\s\S]*?)<\/\1>/ );
		out.set( testId( name ), {
			name,
			failed: !! failure,
			message: failure ? firstLine( decode( failure[ 2 ] ) ) : '',
		} );
	}
	return out;
}

/**
 * One suite's results from its folder.
 *
 * @param {string} dir Folder with e2e.json, phpunit.xml and core.txt, any of which may be missing.
 * @return {{tests: Map, core: string}} Results by test id, and the WordPress version.
 */
function readResults( dir ) {
	const read = ( file ) => {
		try {
			return fs.readFileSync( path.join( dir, file ), 'utf8' );
		} catch {
			return '';
		}
	};
	const tests = new Map();
	const e2e = read( 'e2e.json' );
	if ( e2e ) {
		try {
			playwrightResults( JSON.parse( e2e ) ).forEach( ( v, k ) => tests.set( k, v ) );
		} catch {
			// A report cut short by a crash says nothing about any one test.
		}
	}
	junitResults( read( 'phpunit.xml' ) ).forEach( ( v, k ) => tests.set( k, v ) );
	return { tests, core: read( 'core.txt' ).trim() };
}

/**
 * What to do with the issue tracker, from both suites' results and the open issues.
 *
 * @param {{tests: Map, core: string}}            trunk   Trunk's results.
 * @param {{tests: Map, core: string}}            release The release's results.
 * @param {Array<{number: number, body: string}>} open    Open core-regression issues.
 * @return {{create: Array, comment: Array, close: Array}} The actions, each with what it needs.
 */
function plan( trunk, release, open ) {
	const byId = new Map();
	for ( const issue of open ) {
		const id = ( issue.body.match( MARKER ) || [] )[ 1 ];
		if ( id ) {
			byId.set( id, issue );
		}
	}
	const actions = { create: [], comment: [], close: [] };
	for ( const [ id, t ] of trunk.tests ) {
		const there = release.tests.get( id );
		// Only a test that ran on the release and passed there points at core.
		const regression = t.failed && there && ! there.failed;
		const issue = byId.get( id );
		if ( regression && issue ) {
			actions.comment.push( { number: issue.number, test: t } );
		} else if ( regression ) {
			actions.create.push( { id, test: t } );
		} else if ( issue && ! t.failed ) {
			actions.close.push( { number: issue.number, test: t } );
		}
	}
	return actions;
}

/**
 * The issue body for a new regression.
 *
 * @param {string} id  Test id.
 * @param {Object} t   The test.
 * @param {Object} ctx { trunkCore, releaseCore, runUrl }.
 * @return {string} Markdown.
 */
function issueBody( id, t, ctx ) {
	return [
		`\`${ t.name }\` fails on WordPress trunk and passes on the current release, so a change in core is the likely cause.`,
		'',
		`- Trunk: ${ ctx.trunkCore || 'unknown' }, failing`,
		`- Release: ${ ctx.releaseCore || 'unknown' }, passing`,
		`- Run: ${ ctx.runUrl || 'local' }`,
		'',
		'```',
		t.message || '(no message)',
		'```',
		'',
		'Find the core change in the commits to trunk since the last night this passed, then decide whether Riff adapts or core gets a ticket. Record the outcome in `docs/native.md` when it touches something Riff fills in for core. This issue closes itself when the test passes on trunk again.',
		'',
		`<!-- riff-core-regression: ${ id } -->`,
	].join( '\n' );
}

function gh( args, input ) {
	return execFileSync( 'gh', args, { encoding: 'utf8', input } );
}

function main( argv ) {
	const [ trunkDir, releaseDir ] = argv.filter( ( a ) => ! a.startsWith( '--' ) );
	const dry = argv.includes( '--dry-run' );
	if ( ! trunkDir || ! releaseDir ) {
		throw new Error( 'usage: core-regressions.js <trunk-dir> <release-dir> [--dry-run]' );
	}
	const trunk = readResults( trunkDir );
	const release = readResults( releaseDir );
	if ( ! trunk.tests.size || ! release.tests.size ) {
		process.stdout.write( 'core-regressions: a suite produced no results; nothing filed or closed\n' );
		return;
	}
	const open = dry ? [] : JSON.parse( gh( [ 'issue', 'list', '--label', LABEL, '--state', 'open', '--limit', '200', '--json', 'number,body' ] ) );
	const actions = plan( trunk, release, open );
	const runUrl = process.env.GITHUB_RUN_ID ? `${ process.env.GITHUB_SERVER_URL }/${ process.env.GITHUB_REPOSITORY }/actions/runs/${ process.env.GITHUB_RUN_ID }` : '';
	const ctx = { trunkCore: trunk.core, releaseCore: release.core, runUrl };
	process.stdout.write( `core-regressions: ${ actions.create.length } new, ${ actions.comment.length } still failing, ${ actions.close.length } fixed\n` );
	if ( dry ) {
		process.stdout.write( JSON.stringify( actions, null, 2 ) + '\n' );
		return;
	}
	if ( actions.create.length ) {
		gh( [ 'label', 'create', LABEL, '--color', 'B60205', '--description', 'A test that fails on WordPress trunk and passes on the release', '--force' ] );
	}
	for ( const { id, test } of actions.create ) {
		gh( [ 'issue', 'create', '--title', `Core regression: ${ test.name }`.slice( 0, 250 ), '--label', LABEL, '--body-file', '-' ], issueBody( id, test, ctx ) );
	}
	for ( const { number, test } of actions.comment ) {
		gh( [ 'issue', 'comment', String( number ), '--body-file', '-' ], `Still failing on ${ trunk.core || 'trunk' }: ${ test.message || '(no message)' }\n\n${ runUrl }` );
	}
	for ( const { number } of actions.close ) {
		gh( [ 'issue', 'close', String( number ), '--comment', `Passing on ${ trunk.core || 'trunk' } again. ${ runUrl }` ] );
	}
}

if ( require.main === module ) {
	main( process.argv.slice( 2 ) );
}

module.exports = { testId, playwrightResults, junitResults, plan, issueBody };
