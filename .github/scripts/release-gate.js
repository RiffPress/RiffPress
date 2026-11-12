/**
 * Whether release-please's open pull request may merge itself now (release-auto-merge.yml).
 *
 * It may when all of these hold, and only then:
 *
 * - the repository variable RELEASE_AUTO_MERGE is not "false" (the kill switch);
 * - the pull request is release-please's own: its branch in this repository, onto main, labelled
 *   "autorelease: pending", not a draft;
 * - it already contains main's newest commit, so what merges is main as it is plus the release;
 * - on main's newest commit, CI status passed and no gating check failed or is still running;
 * - on the pull request's newest commit, CI status passed, the full suite really ran (PHPUnit,
 *   Playwright and Plugin Check, not skipped by the paths filter), and no gating check failed or
 *   is still running.
 *
 * Gating checks are the ones a release must not ship past: CI and every job inside it, CodeQL,
 * the workflow scripts' tests, the workflow linters and the pull request title. A check that was
 * cancelled was replaced by a newer run, so it waits rather than blocks.
 *
 * It prints its reasons and writes `action` (merge, wait, block or off), `number` and `head` to
 * GITHUB_OUTPUT. `block` means something is red and a person should look; `wait` means something
 * is still running or main moved on, and a later run decides.
 *
 *   node .github/scripts/release-gate.js   (GH_TOKEN and GH_REPO set)
 */
const fs = require( 'node:fs' );
const { execFileSync } = require( 'node:child_process' );

const BRANCH = 'release-please--branches--main';
const LABEL = 'autorelease: pending';

