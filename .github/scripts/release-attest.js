/**
 * Every zip a workflow puts on a GitHub release is attested first, so a host can check where it
 * came from (docs/verify.md). This reads each workflow's jobs and names the ones that upload a zip,
 * or build one with build-zip.sh, without an attest-build-provenance step for it, pinned to a
 * commit, that runs before the upload and with the permissions it needs.
 *
 * Workflows are read as text, not parsed as YAML: the scripts' tests run without npm installing
 * anything, and every workflow here is written in the same two-space shape.
 *
 *   node .github/scripts/release-attest.js   (exits 1 and names each job that would ship unattested)
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );

const ATTEST = /^\s*(?:-\s+)?uses:\s*actions\/attest-build-provenance@([0-9a-f]{40})\b/;

/**
 * The jobs of a workflow, each as its name and its lines.
 *
 * @param {string} text A workflow file.
 * @return {{name: string, lines: string[]}[]} Its jobs.
 */
function jobs( text ) {
	const lines = text.split( '\n' );
	const start = lines.findIndex( ( l ) => /^jobs:\s*$/.test( l ) );
	if ( start < 0 ) {
		return [];
	}
	const found = [];
	for ( let i = start + 1; i < lines.length; i++ ) {
		const line = lines[ i ];
		if ( /^\S/.test( line ) ) {
			break;
		}
		const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec( line );
		if ( m ) {
			found.push( { name: m[ 1 ], lines: [] } );
		} else if ( found.length ) {
			found[ found.length - 1 ].lines.push( line );
		}
	}
	return found;
}

/**
 * What one job gets wrong about attesting what it releases.
 *
 * @param {{name: string, lines: string[]}} job A job.
 * @return {string[]} One line per problem; none when it attests everything it releases.
 */
function problems( job ) {
	const body = job.lines.join( '\n' );
	const uploads = [];
	job.lines.forEach( ( line, at ) => {
		if ( /\bgh release upload\b/.test( line ) ) {
			for ( const file of line.match( /[\w./${}-]+\.zip\b/g ) || [] ) {
				uploads.push( { file, at } );
			}
		}
	} );
	const built = [ ...body.matchAll( /build-zip\.sh\s+([a-z0-9-]+)/g ) ].map(
		( m ) => `build/${ m[ 1 ] }.zip`
	);
	if ( ! uploads.length && ! built.length ) {
		return [];
	}

	const attests = [];
	job.lines.forEach( ( line, at ) => {
		if ( /actions\/attest-build-provenance@/.test( line ) ) {
			const pinned = ATTEST.test( line );
			const subjects = [];
			for ( let i = at + 1; i < job.lines.length; i++ ) {
				if ( /^\s*-\s/.test( job.lines[ i ] ) ) {
					break;
				}
				const m = /subject-path:\s*['"]?([^'"#\s]+)/.exec( job.lines[ i ] );
				if ( m ) {
					subjects.push( m[ 1 ] );
				}
			}
			attests.push( { at, pinned, subjects } );
		}
	} );

	const out = [];
	for ( const a of attests ) {
		if ( ! a.pinned ) {
			out.push( 'uses attest-build-provenance without pinning it to a commit' );
		}
	}
	const covers = ( file, before = Infinity ) =>
		attests.some( ( a ) => a.at < before && a.subjects.includes( file ) );
	for ( const { file, at } of uploads ) {
		if ( ! covers( file, at ) ) {
			out.push( `uploads ${ file } without attesting it first` );
		}
	}
	for ( const file of built ) {
		if ( ! covers( file ) ) {
			out.push( `builds ${ file } without attesting it` );
		}
	}
	if ( attests.length ) {
		for ( const perm of [ 'id-token', 'attestations' ] ) {
			if ( ! new RegExp( `^\\s+${ perm }:\\s*write\\b`, 'm' ).test( body ) ) {
				out.push( `attests without ${ perm }: write` );
			}
		}
	}
	return out;
}

/**
 * Every problem in every workflow of a directory, as "file: job problem".
 *
 * @param {string} dir The workflows directory.
 * @return {string[]} The problems.
 */
function check( dir ) {
	const out = [];
	for ( const file of fs.readdirSync( dir ).filter( ( f ) => /\.ya?ml$/.test( f ) ).sort() ) {
		const text = fs.readFileSync( path.join( dir, file ), 'utf8' );
		for ( const job of jobs( text ) ) {
			for ( const p of problems( job ) ) {
				out.push( `${ file }: ${ job.name } ${ p }` );
			}
		}
	}
	return out;
}

module.exports = { jobs, problems, check };

if ( require.main === module ) {
	const found = check( path.join( __dirname, '..', 'workflows' ) );
	for ( const p of found ) {
		console.error( p );
	}
	process.exit( found.length ? 1 : 0 );
}
