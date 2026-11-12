#!/usr/bin/env node
/**
 * Worktrees that work like the main checkout, so several people or agents can work on Riff at once.
 *
 * A worktree made with plain `git worktree add` has no node_modules or vendor, so the pre-commit
 * hook can't lint, and its wp-env would want the main checkout's ports. This links the main
 * checkout's node_modules into each worktree and installs its vendor (a link would point outside
 * what wp-env mounts, so PHPUnit in the container couldn't follow it), and `env` gives it ports of
 * its own in a gitignored `.wp-env.override.json`, which wp-env, the hook and the Playwright config
 * already read. wp-env
 * keys its containers by the config's path, so `npm run wt -- env` in a worktree starts a site of
 * its own, mounting that worktree's code, and its suite tests that branch rather than whatever the
 * main checkout has checked out.
 *
 * Usage:
 *   npm run wt -- new <branch>   A worktree in .claude/worktrees/ on a new branch from origin/main, pushed.
 *   npm run wt -- setup          node_modules and vendor for the worktree you're in (made by any tool).
 *   npm run wt -- env            Ports of its own, then start this worktree's wp-env and seed its development site.
 *   npm run wt -- list           Every worktree: branch, ports, uncommitted, unpushed, pull request.
 *   npm run wt -- prune [--yes]  Remove worktrees whose pull request merged or closed, with nothing
 *                                uncommitted or unpushed, and their wp-env. Lists only, without --yes.
 */
const { execFileSync, spawnSync } = require( 'node:child_process' );
const crypto = require( 'node:crypto' );
const fs = require( 'node:fs' );
const net = require( 'node:net' );
const path = require( 'node:path' );

const git = ( args, cwd = process.cwd() ) =>
	execFileSync( 'git', args, { cwd, encoding: 'utf8', stdio: [ 'ignore', 'pipe', 'pipe' ] } ).trim();
const tryGit = ( args, cwd ) => {
	try {
		return git( args, cwd );
	} catch {
		return null;
	}
};

// The main checkout is the one whose .git is the common directory every worktree shares.
const MAIN = path.dirname( path.resolve( git( [ 'rev-parse', '--git-common-dir' ] ) ) );
const HOME = path.join( MAIN, '.claude', 'worktrees' );
const SHARED = [ 'node_modules' ];

// The main checkout keeps 8890/8891. Worktrees take a pair from here up, found from the path so a
// worktree keeps its ports across restarts, and moved on past any port something else holds.
const FIRST_PORT = 8900;
const PAIRS = 50;

const free = ( port ) =>
	new Promise( ( resolve ) => {
		const server = net.createServer();
		server.once( 'error', () => resolve( false ) );
		// No host: the wildcard address, where Docker Desktop publishes ports. macOS lets a listen on
		// 127.0.0.1 succeed beside one of those, so asking there would hand out a port in use.
		server.listen( port, () => server.close( () => resolve( true ) ) );
	} );

const takenByWorktrees = () => {
	const taken = new Set();
	for ( const { dir } of [ { dir: MAIN }, ...worktrees() ] ) {
		const ports = readOverride( dir );
		if ( ports.port ) {
			taken.add( ports.port );
		}
	}
	return taken;
};

async function pickPorts( dir ) {
	const offset = crypto.createHash( 'md5' ).update( dir ).digest().readUInt16BE( 0 ) % PAIRS;
	const taken = takenByWorktrees();
	for ( let i = 0; i < PAIRS; i++ ) {
		const port = FIRST_PORT + ( ( offset + i ) % PAIRS ) * 2;
		if ( ! taken.has( port ) && ( await free( port ) ) && ( await free( port + 1 ) ) ) {
			return { port, testsPort: port + 1 };
		}
	}
	throw new Error( `no free pair of ports between ${ FIRST_PORT } and ${ FIRST_PORT + PAIRS * 2 }` );
}

