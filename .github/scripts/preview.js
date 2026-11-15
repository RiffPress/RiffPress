#!/usr/bin/env node
/**
 * A pull request's preview: which previews it needs, what its sticky comment says, and taking the
 * previews down again. The Playground Preview workflows require it from the default branch and
 * hand it the API, so it reads nothing a pull request wrote but the event's own numbers and SHAs,
 * each checked before use. Node built-ins only: the jobs that load it install nothing.
 *
 * Usage: node .github/scripts/preview.js site < changed-files
 *   prints true when the files (one per line) change what Source or the developer site is built from.
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );

const MARKER = '<!-- riff:playground-preview -->';
const BOT = 'github-actions[bot]';
const RELEASE_BRANCH = 'release-please--branches--main';
const SHA = /^[0-9a-f]{40}$/;
const BRANCH = /^preview-pr-([1-9][0-9]*)$/;
const ALIAS = /^pr-([1-9][0-9]*)$/;
// Source and the developer site, the two Cloudflare Pages projects a site preview deploys to.
const PROJECTS = [ 'riffpress-developer', 'build-on-riff' ];

// What the two sites are built from: their pages, the docs the handbook is drawn from, and the
// scripts that write and split them. The references are also drawn from the plugin's source, but a
// change there is guarded by the docs checks, so a plugin-only change gets a Playground and no site.
const SITE_INPUTS = [
	'site/**',
	'docs/**',
	'.github/scripts/developers-site.js',
	'.github/scripts/handbook-pages.js',
	'.github/scripts/hooks-reference.js',
	'.github/scripts/js-reference.js',
	'.github/scripts/no-widows.js',
	'.github/scripts/reference-pages.js',
	'.github/scripts/site-js.js',
	'.github/scripts/site-nav.js',
	'.github/scripts/site-nav.json',
	'.github/scripts/site-preview.js',
	'.github/scripts/site-shell.js',
	'.github/scripts/surface.php',
	'.github/scripts/web-pages.js',
];

/**
 * A GitHub path filter as a regular expression: `**` crosses folders, `*` and `?` do not.
 *
 * @param {string} glob The pattern, without a leading `!`.
 * @return {RegExp} The pattern, anchored.
 */
function pattern( glob ) {
	let out = '';
	for ( let i = 0; i < glob.length; i++ ) {
		const c = glob[ i ];
		if ( c === '*' && glob[ i + 1 ] === '*' ) {
			if ( glob[ i + 2 ] === '/' ) {
				out += '(?:.*/)?';
				i += 2;
			} else {
				out += '.*';
				i += 1;
			}
		} else if ( c === '*' ) {
			out += '[^/]*';
		} else if ( c === '?' ) {
			out += '[^/]';
		} else {
			out += c.replace( /[.+^${}()|[\]\\]/g, '\\$&' );
		}
	}
	return new RegExp( `^${ out }$` );
}

/**
 * Whether any file passes a list of path filters, as GitHub decides: the last pattern a path
 * matches decides, and a `!` pattern leaves it out.
 *
 * @param {string[]} files    Changed paths.
 * @param {string[]} patterns Filters, in order.
 * @return {boolean} True when at least one file is in.
 */
function matches( files, patterns ) {
	const rules = patterns.map( ( p ) => ( {
		out: p.startsWith( '!' ),
		re: pattern( p.replace( /^!/, '' ) ),
	} ) );
	return files.some( ( file ) => {
		let inside = false;
		for ( const rule of rules ) {
			if ( rule.re.test( file ) ) {
				inside = ! rule.out;
			}
		}
		return inside;
	} );
}

/**
 * The `paths` filter of the build's pull_request trigger, read from the workflow.
 *
 * @param {string} yaml playground-preview.yml.
 * @return {string[]} Its patterns, in order.
 */
