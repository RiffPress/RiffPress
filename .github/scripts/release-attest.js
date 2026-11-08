/**
 * Every zip a workflow puts on a GitHub release is attested first, so a host can check where it
 * came from (docs/verify.md). This reads each workflow's jobs and names the ones that upload a zip,
 * or build one with build-zip.sh, without an attest-build-provenance step for it, pinned to a
 * commit, that always runs, runs before the upload and has the permissions it needs. An upload it
 * can't follow (one that names no zip, say a folder) fails too, so a new way to release never
 * slips past it.
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
 * A job's steps, each as the line it starts on and its text, with a shell line continued by a
 * trailing backslash joined to the next, so a command split over lines reads as one.
 *
 * @param {string[]} lines A job's lines.
 * @return {{at: number, text: string}[]} Its steps.
 */
function steps( lines ) {
	const found = [];
	lines.forEach( ( line, at ) => {
		if ( /^ {4,6}-\s/.test( line ) ) {
			found.push( { at, text: line } );
		} else if ( found.length ) {
			found[ found.length - 1 ].text += '\n' + line;
		}
	} );
	for ( const step of found ) {
		step.text = step.text.replace( /\\\n\s*/g, ' ' );
	}
	return found;
}

// Ways a step puts files on a release: gh's release commands and its API's asset upload, and the
// actions that do it for a workflow.
const UPLOAD = /\bgh\s+release\s+(?:upload|create)\b|\bgh\s+api\b[^\n]*\/assets\b|uploads\.github\.com|\buses:\s*(?:softprops\/action-gh-release|ncipollo\/release-action|svenstaro\/upload-release-action|actions\/upload-release-asset)@/;
const ZIP = /[\w./${}*?-]+\.zip\b/g;

/**
 * What one job gets wrong about attesting what it releases.
 *
 * @param {{name: string, lines: string[]}} job A job.
 * @return {string[]} One line per problem; none when it attests everything it releases.
 */
function problems( job ) {
	const body = job.lines.join( '\n' );
	const all = steps( job.lines );
	const out = [];
	const uploads = [];
	for ( const step of all ) {
		if ( ! UPLOAD.test( step.text ) ) {
			continue;
		}
		const files = [ ...new Set( step.text.match( ZIP ) || [] ) ];
		if ( ! files.length ) {
			out.push( 'uploads to a release without naming each zip, so its attestation cannot be checked' );
		}
		for ( const file of files ) {
			uploads.push( { file, at: step.at } );
		}
	}
	const built = [ ...body.matchAll( /build-zip\.sh\s+([a-z0-9-]+)/g ) ].map(
		( m ) => `build/${ m[ 1 ] }.zip`
	);
	if ( ! out.length && ! uploads.length && ! built.length ) {
		return [];
	}

	const attests = [];
	for ( const step of all ) {
		if ( ! /actions\/attest-build-provenance@/.test( step.text ) ) {
			continue;
		}
		const pinned = ATTEST.test( step.text.split( '\n' ).find( ( l ) => /attest-build-provenance@/.test( l ) ) );
		// A step that can be skipped, or fail without failing the job, attests nothing for certain.
		const certain = ! /^\s*(?:-\s+)?if:/m.test( step.text ) && ! /^\s*continue-on-error:\s*(?!false\b)\S/m.test( step.text );
		const subjects = [ ...step.text.matchAll( /subject-path:\s*['"]?([^'"#\s]+)/g ) ].map( ( m ) => m[ 1 ] );
		if ( ! pinned ) {
			out.push( 'uses attest-build-provenance without pinning it to a commit' );
		}
		if ( ! certain ) {
			out.push( 'attests in a step that can be skipped or fail without failing the job' );
		}
		attests.push( { at: step.at, subjects: certain ? subjects : [] } );
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

module.exports = { jobs, steps, problems, check };

if ( require.main === module ) {
	const found = check( path.join( __dirname, '..', 'workflows' ) );
	for ( const p of found ) {
		console.error( p );
	}
	process.exit( found.length ? 1 : 0 );
}