function readOverride( dir ) {
	try {
		return JSON.parse( fs.readFileSync( path.join( dir, '.wp-env.override.json' ), 'utf8' ) );
	} catch {
		return {};
	}
}

function worktrees() {
	const found = [];
	let current = null;
	for ( const line of git( [ 'worktree', 'list', '--porcelain' ], MAIN ).split( '\n' ) ) {
		if ( line.startsWith( 'worktree ' ) ) {
			current = { dir: line.slice( 9 ), branch: null };
			found.push( current );
		} else if ( line.startsWith( 'branch ' ) ) {
			current.branch = line.slice( 7 ).replace( 'refs/heads/', '' );
		} else if ( line === 'locked' || line.startsWith( 'locked ' ) ) {
			current.locked = true;
		}
	}
	return found.filter( ( w ) => path.resolve( w.dir ) !== MAIN );
}

async function setup( dir ) {
	if ( path.resolve( dir ) === MAIN ) {
		throw new Error( 'this is the main checkout; setup is for a worktree' );
	}
	for ( const name of SHARED ) {
		const link = path.join( dir, name );
		if ( ! fs.existsSync( link ) && fs.existsSync( path.join( MAIN, name ) ) ) {
			fs.symlinkSync( path.relative( dir, path.join( MAIN, name ) ), link );
		}
	}
	// A relative hooks path is read from each worktree's own checkout. An absolute one into the main
	// checkout runs whatever pre-commit that checkout has out, so a worktree's commit runs another
	// branch's hook, one that may predate this setup and leave vendor uninstalled.
	const hooks = tryGit( [ 'config', 'core.hooksPath' ], MAIN );
	if ( hooks && path.isAbsolute( hooks ) && path.resolve( hooks ) === path.join( MAIN, '.githooks' ) ) {
		tryGit( [ 'config', 'core.hooksPath', '.githooks' ], MAIN );
	}
	const vendor = path.join( dir, 'vendor' );
	// An earlier setup linked vendor too; inside the container that link leads nowhere.
	if ( fs.lstatSync( vendor, { throwIfNoEntry: false } )?.isSymbolicLink() ) {
		fs.unlinkSync( vendor );
	}
	if ( ! fs.existsSync( vendor ) ) {
		const result = spawnSync( 'composer', [ 'install', '--quiet', '--no-interaction' ], { cwd: dir, stdio: 'inherit' } );
		if ( result.status !== 0 ) {
			throw new Error( 'composer install failed' );
		}
	}
	console.log( `${ dir }: node_modules linked, vendor installed` );
}

// Ports only for a worktree that runs a site, so worktrees that never start one don't use up the pool.
async function claimPorts( dir ) {
	const override = readOverride( dir );
	if ( ! override.port || ! override.testsPort ) {
		Object.assign( override, await pickPorts( dir ) );
		fs.writeFileSync( path.join( dir, '.wp-env.override.json' ), JSON.stringify( override, null, '\t' ) + '\n' );
	}
	return override;
}

async function create( branch ) {
	if ( ! branch ) {
		throw new Error( 'name the branch: npm run wt -- new fix/the-thing' );
	}
	git( [ 'fetch', '--quiet', 'origin', 'main' ], MAIN );
	const dir = path.join( HOME, branch.replace( /[^a-z0-9._-]+/gi, '-' ) );
	git( [ 'worktree', 'add', '--no-track', '-b', branch, dir, 'origin/main' ], MAIN );
	// From origin/main, never from another open branch: pull requests squash-merge, so a stacked
	// branch conflicts with the change it sat on. Push now, so the branch is never only on this disk.
	git( [ 'push', '--quiet', '-u', 'origin', branch ], dir );
	await setup( dir );
	console.log( dir );
}