function buildPaths( yaml ) {
	const lines = yaml.split( '\n' );
	const start = lines.findIndex( ( l ) => /^ {2}pull_request:\s*$/.test( l ) );
	const at = lines.findIndex( ( l, i ) => i > start && /^ {4}paths:\s*$/.test( l ) );
	if ( start === -1 || at === -1 ) {
		throw new Error( 'playground-preview.yml has no pull_request paths filter' );
	}
	const out = [];
	for ( const line of lines.slice( at + 1 ) ) {
		if ( /^\s*#/.test( line ) ) {
			continue;
		}
		const m = line.match( /^ {6}- '([^']+)'\s*$/ );
		if ( ! m ) {
			break;
		}
		out.push( m[ 1 ] );
	}
	return out;
}

const BUILD_PATHS = () =>
	buildPaths( fs.readFileSync( path.join( __dirname, '..', 'workflows', 'playground-preview.yml' ), 'utf8' ) );

/**
 * Whether a pull request changing these files gets the two site previews.
 *
 * @param {string[]} files Changed paths.
 * @return {boolean} True when Source or the developer site would be built differently.
 */
const needsSite = ( files ) => matches( files, SITE_INPUTS );

/**
 * Where the comment stands, from the live state of the pull request.
 *
 * @param {Object}   state
 * @param {Object}   state.pr       The pull request, as the API returns it.
 * @param {?string}  state.built    The SHA the comment's buttons were built from, if it has any.
 * @param {?Object}  state.run      The latest Playground Preview run for the head, if any.
 * @param {boolean}  state.rebuilds Whether the pull request's changes start a build at all.
 * @param {?Object}  state.compare  built...head, when the head moved with no run: { ahead, files }.
 * @param {string[]} state.paths    The build's path filter.
 * @return {string} closed, fresh, building, approval, failed, unchanged, gone or none.
 */
function decide( { pr, built, run, rebuilds, compare, paths } ) {
	if ( pr.state !== 'open' ) {
		return 'closed';
	}
	if ( built && built === pr.head.sha ) {
		return 'fresh';
	}
	if ( run ) {
		if ( run.status !== 'completed' ) {
			return 'building';
		}
		if ( run.conclusion === 'success' ) {
			// Built; its publish is on its way.
			return 'building';
		}
		return run.conclusion === 'action_required' ? 'approval' : 'failed';
	}
	if ( rebuilds ) {
		return 'building';
	}
	if ( ! built ) {
		return 'gone';
	}
	return compare && compare.ahead && ! matches( compare.files, paths ) ? 'unchanged' : 'gone';
}

const commit = ( repo, sha ) =>
	`<a href="https://github.com/${ repo }/commit/${ sha }"><samp>${ sha.slice( 0, 7 ) }</samp></a>`;

/**
 * The comment's buttons for one build, kept between markers so a later state can carry them.
 *
 * @param {Object}  build
 * @param {string}  build.repo       owner/name.
 * @param {string}  build.sha        The commit it was built from.
 * @param {string}  build.playground The Playground address, opening on the standalone app.
 * @param {?string} build.source     Source's preview, when the pull request has one.
 * @param {?string} build.developer  The developer site's preview, when it has one.
 * @return {string} Markdown.
 */
