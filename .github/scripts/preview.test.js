'use strict';

const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const fs = require( 'node:fs' );
const path = require( 'node:path' );
const { execFileSync } = require( 'node:child_process' );

const preview = require( './preview.js' );

const ROOT = path.join( __dirname, '..', '..' );
const read = ( file ) => fs.readFileSync( path.join( ROOT, file ), 'utf8' );
const REPO = 'RiffPress/RiffPress';
const OLD = 'a'.repeat( 40 );
const NEW = 'b'.repeat( 40 );
const pr = ( over = {} ) => ( { state: 'open', merged: false, number: 7, head: { sha: NEW, ref: 'fix/x' }, ...over } );
const PLAY = 'https://playground.wordpress.net/?mode=seamless#e30=';
const paths = preview.buildPaths( read( '.github/workflows/playground-preview.yml' ) );

test( 'the build\'s path filter is read from its workflow', () => {
	assert.equal( paths[ 0 ], '**' );
	assert.ok( paths.includes( '!**.md' ) );
	assert.ok( paths.includes( 'docs/**' ) );
} );

test( 'path filters decide by the last pattern a path matches', () => {
	assert.equal( preview.matches( [ 'plugins/riff/riff.php' ], paths ), true );
	assert.equal( preview.matches( [ 'README.md', '.github/workflows/ci.yml', 'plugins/riff/tests/php/test-x.php' ], paths ), false );
	assert.equal( preview.matches( [ 'packages/fixtures/tests/x.js' ], paths ), true );
	assert.equal( preview.matches( [ 'docs/state.md' ], paths ), true );
	assert.equal( preview.matches( [ '.github/scripts/site-shell.js' ], paths ), true );
	assert.equal( preview.matches( [ '.github/scripts/release-gate.js' ], paths ), false );
} );

test( 'only a change to the sites, the docs or their generators gets site previews', () => {
	assert.equal( preview.needsSite( [ 'plugins/riff/assets/player/now-playing.js' ] ), false );
	assert.equal( preview.needsSite( [ 'plugins/riff/riff.php', 'README.md' ] ), false );
	assert.equal( preview.needsSite( [ 'site/index.html' ] ), true );
	assert.equal( preview.needsSite( [ 'docs/learn/app.md' ] ), true );
	assert.equal( preview.needsSite( [ '.github/scripts/hooks-reference.js' ] ), true );
	assert.equal( preview.needsSite( [ '.github/scripts/hooks-reference.test.js' ] ), false );
	assert.equal( execFileSync( 'node', [ path.join( __dirname, 'preview.js' ), 'site' ], { input: 'plugins/riff/riff.php\nsite/x.css\n' } ).toString(), 'true\n' );
	assert.equal( execFileSync( 'node', [ path.join( __dirname, 'preview.js' ), 'site' ], { input: 'plugins/riff/riff.php\n' } ).toString(), 'false\n' );
} );

test( 'every script the site build runs, and every input it names, starts a build and a site preview', () => {
	const yaml = read( '.github/workflows/playground-preview.yml' );
	const step = yaml.slice( yaml.indexOf( '- name: Build the site' ), yaml.indexOf( '- name: Build riff.zip' ) );
	const scripts = [ ...step.matchAll( /node (\.github\/scripts\/[\w.-]+\.js)/g ) ].map( ( m ) => m[ 1 ] );
	assert.ok( scripts.length >= 5 );
	for ( const file of [ ...scripts, '.github/scripts/site-js.js', '.github/scripts/developers-site.js', '.github/scripts/site-preview.js' ] ) {
		assert.ok( preview.SITE_INPUTS.includes( file ), `${ file } is a site input` );
	}
	for ( const input of preview.SITE_INPUTS ) {
		assert.ok( paths.includes( input ), `${ input } is in the build's path filter` );
		if ( ! input.endsWith( '**' ) ) {
			assert.ok( fs.existsSync( path.join( ROOT, input ) ), `${ input } exists` );
		}
	}
} );