function start( dir ) {
	const npx = ( args ) => {
		const result = spawnSync( 'npx', args, { cwd: dir, stdio: 'inherit' } );
		if ( result.status !== 0 ) {
			process.exit( result.status || 1 );
		}
	};
	npx( [ 'wp-env', 'start' ] );
	// The development site only. The tests site stays as CI's is, unseeded, since the suite counts
	// what it makes itself: seeded albums there fail tests in this worktree that pass in CI.
	npx( [ 'wp-env', 'run', 'cli', 'wp', 'eval-file', 'wp-content/riff/packages/fixtures/seed.php' ] );
	const { port, testsPort } = readOverride( dir );
	console.log( `site http://localhost:${ port }, tests http://localhost:${ testsPort }` );
	require( 'node:child_process' ).execFileSync( process.execPath, [ path.join( __dirname, 'open-local.js' ), `http://localhost:${ port }` ], { stdio: 'inherit' } );
}

function prs() {
	try {
		const out = execFileSync(
			'gh',
			[ 'pr', 'list', '--state', 'all', '--limit', '500', '--json', 'number,headRefName,headRefOid,state,isCrossRepository' ],
			{ cwd: MAIN, encoding: 'utf8', stdio: [ 'ignore', 'pipe', 'ignore' ] }
		);
		const map = new Map();
		// Newest first, so a branch name reused later keeps its latest pull request.
		for ( const pr of JSON.parse( out ) ) {
			// A fork's branch can share a name with one here and is never this worktree's.
			if ( ! pr.isCrossRepository && ! map.has( pr.headRefName ) ) {
				map.set( pr.headRefName, pr );
			}
		}
		return map;
	} catch {
		return new Map();
	}
}

// Ignored files remove --force would take with it that nothing rebuilds: a personal music library
// in tests/ (AGENTS.md), Claude Code's per-person settings, local env files.
const PRECIOUS = /^!! (tests\/|\.claude\/settings\.local\.json|\.env)/;
function ignoredOwn( dir ) {
	const out = tryGit( [ 'status', '--porcelain', '--ignored', '--untracked-files=normal' ], dir );
	return out ? out.split( '\n' ).filter( ( line ) => PRECIOUS.test( line ) ).length : 0;
}

function describe( w, pulls ) {
	// The links and ports setup adds are this tool's own, and show as untracked on a branch from
	// before .gitignore knew them.
	const status = tryGit( [ 'status', '--porcelain', '--untracked-files=normal' ], w.dir );
	const dirty =
		status === null
			? null
			: status
					.split( '\n' )
					.filter( ( line ) => line && ! /^\?\? (node_modules|vendor|\.wp-env\.override\.json)$/.test( line ) )
					.join( '\n' );
	const upstream = w.branch && tryGit( [ 'rev-parse', '--abbrev-ref', `${ w.branch }@{upstream}` ], w.dir );
	let unpushed = upstream
		? Number( tryGit( [ 'rev-list', '--count', `${ upstream }..HEAD` ], w.dir ) || 0 )
		: Number( tryGit( [ 'rev-list', '--count', 'origin/main..HEAD' ], w.dir ) || 0 );
	const pr = w.branch && pulls.get( w.branch );
	// Once a merged branch is deleted on GitHub, fetch.prune drops its upstream and the count above
	// falls back to origin/main, which a squash-merged branch is always ahead of. What the pull
	// request last saw is then the test: nothing here that it didn't have.
	const head = tryGit( [ 'rev-parse', 'HEAD' ], w.dir );
	if ( pr && head === pr.headRefOid ) {
		unpushed = 0;
	}
	// A branch name reused after an old pull request merged would match that pull request; only
	// a worktree whose every commit the pull request had is done with it.
	const covered = Boolean( pr ) && tryGit( [ 'merge-base', '--is-ancestor', 'HEAD', pr.headRefOid ], w.dir ) !== null;
	return {
		...w,
		missing: dirty === null,
		covered,
		ignored: ignoredOwn( w.dir ),
		dirty: dirty ? dirty.split( '\n' ).length : 0,
		unpushed,
		pushed: Boolean( upstream ),
		pr,
		ports: readOverride( w.dir ),
	};
}