const GATING = [
	/^CI status$/,
	/^(phpcs|phpunit|e2e|lint-js|typos|plugin-check) \/ /,
	/^(gate|changes|docs|api-coverage)$/,
	/^Analyze \(/,
	/^Run script unit tests$/,
	/^Run actionlint$/,
	/^Zizmor$/,
	/^Validate pull request title$/,
];

// The suites that must have run, not been skipped, on the commit that gets tagged.
const FULL = [ /^phpunit \/ /, /^e2e \/ /, /^plugin-check \/ / ];

const PASSED = new Set( [ 'success', 'skipped', 'neutral' ] );
const RED = new Set( [ 'failure', 'timed_out', 'action_required', 'startup_failure', 'stale' ] );

/**
 * The newest run of each check name, since a re-run leaves the old one in the list.
 *
 * @param {object[]} runs Check runs, as the REST API lists them.
 * @return {Map<string, object>} Each name's newest run.
 */
function newest( runs ) {
	const byName = new Map();
	for ( const run of runs ) {
		const seen = byName.get( run.name );
		if ( ! seen || run.id > seen.id ) {
			byName.set( run.name, run );
		}
	}
	return byName;
}

/**
 * What stands between a commit's checks and a release.
 *
 * @param {object[]} runs  The commit's check runs.
 * @param {string}   where "main" or "the release pull request", for the reasons.
 * @param {boolean}  full  Whether the full suite must have run.
 * @return {{red: string[], waiting: string[]}} Reasons it is red, and reasons to wait.
 */
function judge( runs, where, full ) {
	const checks = newest( runs );
	const red = [];
	const waiting = [];
	for ( const [ name, run ] of checks ) {
		if ( ! GATING.some( ( pattern ) => pattern.test( name ) ) ) {
			continue;
		}
		if ( run.status !== 'completed' ) {
			waiting.push( `${ name } is still running on ${ where }` );
		} else if ( RED.has( run.conclusion ) ) {
			red.push( `${ name } is ${ run.conclusion } on ${ where }` );
		} else if ( ! PASSED.has( run.conclusion ) ) {
			waiting.push( `${ name } is ${ run.conclusion } on ${ where }` );
		}
	}
	const status = checks.get( 'CI status' );
	if ( ! status ) {
		waiting.push( `CI status has not reported on ${ where }` );
	} else if ( status.status === 'completed' && status.conclusion !== 'success' && ! RED.has( status.conclusion ) ) {
		waiting.push( `CI status is ${ status.conclusion } on ${ where }` );
	}
	if ( full && status && status.status === 'completed' ) {
		for ( const pattern of FULL ) {
			const ran = [ ...checks.values() ].filter( ( run ) => pattern.test( run.name ) );
			if ( ! ran.length || ran.some( ( run ) => run.status === 'completed' && run.conclusion === 'skipped' ) ) {
				red.push( `${ pattern.source.replace( /[\\^]/g, '' ).trim() } did not run on ${ where }` );
			}
		}
	}
	return { red, waiting };
}

/**
 * The decision, from what the API says.
 *
 * @param {Object}   input
 * @param {string}   input.killSwitch The RELEASE_AUTO_MERGE variable.
 * @param {string}   input.repo       owner/name.
 * @param {object[]} input.pulls      Open pull requests onto main from release-please's branch.
 * @param {number}   input.behindBy   How many of main's commits the pull request lacks.
 * @param {object[]} input.prRuns     Check runs on the pull request's head.
 * @param {object[]} input.mainRuns   Check runs on main's head.
 * @return {{action: string, reasons: string[], number?: number, head?: string}} What to do.
 */
function decide( { killSwitch, repo, pulls, behindBy, prRuns, mainRuns } ) {
	if ( String( killSwitch ).trim().toLowerCase() === 'false' ) {
		return { action: 'off', reasons: [ 'RELEASE_AUTO_MERGE is false: release pull requests wait for a person.' ] };
	}
	const pull = pulls.find(
		( p ) => p.head.ref === BRANCH && p.head.repo && p.head.repo.full_name === repo && p.base.ref === 'main'
	);
	if ( ! pull ) {
		return { action: 'wait', reasons: [ 'No release pull request is open.' ] };
	}
	const which = { number: pull.number, head: pull.head.sha };
	if ( pull.draft ) {
		return { action: 'wait', reasons: [ `#${ pull.number } is a draft.` ], ...which };
	}
	if ( ! ( pull.labels || [] ).some( ( label ) => label.name === LABEL ) ) {
		return { action: 'wait', reasons: [ `#${ pull.number } is not labelled "${ LABEL }".` ], ...which };
	}
	if ( behindBy > 0 ) {
		return {
			action: 'wait',
			reasons: [ `#${ pull.number } is ${ behindBy } commit(s) behind main; sync-versions brings it up to date.` ],
			...which,
		};
	}
	const onMain = judge( mainRuns, 'main', false );
	const onPull = judge( prRuns, 'the release pull request', true );
	const red = [ ...onMain.red, ...onPull.red ];
	const waiting = [ ...onMain.waiting, ...onPull.waiting ];
	if ( red.length ) {
		return { action: 'block', reasons: red, ...which };
	}
	if ( waiting.length ) {
		return { action: 'wait', reasons: waiting, ...which };
	}
	return { action: 'merge', reasons: [ `#${ pull.number } and main are green.` ], ...which };
}

function api( route ) {
	return JSON.parse( execFileSync( 'gh', [ 'api', '--paginate', '--slurp', route ], { encoding: 'utf8' } ) );
}

function runsOf( repo, sha ) {
	return api( `repos/${ repo }/commits/${ sha }/check-runs?per_page=100` ).flatMap( ( page ) => page.check_runs );
}

function main() {
	const repo = process.env.GH_REPO;
	const killSwitch = process.env.RELEASE_AUTO_MERGE || '';
	let input = { killSwitch, repo, pulls: [], behindBy: 0, prRuns: [], mainRuns: [] };
	if ( killSwitch.trim().toLowerCase() !== 'false' ) {
		const pulls = api( `repos/${ repo }/pulls?state=open&base=main&head=${ repo.split( '/' )[ 0 ] }:${ BRANCH }&per_page=100` ).flat();
		const pull = pulls.find( ( p ) => p.head.ref === BRANCH );
		if ( pull ) {
			const mainSha = api( `repos/${ repo }/commits/main` )[ 0 ].sha;
			const compare = api( `repos/${ repo }/compare/${ mainSha }...${ pull.head.sha }` )[ 0 ];
			input = { ...input, pulls, behindBy: compare.behind_by, prRuns: runsOf( repo, pull.head.sha ), mainRuns: runsOf( repo, mainSha ) };
		}
	}
	const decision = decide( input );
	console.log( `Decision: ${ decision.action }` );
	for ( const reason of decision.reasons ) {
		console.log( `- ${ reason }` );
	}
	if ( process.env.GITHUB_OUTPUT ) {
		fs.appendFileSync(
			process.env.GITHUB_OUTPUT,
			`action=${ decision.action }\nnumber=${ decision.number || '' }\nhead=${ decision.head || '' }\n`
		);
	}
	if ( process.env.GITHUB_STEP_SUMMARY ) {
		fs.appendFileSync(
			process.env.GITHUB_STEP_SUMMARY,
			`### Release gate: ${ decision.action }\n\n${ decision.reasons.map( ( r ) => `- ${ r }` ).join( '\n' ) }\n`
		);
	}
	if ( process.env.REASONS_FILE ) {
		fs.writeFileSync( process.env.REASONS_FILE, decision.reasons.map( ( r ) => `- ${ r }` ).join( '\n' ) + '\n' );
	}
}

if ( require.main === module ) {
	main();
}

module.exports = { decide, judge, newest, BRANCH, LABEL };