test( 'the comment\'s state is read from the live pull request', () => {
	const d = ( over ) => preview.decide( { pr: pr(), built: OLD, run: null, rebuilds: false, compare: null, paths, ...over } );
	assert.equal( d( { pr: pr( { state: 'closed' } ) } ), 'closed' );
	assert.equal( d( { built: NEW } ), 'fresh' );
	assert.equal( d( { run: { status: 'queued' } } ), 'building' );
	assert.equal( d( { run: { status: 'in_progress' } } ), 'building' );
	assert.equal( d( { run: { status: 'completed', conclusion: 'success' } } ), 'building' );
	assert.equal( d( { run: { status: 'completed', conclusion: 'action_required' } } ), 'approval' );
	assert.equal( d( { run: { status: 'completed', conclusion: 'failure' } } ), 'failed' );
	assert.equal( d( { run: { status: 'completed', conclusion: 'cancelled' } } ), 'failed' );
	assert.equal( d( { rebuilds: true } ), 'building' );
	assert.equal( d( { compare: { ahead: true, files: [ 'README.md', 'plugins/riff/tests/e2e/x.spec.js' ] } } ), 'unchanged' );
	assert.equal( d( { compare: { ahead: true, files: [ 'plugins/riff/riff.php' ] } } ), 'gone' );
	assert.equal( d( { compare: { ahead: false, files: [] } } ), 'gone' );
	assert.equal( d( { compare: null } ), 'gone' );
} );

const built = ( over = {} ) => preview.block( { repo: REPO, sha: OLD, playground: PLAY, source: null, developer: null, ...over } );
const commit = ( sha ) => `<a href="https://github.com/${ REPO }/commit/${ sha }"><samp>${ sha.slice( 0, 7 ) }</samp></a>`;
const statusOf = ( body ) => body.split( '\n' )[ 3 ];

test( 'a fresh build shows its three Playground buttons, and the sites only when it has them', () => {
	const body = preview.render( { kind: 'fresh', repo: REPO, pr: pr( { head: { sha: OLD } } ), built: OLD, block: built() } );
	assert.ok( body.startsWith( `${ preview.MARKER }\n### 🛝 Preview\n\n<!-- riff:built ${ OLD } -->\nBuilt from ${ commit( OLD ) }, signed in as admin.` ) );
	assert.match( body, /Standalone app.*Listen page.*Blog post/ );
	assert.doesNotMatch( body, /Source|Developer|pages\.dev/ );
	assert.match( body, /&url=%2Flisten%2F#/ );
	const sites = built( { source: 'https://pr-7.riffpress-developer.pages.dev/', developer: 'https://pr-7.build-on-riff.pages.dev/' } );
	assert.match( sites, /\[!\[Source\]\([^)]+\)\]\(https:\/\/pr-7\.riffpress-developer\.pages\.dev\/\)/ );
	assert.match( sites, /<b>Source<\/b> and <b>Developer<\/b> are source\.riffpress\.com and developer\.riffpress\.com as this branch builds them\./ );
	assert.deepEqual( preview.parse( `${ preview.MARKER }\n\n${ sites }\n` ), { sha: OLD, block: sites } );
	assert.deepEqual( preview.parse( 'Built from nothing' ), { sha: null, block: null } );
} );

test( 'each state says what the buttons open, word for word', () => {
	const run = 'https://github.com/RiffPress/RiffPress/actions/runs/1';
	const r = ( kind, over = {} ) => preview.render( { kind, repo: REPO, pr: pr(), built: OLD, block: built(), run, ...over } );
	const still = ` The buttons below are still ${ commit( OLD ) }'s.`;
	assert.equal( statusOf( r( 'building' ) ), `The head is now ${ commit( NEW ) }, and a preview of it is [building](${ run }).${ still }` );
	assert.equal( statusOf( r( 'building', { run: null } ) ), `The head is now ${ commit( NEW ) }, and a preview of it is building.${ still }` );
	assert.equal( statusOf( r( 'building', { block: null } ) ), `A preview of ${ commit( NEW ) } is [building](${ run }).` );
	assert.equal( statusOf( r( 'approval' ) ), `The head is now ${ commit( NEW ) }, and its preview is waiting for a maintainer to [approve the run](${ run }).${ still }` );
	assert.equal( statusOf( r( 'failed' ) ), `The preview of ${ commit( NEW ) } [did not build](${ run }).${ still }` );
	assert.equal( statusOf( r( 'unchanged' ) ), `The head is now ${ commit( NEW ) }. Nothing in <a href="https://github.com/${ REPO }/compare/${ OLD }...${ NEW }"><samp>aaaaaaa..bbbbbbb</samp></a> changes what the preview shows.` );
	assert.ok( r( 'building' ).includes( built() ) );
	assert.ok( r( 'unchanged' ).includes( built() ) );
	const gone = r( 'gone' );
	assert.equal( statusOf( gone ), `The head is now ${ commit( NEW ) }, which changes nothing a preview is built from, so there is no preview of it.` );
	assert.doesNotMatch( gone, /img\.shields\.io|riff:built/ );
	const merged = r( 'closed', { pr: pr( { state: 'closed', merged: true } ) } );
	assert.equal( statusOf( merged ), `This pull request was merged, so its preview has been taken down. It was last built from ${ commit( OLD ) }.` );
	assert.doesNotMatch( merged, /img\.shields\.io|playground\.wordpress|Built from/ );
	assert.equal( preview.parse( merged ).sha, OLD );
	assert.equal( statusOf( r( 'closed', { pr: pr( { state: 'closed' } ), built: null, block: null } ) ), 'This pull request was closed, so its preview has been taken down.' );
} );