function block( { repo, sha, playground, source, developer } ) {
	const at = ( p ) => playground.replace( '?mode=seamless', `?mode=seamless&url=${ encodeURIComponent( p ) }` );
	const button = ( label, colour, logo ) =>
		`https://img.shields.io/badge/${ encodeURIComponent( label ).replace( /-/g, '--' ) }-${ colour }?style=for-the-badge${ logo ? `&logo=${ logo }&logoColor=white` : '' }`;
	const sites = Boolean( source && developer );
	// Three ways into the same Playground build, named for where each lands, and the pull
	// request's own two sites when it changes what they are built from.
	const buttons = [
		`[![Standalone app](${ button( 'Standalone app', '3858E9', 'wordpress' ) })](${ playground })`,
		`[![Listen page](${ button( 'Listen page', '3858E9', 'wordpress' ) })](${ at( '/listen/' ) })`,
		`[![Blog post](${ button( 'Blog post', '3858E9', 'wordpress' ) })](${ at( '/compositions/' ) })`,
		...( sites
			? [
				`[![Source](${ button( 'Source', '1E1E1E' ) })](${ source })`,
				`[![Developer](${ button( 'Developer', '1E1E1E' ) })](${ developer })`,
			]
			: [] ),
	].join( ' ' );
	const notes = [
		'<b>Standalone app</b> is <code>/listen/app/</code>, the installable player with no theme around it.',
		'<b>Listen page</b> is <code>/listen/</code>, the same player as a block inside the theme.',
		'<b>Blog post</b> is an album post with its Riff block.',
		...( sites ? [ '<b>Source</b> and <b>Developer</b> are source.riffpress.com and developer.riffpress.com as this branch builds them.' ] : [] ),
	].join( ' ' );
	return [
		`<!-- riff:built ${ sha } -->`,
		`Built from ${ commit( repo, sha ) }, signed in as admin.`,
		'',
		buttons,
		'',
		`<sub>${ notes }</sub>`,
		'<!-- /riff:built -->',
	].join( '\n' );
}

/**
 * The buttons a comment carries, and the build they open.
 *
 * @param {string} body The comment.
 * @return {{sha: ?string, block: ?string}} Both null when it has none.
 */
function parse( body ) {
	const m = ( body || '' ).match( /<!-- riff:built ([0-9a-f]{40}) -->[\s\S]*?<!-- \/riff:built -->/ );
	return m ? { sha: m[ 1 ], block: m[ 0 ] } : { sha: null, block: null };
}

/**
 * The comment in one state.
 *
 * @param {Object}  c
 * @param {string}  c.kind  What decide() answered.
 * @param {string}  c.repo  owner/name.
 * @param {Object}  c.pr    The pull request.
 * @param {?string} c.built The SHA its buttons open.
 * @param {?string} c.block Those buttons, from block() or parse().
 * @param {?string} c.run   The head's Playground Preview run, when there is one.
 * @return {string} The comment's body.
 */
function render( { kind, repo, pr, built, block: buttons, run } ) {
	const head = commit( repo, pr.head.sha );
	const old = built ? commit( repo, built ) : '';
	const still = buttons ? ` The buttons below are still ${ old }'s.` : '';
	const link = ( text ) => ( run ? `[${ text }](${ run })` : text );
	let status = '';
	let keep = buttons;
	switch ( kind ) {
		case 'building':
			status = buttons
				? `The head is now ${ head }, and a preview of it is ${ link( 'building' ) }.${ still }`
				: `A preview of ${ head } is ${ link( 'building' ) }.`;
			break;
		case 'approval':
			status = buttons
				? `The head is now ${ head }, and its preview is waiting for a maintainer to ${ link( 'approve the run' ) }.${ still }`
				: `The preview of ${ head } is waiting for a maintainer to ${ link( 'approve the run' ) }.`;
			break;
		case 'failed':
			status = `The preview of ${ head } ${ link( 'did not build' ) }.${ still }`;
			break;
		case 'unchanged':
			status = `The head is now ${ head }. Nothing in <a href="https://github.com/${ repo }/compare/${ built }...${ pr.head.sha }"><samp>${ built.slice( 0, 7 ) }..${ pr.head.sha.slice( 0, 7 ) }</samp></a> changes what the preview shows.`;
			break;
		case 'gone':
			status = `The head is now ${ head }, which changes nothing a preview is built from, so there is no preview of it.`;
			keep = null;
			break;
		case 'closed':
			status = `This pull request was ${ pr.merged ? 'merged' : 'closed' }, so its preview has been taken down.${ built ? ` It was last built from ${ old }.` : '' }`;
			// The buttons would open nothing now; the SHA is kept so a reopened pull request says what it last was.
			keep = built ? `<!-- riff:built ${ built } -->\n<!-- /riff:built -->` : null;
			break;
	}
	return [ MARKER, '### 🛝 Preview', '', ...( status ? [ status, '' ] : [] ), ...( keep ? [ keep, '' ] : [] ) ].join( '\n' );
}

