#!/usr/bin/env node
/**
 * Checks this machine has what working on Riff needs, at the versions the repository pins, and
 * says how to get what is missing in the way that suits the machine: the version manager already
 * installed (nvm, fnm, Volta, mise, asdf) for Node, and Homebrew, winget or the system's package
 * manager for the rest. It changes nothing; it only looks and tells.
 *
 * Usage: npm run doctor
 */
const { execFileSync } = require( 'node:child_process' );
const fs = require( 'node:fs' );
const path = require( 'node:path' );

const root = path.join( __dirname, '..' );
const pinned = ( file ) => fs.readFileSync( path.join( root, file ), 'utf8' ).trim();
const NODE = pinned( '.nvmrc' );
const PHP = pinned( '.php-version' );
const PHP_MIN = JSON.parse( pinned( 'composer.json' ) ).require.php.replace( /[^0-9.]/g, '' );

const run = ( cmd, args ) => {
	try {
		return execFileSync( cmd, args, { encoding: 'utf8', stdio: [ 'ignore', 'pipe', 'ignore' ] } ).trim();
	} catch {
		return null;
	}
};
const has = ( cmd ) => run( process.platform === 'win32' ? 'where' : 'which', [ cmd ] ) !== null;
const major = ( v ) => Number( String( v ).replace( /^v/, '' ).split( '.' )[ 0 ] );
const atLeast = ( v, min ) => {
	const a = String( v ).split( '.' ).map( Number );
	const b = String( min ).split( '.' ).map( Number );
	for ( let i = 0; i < Math.max( a.length, b.length ); i++ ) {
		if ( ( a[ i ] || 0 ) !== ( b[ i ] || 0 ) ) {
			return ( a[ i ] || 0 ) > ( b[ i ] || 0 );
		}
	}
	return true;
};

const mac = process.platform === 'darwin';
const win = process.platform === 'win32';
const pkg = ( { brew, winget, apt } ) => {
	if ( mac ) {
		return has( 'brew' ) ? `brew install ${ brew }` : `install Homebrew (https://brew.sh), then: brew install ${ brew }`;
	}
	if ( win ) {
		return `winget install ${ winget }`;
	}
	return has( 'apt-get' ) ? `sudo apt-get install ${ apt }` : `install ${ apt } with your package manager`;
};
// Node through whichever version manager is here, reading .nvmrc, before falling back to a package.
const nodeFix = () => {
	if ( has( 'mise' ) ) {
		return `mise use node@${ NODE }`;
	}
	if ( has( 'fnm' ) ) {
		return 'fnm use --install-if-missing';
	}
	if ( process.env.NVM_DIR ) {
		return 'nvm install && nvm use';
	}
	if ( has( 'volta' ) ) {
		return `volta install node@${ NODE }`;
	}
	if ( has( 'asdf' ) ) {
		return `asdf install nodejs latest:${ NODE } && asdf set nodejs latest:${ NODE }`;
	}
	return `${ pkg( { brew: `node@${ NODE }`, winget: 'OpenJS.NodeJS.LTS', apt: 'nodejs' } ) } (or a version manager such as fnm, which reads .nvmrc)`;
};

const checks = [
	{
		// CI runs the pinned major; a newer one works, and is said so.
		name: `Node ${ NODE } or newer`,
		ok: major( process.version ) >= major( NODE ),
		found: major( process.version ) > major( NODE ) ? `${ process.version }; CI runs ${ NODE }` : process.version,
		fix: nodeFix,
	},
	{
		name: 'npm',
		ok: has( 'npm' ),
		found: run( 'npm', [ '--version' ] ),
		fix: () => 'comes with Node',
	},
	{
		name: `PHP ${ PHP } (${ PHP_MIN } or newer)`,
		found: run( 'php', [ '-r', 'echo PHP_VERSION;' ] ),
		get ok() {
			return !! this.found && atLeast( this.found, PHP_MIN );
		},
		fix: () => ( has( 'mise' ) ? `mise use php@${ PHP }` : pkg( { brew: `php@${ PHP }`, winget: 'PHP.PHP.8.3', apt: `php${ PHP }-cli php${ PHP }-xml php${ PHP }-mbstring` } ) ),
	},
	{
		name: 'Composer',
		found: run( 'composer', [ '--version', '--no-ansi' ] )?.match( /\d+\.\d+\.\d+/ )?.[ 0 ],
		get ok() {
			return !! this.found;
		},
		fix: () => pkg( { brew: 'composer', winget: 'Composer.Composer', apt: 'composer' } ),
	},
	{
		name: 'Docker, running (for wp-env)',
		found: run( 'docker', [ 'info', '--format', '{{.ServerVersion}}' ] ),
		get ok() {
			return !! this.found;
		},
		fix: () => ( has( 'docker' ) ? 'start Docker Desktop (or the Docker service)' : pkg( { brew: '--cask docker', winget: 'Docker.DockerDesktop', apt: 'docker.io' } ) ),
	},
	{
		name: 'Git hooks wired (pre-commit lint and tests)',
		found: run( 'git', [ 'config', 'core.hooksPath' ] ),
		get ok() {
			return !! this.found && path.resolve( root, this.found ) === path.join( root, '.githooks' );
		},
		fix: () => 'npm install (its prepare script sets core.hooksPath)',
	},
	{
		name: 'Node packages installed',
		ok: fs.existsSync( path.join( root, 'node_modules', '@wordpress', 'scripts' ) ),
		found: null,
		fix: () => 'npm ci',
	},
	{
		name: 'PHP packages installed',
		ok: fs.existsSync( path.join( root, 'vendor', 'bin', 'phpcs' ) ),
		found: null,
		fix: () => 'composer install',
	},
];

let missing = 0;
for ( const c of checks ) {
	const ok = c.ok;
	missing += ok ? 0 : 1;
	process.stdout.write( `${ ok ? '✓' : '✗' } ${ c.name }${ c.found ? ` (${ c.found })` : '' }\n` );
	if ( ! ok ) {
		process.stdout.write( `    ${ c.fix() }\n` );
	}
}
process.stdout.write(
	missing
		? `\n${ missing } to sort out, then: npm run env:start && npm run seed\n`
		: '\nAll set. npm run env:start && npm run seed, then http://localhost:8890\n'
);
process.exitCode = missing ? 1 : 0;