test( 'the sweep chooses only preview branches and pr-N deployments of pull requests that are not open', () => {
	const dead = preview.stale( {
		refs: [ 'preview-pr-212', 'preview-pr-7', 'main', 'preview-pr-0', 'preview-pr-01', 'preview-pr-9x', 'xpreview-pr-3', 'preview-pr-' ],
		deployments: [
			{ project: 'build-on-riff', id: 'abc-1', branch: 'pr-212' },
			{ project: 'build-on-riff', id: 'abc-2', branch: 'pr-7' },
			{ project: 'build-on-riff', id: 'abc-3', branch: 'main' },
			{ project: 'build-on-riff', id: 'abc-4', branch: 'pr-07' },
			{ project: 'build-on-riff', id: 'abc-5', branch: '' },
			{ project: 'build-on-riff', id: '../x', branch: 'pr-8' },
		],
		open: new Set( [ 7 ] ),
	} );
	assert.deepEqual( dead.refs, [ 'preview-pr-212' ] );
	assert.deepEqual( dead.deployments.map( ( d ) => d.id ), [ 'abc-1' ] );
} );

const response = ( status, json ) => ( { status, ok: status >= 200 && status < 300, json: async () => json } );
const ACCOUNT = 'f'.repeat( 32 );

test( 'Cloudflare deployments are listed page by page and a failure is never an empty list', async () => {
	const seen = [];
	const pages = {
		1: { success: true, result: Array.from( { length: 25 }, ( _, i ) => ( { id: `id-${ i }`, deployment_trigger: { metadata: { branch: 'pr-1' } } } ) ) },
		2: { success: true, result: [ { id: 'id-last', deployment_trigger: { metadata: { branch: 'pr-2' } } } ] },
	};
	const fetch = async ( url, opts ) => {
		seen.push( [ url, opts.method || 'GET', opts.headers.Authorization ] );
		const page = Number( new URL( url ).searchParams.get( 'page' ) );
		return response( 200, pages[ page ] );
	};
	const cf = preview.cloudflare( { fetch, account: ACCOUNT, token: 't' } );
	const list = await cf.list( 'build-on-riff' );
	assert.equal( list.length, 26 );
	assert.deepEqual( list[ 25 ], { project: 'build-on-riff', id: 'id-last', branch: 'pr-2' } );
	assert.match( seen[ 0 ][ 0 ], /\/accounts\/f{32}\/pages\/projects\/build-on-riff\/deployments\?env=preview&per_page=25&page=1$/ );
	assert.equal( seen[ 0 ][ 2 ], 'Bearer t' );
	assert.deepEqual( await preview.cloudflare( { fetch: async () => response( 404, {} ), account: ACCOUNT, token: 't' } ).list( 'x' ), [] );
	await assert.rejects( preview.cloudflare( { fetch: async () => response( 500, { success: false } ), account: ACCOUNT, token: 't' } ).list( 'x' ) );
	await assert.rejects( preview.cloudflare( { fetch: async () => response( 200, { success: false, result: [] } ), account: ACCOUNT, token: 't' } ).list( 'x' ) );
	assert.throws( () => preview.cloudflare( { fetch, account: 'nope', token: 't' } ) );
	const removed = [];
	await preview.cloudflare( { fetch: async ( url, o ) => removed.push( [ url, o.method ] ) && response( 200, {} ), account: ACCOUNT, token: 't' } ).remove( 'build-on-riff', 'id-1' );
	assert.deepEqual( removed, [ [ `https://api.cloudflare.com/client/v4/accounts/${ ACCOUNT }/pages/projects/build-on-riff/deployments/id-1?force=true`, 'DELETE' ] ] );
} );