/**
 * Which preview branches and Cloudflare deployments belong to no pull request that needs them.
 * Only names of the exact preview shapes are ever chosen.
 *
 * @param {Object}      s
 * @param {string[]}    s.refs        Branch names.
 * @param {Object[]}    s.deployments { project, id, branch }.
 * @param {Set<number>} s.open        Open pull requests that may have previews.
 * @return {{refs: string[], deployments: Object[]}} What to delete.
 */
function stale( { refs, deployments, open } ) {
	const dead = ( m ) => Boolean( m ) && ! open.has( Number( m[ 1 ] ) );
	return {
		refs: refs.filter( ( r ) => dead( r.match( BRANCH ) ) ),
		deployments: deployments.filter( ( d ) => typeof d.id === 'string' && /^[0-9a-f-]+$/.test( d.id ) && dead( ( d.branch || '' ).match( ALIAS ) ) ),
	};
}

/**
 * Cloudflare Pages, for one account: list a project's preview deployments, delete one.
 *
 * @param {Object}       c
 * @param {typeof fetch} c.fetch   fetch().
 * @param {string}       c.account The account ID.
 * @param {string}       c.token   An API token that may edit Pages.
 * @return {Object} { list( project ), remove( project, id ) }.
 */
function cloudflare( { fetch, account, token } ) {
	if ( ! /^[0-9a-f]{32}$/.test( account || '' ) || ! token ) {
		throw new Error( 'Cloudflare account ID or token missing' );
	}
	const api = ( project ) => `https://api.cloudflare.com/client/v4/accounts/${ account }/pages/projects/${ encodeURIComponent( project ) }/deployments`;
	const headers = { Authorization: `Bearer ${ token }` };
	return {
		async list( project ) {
			const out = [];
			for ( let page = 1; page <= 200; page++ ) {
				const res = await fetch( `${ api( project ) }?env=preview&per_page=25&page=${ page }`, { headers } );
				// A project that was never created has nothing to take down.
				if ( res.status === 404 ) {
					return out;
				}
				const json = await res.json();
				if ( ! res.ok || ! json.success || ! Array.isArray( json.result ) ) {
					throw new Error( `Listing ${ project }'s deployments failed (${ res.status })` );
				}
				for ( const d of json.result ) {
					out.push( { project, id: d.id, branch: d.deployment_trigger?.metadata?.branch || '' } );
				}
				const pages = json.result_info?.total_pages;
				if ( json.result.length < 25 || ( pages && page >= pages ) ) {
					return out;
				}
			}
			throw new Error( `${ project } has more deployments than one listing reads` );
		},
		async remove( project, id ) {
			const res = await fetch( `${ api( project ) }/${ encodeURIComponent( id ) }?force=true`, { method: 'DELETE', headers } );
			if ( ! res.ok && res.status !== 404 ) {
				throw new Error( `Deleting ${ project } deployment ${ id } failed (${ res.status })` );
			}
		},
	};
}

/**
 * Takes one pull request's previews down: its pr-N deployments on both projects, and, unless
 * `branch` is false, its preview-pr-N branch.
 *
 * @param {Object}                 t
 * @param {Object}                 t.github        Octokit.
 * @param {Object}                 t.repo          { owner, repo }.
 * @param {number}                 t.number        The pull request.
 * @param {?Object}                t.cf            cloudflare(), or null to leave Cloudflare alone.
 * @param {boolean}                [t.branch=true] Whether to delete the branch too.
 * @param {(line: string) => void} t.log           Where to say what went.
 */
async function takeDown( { github, repo, number, cf, branch = true, log } ) {
	if ( ! Number.isInteger( number ) || number < 1 ) {
		throw new Error( `Not a pull request number: ${ number }` );
	}
	if ( branch ) {
		try {
			await github.rest.git.deleteRef( { ...repo, ref: `heads/preview-pr-${ number }` } );
			log( `Deleted branch preview-pr-${ number }` );
		} catch ( e ) {
			if ( e.status !== 404 && e.status !== 422 ) {
				throw e;
			}
		}
	}
	if ( ! cf ) {
		return;
	}
	for ( const project of PROJECTS ) {
		for ( const d of await cf.list( project ) ) {
			if ( d.branch === `pr-${ number }` ) {
				await cf.remove( project, d.id );
				log( `Deleted ${ project } deployment ${ d.id } (pr-${ number })` );
			}
		}
	}
}