function list() {
	const pulls = prs();
	for ( const w of worktrees().map( ( x ) => describe( x, pulls ) ) ) {
		const notes = [];
		if ( w.missing ) {
			notes.push( 'folder gone (git worktree prune)' );
		}
		if ( w.dirty ) {
			notes.push( `${ w.dirty } uncommitted` );
		}
		if ( w.ignored ) {
			notes.push( `${ w.ignored } ignored to keep` );
		}
		if ( ! w.pushed && w.unpushed ) {
			notes.push( `never pushed, ${ w.unpushed } commits` );
		} else if ( w.unpushed ) {
			notes.push( `${ w.unpushed } unpushed` );
		}
		notes.push( w.pr ? `#${ w.pr.number } ${ w.pr.state.toLowerCase() }` : 'no pull request' );
		if ( w.ports.port ) {
			notes.push( `ports ${ w.ports.port }/${ w.ports.testsPort }` );
		}
		console.log( `${ path.relative( MAIN, w.dir ) || w.dir }  [${ w.branch || 'detached' }]  ${ notes.join( ', ' ) }` );
	}
}

function prune( yes ) {
	const pulls = prs();
	const done = worktrees()
		.map( ( x ) => describe( x, pulls ) )
		.filter( ( w ) => w.pr && w.pr.state !== 'OPEN' && w.covered && ! w.dirty && ! w.unpushed && ! w.ignored && ! w.locked );
	if ( yes ) {
		// Forget worktrees whose folder is gone. Not on a dry run: a folder on a drive that isn't
		// mounted looks gone too.
		git( [ 'worktree', 'prune' ], MAIN );
	}
	if ( ! done.length ) {
		console.log( 'nothing to prune' );
		return;
	}
	for ( const w of done ) {
		console.log( `${ yes ? 'removing' : 'would remove' } ${ w.dir } [${ w.branch }], #${ w.pr.number } ${ w.pr.state.toLowerCase() }` );
		if ( ! yes ) {
			continue;
		}
		if ( fs.existsSync( path.join( w.dir, '.wp-env.override.json' ) ) ) {
			spawnSync( 'npx', [ 'wp-env', 'destroy', '--force' ], { cwd: w.dir, stdio: 'ignore' } );
		}
		git( [ 'worktree', 'remove', '--force', w.dir ], MAIN );
		tryGit( [ 'branch', '-D', w.branch ], MAIN );
	}
	if ( ! yes ) {
		console.log( 'run again with --yes to remove them' );
	}
}

async function main() {
	const [ command, ...rest ] = process.argv.slice( 2 );
	const here = git( [ 'rev-parse', '--show-toplevel' ] );
	switch ( command ) {
		case 'new':
			return create( rest[ 0 ] );
		case 'setup':
			// npm runs scripts from the package root; INIT_CWD is where it was run from.
			return setup( rest[ 0 ] ? path.resolve( process.env.INIT_CWD || process.cwd(), rest[ 0 ] ) : here );
		case 'env':
			if ( path.resolve( here ) !== MAIN ) {
				await setup( here );
				await claimPorts( here );
			}
			return start( here );
		case 'list':
			return list();
		case 'prune':
			return prune( rest.includes( '--yes' ) );
		default:
			console.log( fs.readFileSync( __filename, 'utf8' ).match( /Usage:\n([\s\S]*?)\n \*\// )[ 1 ].replace( /^ \* ?/gm, '' ) );
			process.exit( command ? 1 : 0 );
	}
}

if ( require.main === module ) {
	main().catch( ( error ) => {
		console.error( `wt: ${ error.message }` );
		process.exit( 1 );
	} );
}

module.exports = { pickPorts, FIRST_PORT, PAIRS };