// An Octokit that answers from a table and records what it was asked to change.
function octokit( { pulls = [], comments = [], refs = [], runs = [], files = [], compare = null, failList = false } = {} ) {
	const done = [];
	const rest = {
		pulls: {
			list: 'pulls.list',
			listFiles: 'pulls.listFiles',
			get: async ( { pull_number: n } ) => ( { data: pulls.find( ( p ) => p.number === n ) } ),
		},
		issues: {
			listComments: 'issues.listComments',
			updateComment: async ( a ) => done.push( [ 'update', a.comment_id, a.body ] ),
			createComment: async ( a ) => done.push( [ 'create', a.issue_number, a.body ] ),
			deleteComment: async ( a ) => done.push( [ 'deleteComment', a.comment_id ] ),
		},
		git: {
			listMatchingRefs: 'git.listMatchingRefs',
			deleteRef: async ( a ) => done.push( [ 'deleteRef', a.ref ] ),
		},
		actions: { listWorkflowRuns: async () => ( { data: { workflow_runs: runs } } ) },
		repos: {
			compareCommits: async () => {
				if ( ! compare ) {
					throw Object.assign( new Error( 'Not Found' ), { status: 404 } );
				}
				return { data: compare };
			},
		},
	};
	const paginate = async ( what ) => {
		if ( what === 'pulls.list' ) {
			if ( failList ) {
				throw Object.assign( new Error( 'Bad credentials' ), { status: 401 } );
			}
			return pulls.filter( ( p ) => p.state === 'open' );
		}
		return { 'issues.listComments': comments, 'git.listMatchingRefs': refs, 'pulls.listFiles': files }[ what ];
	};
	return { github: { rest, paginate }, done };
}

const BOT = { login: 'github-actions[bot]' };
const repo = { owner: 'RiffPress', repo: 'RiffPress' };

test( 'a push edits the bot\'s own comment in place and leaves a look-alike alone', async () => {
	const body = preview.render( { kind: 'fresh', repo: REPO, pr: pr(), built: OLD, block: built() } );
	const { github, done } = octokit( {
		pulls: [ { ...pr(), number: 7 } ],
		comments: [ { id: 1, user: { login: 'someone' }, body: preview.MARKER }, { id: 2, user: BOT, body } ],
		runs: [ { status: 'queued', html_url: 'https://github.com/RiffPress/RiffPress/actions/runs/9' } ],
	} );
	assert.equal( await preview.sync( { github, repo, number: 7 } ), 'building' );
	assert.equal( done.length, 1 );
	assert.equal( done[ 0 ][ 0 ], 'update' );
	assert.equal( done[ 0 ][ 1 ], 2 );
	assert.match( done[ 0 ][ 2 ], /\[building\]\(https:\/\/github\.com\/RiffPress\/RiffPress\/actions\/runs\/9\)/ );
	assert.ok( done[ 0 ][ 2 ].includes( built() ) );
} );

test( 'a run address from anywhere else is not linked', async () => {
	const body = preview.render( { kind: 'fresh', repo: REPO, pr: pr(), built: OLD, block: built() } );
	const { github, done } = octokit( {
		pulls: [ { ...pr(), number: 7 } ],
		comments: [ { id: 2, user: BOT, body } ],
		runs: [ { status: 'completed', conclusion: 'failure', html_url: 'https://example.com/actions/runs/9' } ],
	} );
	assert.equal( await preview.sync( { github, repo, number: 7 } ), 'failed' );
	assert.doesNotMatch( done[ 0 ][ 2 ], /example\.com/ );
} );

test( 'a push that builds nothing says so, and nothing is said where there is no comment', async () => {
	const body = preview.render( { kind: 'fresh', repo: REPO, pr: pr(), built: OLD, block: built() } );
	const unchanged = octokit( {
		pulls: [ { ...pr(), number: 7 } ],
		comments: [ { id: 2, user: BOT, body } ],
		files: [ { filename: 'README.md' } ],
		compare: { status: 'ahead', files: [ { filename: 'README.md' } ] },
	} );
	assert.equal( await preview.sync( { github: unchanged.github, repo, number: 7 } ), 'unchanged' );
	const none = octokit( { pulls: [ { ...pr(), number: 7 } ], files: [ { filename: 'README.md' } ] } );
	assert.equal( await preview.sync( { github: none.github, repo, number: 7 } ), null );
	assert.deepEqual( none.done, [] );
} );

