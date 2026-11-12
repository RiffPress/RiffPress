/**
 * The release train's own checks, run by release-please.yml with nobody watching.
 *
 * `zip` reads a built release zip, before it is attested, uploaded or published, and fails unless
 * the version inside it is the tag's: the plugin header's Version, its version define (when it has
 * one) and readme.txt's Stable tag. sync-versions.sh writes those on the release pull request; this
 * is the check at the tag that what ships says what the tag says, since WordPress.org reads the
 * Stable tag and a site reads the header.
 *
 * `releases` reads every GitHub release and fails when a package's release is still a draft, or is
 * published without its zip. A release job that fails half way leaves its tag and a draft behind,
 * and release-please never comes back to it, so this names it on every run until someone finishes
 * it (docs/ecosystem.md, "When the release train stops").
 *
 * `tree` does the same for the checkout against .release-please-manifest.json, in CI, so a release
 * pull request whose versions were never synced is red before it can merge, not after it is tagged.
 *
 *   node .github/scripts/release-check.js zip <tag> <zip>
 *   node .github/scripts/release-check.js tree
 *   node .github/scripts/release-check.js releases   (reads `gh api`; GH_TOKEN and GH_REPO set)
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );
const { execFileSync } = require( 'node:child_process' );

const root = path.join( __dirname, '..', '..' );

/**
 * Each package release-please releases: its component (the tag's prefix), its folder, and the zip
 * its release carries, or null for one that ships no zip.
 *
 * @param {Object} config release-please-config.json.
 * @return {{component: string, folder: string, zip: string|null}[]} The packages.
 */
function packages( config ) {
	return Object.entries( config.packages ).map( ( [ folder, pkg ] ) => ( {
		component: pkg.component,
		folder,
		zip: folder.startsWith( 'plugins/' ) ? `${ pkg.component }.zip` : null,
	} ) );
}

/**
 * The component and version a tag names, as release-please writes it: `<component>-v<version>`.
 *
 * @param {string} tag A tag, e.g. riff-sign-in-v0.6.0.
 * @return {{component: string, version: string}|null} Its parts, or null.
 */
function parseTag( tag ) {
	const match = /^([a-z0-9-]+)-v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec( tag );
	return match ? { component: match[ 1 ], version: match[ 2 ] } : null;
}

/**
 * What is wrong with a plugin's version strings against the version it is released as.
 *
 * @param {string} version  The tag's version.
 * @param {string} mainFile The plugin's main file.
 * @param {string} readme   Its readme.txt.
 * @return {string[]} One line per problem; empty when all agree.
 */