/**
 * The sticky comment: the bot's own, with the marker. Anyone can write the marker; only the
 * bot's comment is edited.
 *
 * @param {Object} github Octokit.
 * @param {Object} repo   { owner, repo }.
 * @param {number} number The pull request.
 * @return {?Object} The comment.
 */
async function sticky( github, repo, number ) {
	const comments = await github.paginate( github.rest.issues.listComments, { ...repo, issue_number: number, per_page: 100 } );
	return comments.find( ( c ) => c.user && c.user.login === BOT && c.body && c.body.includes( MARKER ) ) || null;
}

/**
 * The open pull request whose head is this commit, if one is.
 *
 * @param {Object} github Octokit.
 * @param {Object} repo   { owner, repo }.
 * @param {string} sha    The commit.
 * @return {?Object} The pull request.
 */
async function openAt( github, repo, sha ) {
	if ( ! SHA.test( sha || '' ) ) {
		throw new Error( `Not a commit SHA: ${ sha }` );
	}
	const open = await github.paginate( github.rest.pulls.list, { ...repo, state: 'open', per_page: 100 } );
	return open.find( ( p ) => p.head.sha === sha ) || null;
}

/**
 * Makes the sticky comment true to the pull request as it is now. Every workflow that touches a
 * preview ends here, and each one reads the live state rather than trusting its own event, so it
 * does not matter which of them runs last.
 *
 * @param {Object}                 s
 * @param {Object}                 s.github Octokit.
 * @param {Object}                 s.repo   { owner, repo }.
 * @param {number}                 s.number The pull request.
 * @param {?Object}                s.build  A build just published: { sha, playground, source, developer }.
 * @param {?Object}                s.failed A build whose publish failed: { sha, url }.
 * @param {(line: string) => void} s.log    Where to say what it did.
 * @return {?string} The state the comment was left in, or null when there is no comment to keep.
 */
async function sync( { github, repo, number, build = null, failed = null, log = () => {} } ) {
	const name = `${ repo.owner }/${ repo.repo }`;
	const { data: pr } = await github.rest.pulls.get( { ...repo, pull_number: number } );
	const comment = await sticky( github, repo, number );
	if ( pr.head.ref === RELEASE_BRANCH ) {
		if ( comment ) {
			await github.rest.issues.deleteComment( { ...repo, comment_id: comment.id } );
			log( `Deleted the preview comment on the release pull request #${ number }` );
		}
		return null;
	}
	if ( ! comment && ! build ) {
		return null;
	}
	const prior = build
		? { sha: build.sha, block: block( { repo: name, ...build } ) }
		: parse( comment.body );
	const carried = prior.block && /Built from/.test( prior.block ) ? prior.block : null;
	let run = null;
	let rebuilds = false;
	let compare = null;
	const paths = BUILD_PATHS();
	if ( pr.state === 'open' && failed && failed.sha === pr.head.sha ) {
		run = { status: 'completed', conclusion: 'failure', url: failed.url };
	} else if ( pr.state === 'open' && ! ( carried && prior.sha === pr.head.sha ) ) {
		const { data } = await github.rest.actions.listWorkflowRuns( { ...repo, workflow_id: 'playground-preview.yml', head_sha: pr.head.sha, event: 'pull_request', per_page: 1 } );
		const latest = data.workflow_runs[ 0 ];
		if ( latest ) {
			const url = String( latest.html_url || '' );
			run = { status: latest.status, conclusion: latest.conclusion, url: url.startsWith( `https://github.com/${ name }/actions/runs/` ) ? url : null };
		} else {
			const files = await github.paginate( github.rest.pulls.listFiles, { ...repo, pull_number: number, per_page: 100 } );
			rebuilds = matches( files.map( ( f ) => f.filename ), paths );
			if ( ! rebuilds && prior.sha ) {
				try {
					const { data: c } = await github.rest.repos.compareCommits( { ...repo, base: prior.sha, head: pr.head.sha } );
					compare = { ahead: c.status === 'ahead', files: ( c.files || [] ).map( ( f ) => f.filename ) };
				} catch {
					// The old head was force-pushed away and is gone: nothing to compare.
					compare = null;
				}
			}
		}
	}
	const kind = decide( { pr, built: carried ? prior.sha : null, run, rebuilds, compare, paths } );
	const body = render( { kind, repo: name, pr, built: prior.sha, block: carried, run: run && run.url } );
	if ( comment ) {
		if ( comment.body !== body ) {
			await github.rest.issues.updateComment( { ...repo, comment_id: comment.id, body } );
		}
	} else {
		await github.rest.issues.createComment( { ...repo, issue_number: number, body } );
	}
	log( `#${ number }: ${ kind }` );
	return kind;
}