test( 'a pull request reopened at the commit it closed at says it is building again', async () => {
	const closed = preview.render( { kind: 'closed', repo: REPO, pr: pr( { state: 'closed', head: { sha: OLD } } ), built: OLD, block: built() } );
	const { github, done } = octokit( {
		pulls: [ { ...pr( { head: { sha: OLD, ref: 'fix/x' } } ), number: 7 } ],
		comments: [ { id: 2, user: BOT, body: closed } ],
		runs: [ { status: 'queued', html_url: 'https://github.com/RiffPress/RiffPress/actions/runs/9' } ],
	} );
	assert.equal( await preview.sync( { github, repo, number: 7 } ), 'building' );
	assert.equal( statusOf( done[ 0 ][ 2 ] ), `A preview of ${ commit( OLD ) } is [building](https://github.com/RiffPress/RiffPress/actions/runs/9).` );
} );

test( 'the release pull request keeps no preview comment', async () => {
	const { github, done } = octokit( {
		pulls: [ { ...pr( { head: { sha: NEW, ref: preview.RELEASE_BRANCH } } ), number: 9 } ],
		comments: [ { id: 3, user: BOT, body: preview.MARKER } ],
	} );
	assert.equal( await preview.sync( { github, repo, number: 9, build: { sha: NEW, playground: PLAY } } ), null );
	assert.deepEqual( done, [ [ 'deleteComment', 3 ] ] );
} );

test( 'the sweep deletes nothing when open pull requests cannot be listed', async () => {
	const { github, done } = octokit( { failList: true, refs: [ { ref: 'refs/heads/preview-pr-212' } ] } );
	const cf = { list: async () => [ { project: 'build-on-riff', id: 'abc', branch: 'pr-212' } ], remove: async () => done.push( 'remove' ) };
	await assert.rejects( preview.sweep( { github, repo, cf, log: () => {} } ) );
	assert.deepEqual( done, [] );
} );

test( 'the sweep takes down what no open pull request needs, the release pull request\'s included', async () => {
	const { github, done } = octokit( {
		pulls: [ { ...pr(), number: 7 }, { ...pr( { head: { sha: NEW, ref: preview.RELEASE_BRANCH } } ), number: 9 } ],
		refs: [ { ref: 'refs/heads/preview-pr-7' }, { ref: 'refs/heads/preview-pr-9' }, { ref: 'refs/heads/preview-pr-212' } ],
	} );
	const removed = [];
	const cf = {
		list: async ( project ) => [ { project, id: `${ project.length }-1`, branch: 'pr-7' }, { project, id: `${ project.length }-2`, branch: 'pr-212' } ],
		remove: async ( project, id ) => removed.push( `${ project } ${ id }` ),
	};
	const log = [];
	await preview.sweep( { github, repo, cf, log: ( l ) => log.push( l ) } );
	assert.deepEqual( done, [ [ 'deleteRef', 'heads/preview-pr-9' ], [ 'deleteRef', 'heads/preview-pr-212' ] ] );
	assert.deepEqual( removed, [ 'riffpress-developer 19-2', 'build-on-riff 13-2' ] );
	assert.ok( log.some( ( l ) => l === 'Deleted branch preview-pr-212' ) );
} );

test( 'taking a pull request down deletes its branch and only its own deployments', async () => {
	const { github, done } = octokit();
	const removed = [];
	const cf = {
		list: async ( project ) => [ { project, id: `${ project }-a`, branch: 'pr-7' }, { project, id: `${ project }-b`, branch: 'pr-77' } ],
		remove: async ( project, id ) => removed.push( id ),
	};
	await preview.takeDown( { github, repo, number: 7, cf, log: () => {} } );
	assert.deepEqual( done, [ [ 'deleteRef', 'heads/preview-pr-7' ] ] );
	assert.deepEqual( removed, [ 'riffpress-developer-a', 'build-on-riff-a' ] );
	await assert.rejects( preview.takeDown( { github, repo, number: NaN, cf, log: () => {} } ) );
} );