function versionProblems( version, mainFile, readme ) {
	const found = [];
	const header = /^[ \t/*]*Version:\s*(\S+)\s*$/m.exec( mainFile );
	if ( ! header ) {
		found.push( 'the main file has no Version: header' );
	} else if ( header[ 1 ] !== version ) {
		found.push( `the header says Version: ${ header[ 1 ] }` );
	}
	const define = /^define\(\s*'([A-Z0-9_]+_VERSION)',\s*'([^']*)'\s*\);/m.exec( mainFile );
	if ( define && define[ 2 ] !== version ) {
		found.push( `${ define[ 1 ] } is ${ define[ 2 ] }` );
	}
	const stable = /^Stable tag:\s*(\S+)\s*$/m.exec( readme );
	if ( ! stable ) {
		found.push( 'readme.txt has no Stable tag' );
	} else if ( stable[ 1 ] !== version ) {
		found.push( `readme.txt says Stable tag: ${ stable[ 1 ] }` );
	}
	return found;
}

/**
 * What is wrong with the GitHub releases of the packages.
 *
 * @param {object[]} releases The repository's releases, as the REST API lists them.
 * @param {object[]} pkgs     packages().
 * @return {string[]} One line per release that did not finish.
 */
function releaseProblems( releases, pkgs ) {
	const byComponent = new Map( pkgs.map( ( pkg ) => [ pkg.component, pkg ] ) );
	const found = [];
	for ( const release of releases ) {
		const tag = parseTag( release.tag_name || '' );
		const pkg = tag && byComponent.get( tag.component );
		if ( ! pkg ) {
			continue;
		}
		const name = release.tag_name;
		if ( release.draft ) {
			found.push(
				`${ name } is still a draft: release-please tagged it and its release job did not finish. ` +
					`If the job's log says the zip "is not ${ tag.version }", the tag is on a commit whose versions were never synced; ` +
					`it can never build, so delete the draft and its tag (gh release delete ${ name } --cleanup-tag --yes) and release from a synced commit. ` +
					`Otherwise re-run the failed job (docs/ecosystem.md, "When the release train stops").`
			);
		} else if ( pkg.zip && ! ( release.assets || [] ).some( ( asset ) => asset.name === pkg.zip ) ) {
			found.push(
				`${ name } is published without ${ pkg.zip }: build it from the tag with .github/scripts/build-zip.sh ${ pkg.component } and attach it (gh release upload ${ name } build/${ pkg.zip }).`
			);
		}
	}
	return found;
}

/**
 * One file from a zip, through unzip, which every runner has.
 *
 * @param {string} zip   The zip.
 * @param {string} entry The path inside it.
 * @return {string} Its text, or '' when it is not there.
 */
function fromZip( zip, entry ) {
	try {
		return execFileSync( 'unzip', [ '-p', zip, entry ], { encoding: 'utf8', stdio: [ 'ignore', 'pipe', 'ignore' ] } );
	} catch {
		return '';
	}
}

function main( argv ) {
	const config = JSON.parse( fs.readFileSync( path.join( root, 'release-please-config.json' ), 'utf8' ) );
	const pkgs = packages( config );
	const [ command, tagName, zip ] = argv;

	if ( command === 'zip' ) {
		const tag = parseTag( tagName || '' );
		const pkg = tag && pkgs.find( ( p ) => p.component === tag.component && p.zip );
		if ( ! pkg || ! zip ) {
			console.error( `release-check.js zip: ${ tagName } is not a plugin's release tag, or no zip was given` );
			return 1;
		}
		const name = pkg.component;
		const found = versionProblems( tag.version, fromZip( zip, `${ name }/${ name }.php` ), fromZip( zip, `${ name }/readme.txt` ) );
		for ( const problem of found ) {
			console.log( `::error::${ path.basename( zip ) } is not ${ tag.version }: ${ problem }` );
		}
		if ( ! found.length ) {
			console.log( `${ path.basename( zip ) } is ${ tag.version } in its header, its define and its Stable tag.` );
		}
		return found.length ? 1 : 0;
	}

	if ( command === 'tree' ) {
		const manifest = JSON.parse( fs.readFileSync( path.join( root, '.release-please-manifest.json' ), 'utf8' ) );
		let failed = 0;
		for ( const pkg of pkgs.filter( ( p ) => p.zip ) ) {
			const dir = path.join( root, pkg.folder );
			const found = versionProblems(
				manifest[ pkg.folder ],
				fs.readFileSync( path.join( dir, `${ pkg.component }.php` ), 'utf8' ),
				fs.readFileSync( path.join( dir, 'readme.txt' ), 'utf8' )
			);
			for ( const problem of found ) {
				console.log( `::error::${ pkg.component } is ${ manifest[ pkg.folder ] } in the manifest, but ${ problem } (scripts/sync-versions.sh ${ pkg.component })` );
			}
			failed += found.length;
		}
		if ( ! failed ) {
			console.log( 'Every plugin says the version the manifest gives it.' );
		}
		return failed ? 1 : 0;
	}

	if ( command === 'releases' ) {
		const releases = JSON.parse(
			execFileSync( 'gh', [ 'api', '--paginate', '--slurp', `repos/${ process.env.GH_REPO }/releases?per_page=100` ], { encoding: 'utf8' } )
		).flat();
		const found = releaseProblems( releases, pkgs );
		for ( const problem of found ) {
			console.log( `::error::${ problem }` );
		}
		if ( ! found.length ) {
			console.log( 'Every package release is published with its zip.' );
		}
		return found.length ? 1 : 0;
	}

	console.error( 'usage: release-check.js zip <tag> <zip> | tree | releases' );
	return 2;
}

if ( require.main === module ) {
	process.exitCode = main( process.argv.slice( 2 ) );
}

module.exports = { packages, parseTag, versionProblems, releaseProblems };