/**
 * Deletes every preview branch and every Cloudflare preview deployment whose pull request is not
 * open, or is the release pull request, which never has a preview. It lists everything before it
 * deletes anything, so a listing that fails deletes nothing.
 *
 * @param {Object}                 w
 * @param {Object}                 w.github Octokit.
 * @param {Object}                 w.repo   { owner, repo }.
 * @param {Object}                 w.cf     cloudflare().
 * @param {(line: string) => void} w.log    Where to say what went.
 * @return {Object} What was deleted, as stale() chose it.
 */
async function sweep( { github, repo, cf, log } ) {
	const open = await github.paginate( github.rest.pulls.list, { ...repo, state: 'open', per_page: 100 } );
	if ( ! Array.isArray( open ) || open.some( ( p ) => ! Number.isInteger( p.number ) ) ) {
		throw new Error( 'Listing open pull requests returned something else' );
	}
	const keep = new Set( open.filter( ( p ) => p.head.ref !== RELEASE_BRANCH ).map( ( p ) => p.number ) );
	log( `Open pull requests that may have previews: ${ [ ...keep ].join( ', ' ) || 'none' }` );
	const refs = ( await github.paginate( github.rest.git.listMatchingRefs, { ...repo, ref: 'heads/preview-pr-', per_page: 100 } ) )
		.map( ( r ) => String( r.ref ).replace( /^refs\/heads\//, '' ) );
	const deployments = [];
	for ( const project of PROJECTS ) {
		deployments.push( ...( await cf.list( project ) ) );
	}
	const dead = stale( { refs, deployments, open: keep } );
	for ( const ref of dead.refs ) {
		await github.rest.git.deleteRef( { ...repo, ref: `heads/${ ref }` } );
		log( `Deleted branch ${ ref }` );
	}
	for ( const d of dead.deployments ) {
		await cf.remove( d.project, d.id );
		log( `Deleted ${ d.project } deployment ${ d.id } (${ d.branch })` );
	}
	log( `Swept ${ dead.refs.length } branches and ${ dead.deployments.length } deployments.` );
	return dead;
}

module.exports = {
	sweep,
	MARKER,
	BOT,
	RELEASE_BRANCH,
	PROJECTS,
	SITE_INPUTS,
	matches,
	buildPaths,
	needsSite,
	decide,
	block,
	parse,
	render,
	stale,
	cloudflare,
	takeDown,
	sticky,
	openAt,
	sync,
};

if ( require.main === module ) {
	const [ command ] = process.argv.slice( 2 );
	if ( command !== 'site' ) {
		process.stderr.write( 'Usage: preview.js site < changed-files\n' );
		process.exit( 1 );
	}
	const files = fs.readFileSync( 0, 'utf8' ).split( '\n' ).filter( Boolean );
	process.stdout.write( needsSite( files ) ? 'true\n' : 'false\n' );
}
