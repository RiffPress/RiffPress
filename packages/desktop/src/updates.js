/**
 * Updates from GitHub Releases, through electron-updater.
 *
 * Why not electron-updater's GitHub provider: this repository's releases also hold Riff, Riff
 * Lyrics and wp-api-coverage, and Riff's is the one GitHub marks as latest. The GitHub provider
 * starts from that latest release (or the newest in the feed), finds no latest-mac.yml there, and
 * fails. So the app finds the release itself: it lists the releases through the REST API, takes the
 * highest published riff-desktop-v* tag, and points electron-updater's generic provider at that
 * release's download folder, where latest.yml, latest-mac.yml and latest-linux.yml sit beside the
 * builds they describe. Nothing has to keep a stable address up to date, and a release still being
 * built is a draft, which the API does not show without a token, so no app sees it half uploaded.
 *
 * The pure functions here are unit-tested; setup() is the Electron side.
 */

const REPO = 'RiffPress/RiffPress';
const TAG_PREFIX = 'riff-desktop-v';

/**
 * Compares two x.y.z versions.
 *
 * @param {string} a Version.
 * @param {string} b Version.
 * @return {number} Negative, zero or positive.
 */
function compare( a, b ) {
	const pa = a.split( '.' ).map( Number );
	const pb = b.split( '.' ).map( Number );
	for ( let i = 0; i < 3; i++ ) {
		if ( ( pa[ i ] || 0 ) !== ( pb[ i ] || 0 ) ) {
			return ( pa[ i ] || 0 ) - ( pb[ i ] || 0 );
		}
	}
	return 0;
}

/**
 * The newest desktop release among a list from the releases API, ignoring every other package's,
 * drafts and prereleases.
 *
 * @param {Array} releases Releases, as GET /repos/{owner}/{repo}/releases returns them.
 * @return {{tag: string, version: string, page: string}|null} The release, or null.
 */
function pickRelease( releases ) {
	let best = null;
	for ( const release of Array.isArray( releases ) ? releases : [] ) {
		const tag = String( release.tag_name || '' );
		const version = tag.slice( TAG_PREFIX.length );
		if (
			release.draft ||
			release.prerelease ||
			! tag.startsWith( TAG_PREFIX ) ||
			! /^\d+\.\d+\.\d+$/.test( version )
		) {
			continue;
		}
		if ( ! best || compare( version, best.version ) > 0 ) {
			best = { tag, version, page: release.html_url };
		}
	}
	return best;
}

/**
 * The folder electron-updater's generic provider reads a release's update metadata from.
 *
 * @param {string} tag Release tag.
 * @return {string} Address.
 */
function feedUrl( tag ) {
	return `https://github.com/${ REPO }/releases/download/${ encodeURIComponent( tag ) }`;
}

/**
 * Whether codesign's description of the app shows a Developer ID signature. electron-builder signs
 * an unsigned arm64 build ad hoc, which Squirrel.Mac will not update from.
 *
 * @param {string} output What `codesign -dv --verbose=2` prints (on stderr).
 * @return {boolean} Whether it is signed with a Developer ID.
 */
function isDeveloperId( output ) {
	return /^Authority=Developer ID Application:/m.test( String( output ) );
}

/**
 * How this copy updates: 'install' downloads and installs, 'notify' says a version is out and
 * links to its release.
 *
 * macOS installs only into a signed app (Squirrel.Mac checks the new build against the running
 * one's signature). An unsigned Windows build installs, since no publisher is pinned until one is
 * signed. On Linux only the AppImage replaces itself.
 *
 * @param {Object}  options
 * @param {string}  options.platform process.platform.
 * @param {boolean} options.signed   Whether the macOS app has a Developer ID signature.
 * @param {boolean} options.appImage Whether this is running from an AppImage.
 * @return {'install'|'notify'} Mode.
 */
function updateMode( { platform, signed, appImage } ) {
	if ( platform === 'darwin' ) {
		return signed ? 'install' : 'notify';
	}
	if ( platform === 'linux' ) {
		return appImage ? 'install' : 'notify';
	}
	return 'install';
}

/**
 * Wires electron-updater into the app: a check at launch and every six hours, quietly, and one on
 * demand from the menu, which reports what it found.
 *
 * @param {Object} electron The electron module.
 * @return {{check: (options?: {manual?: boolean}) => Promise<void>}} check( { manual } ).
 */
function setup( electron ) {
	const { app, dialog, net, shell } = electron;
	const { autoUpdater } = require( 'electron-updater' );
	const { execFile } = require( 'node:child_process' );

	// For trying the updater against a local server from a source checkout: a folder holding a
	// latest*.yml. Ignored in a packaged app.
	const devFeed = ! app.isPackaged && process.env.RIFF_UPDATE_FEED;

	let mode;
	let release;
	let busy = false;
	// Versions already announced this run, so the six-hourly check doesn't ask again.
	const told = new Set();

	const signed = () =>
		new Promise( ( resolve ) => {
			if ( process.platform !== 'darwin' ) {
				return resolve( false );
			}
			const bundle = app
				.getPath( 'exe' )
				.replace( /\/Contents\/MacOS\/[^/]+$/, '' );
			execFile(
				'codesign',
				[ '-dv', '--verbose=2', bundle ],
				( error, stdout, stderr ) =>
					resolve( ! error && isDeveloperId( stderr ) )
			);
		} );

	const latest = async () => {
		if ( devFeed ) {
			return { tag: 'dev', version: '', page: devFeed, feed: devFeed };
		}
		const response = await net.fetch(
			`https://api.github.com/repos/${ REPO }/releases?per_page=100`,
			{ headers: { Accept: 'application/vnd.github+json' } }
		);
		if ( ! response.ok ) {
			throw new Error( `GitHub answered ${ response.status }` );
		}
		const found = pickRelease( await response.json() );
		return found && { ...found, feed: feedUrl( found.tag ) };
	};

	autoUpdater.autoInstallOnAppQuit = true;
	autoUpdater.forceDevUpdateConfig = Boolean( devFeed );
	autoUpdater.logger = null;
	// Errors reach check() through checkForUpdates()'s promise; an 'error' event with no listener
	// would throw.
	autoUpdater.on( 'error', () => {} );

	autoUpdater.on( 'update-downloaded', async ( info ) => {
		const { response } = await dialog.showMessageBox( {
			type: 'info',
			message: `Riff ${ info.version } is ready to install.`,
			detail: 'It installs the next time Riff quits, or now if you restart.',
			buttons: [ 'Restart Now', 'Later' ],
			defaultId: 0,
			cancelId: 1,
		} );
		if ( response === 0 ) {
			autoUpdater.quitAndInstall();
		}
	} );

	/**
	 * Looks for a newer version.
	 *
	 * @param {Object}  options
	 * @param {boolean} options.manual From the menu: say what was found, errors included.
	 */
	async function check( { manual = false } = {} ) {
		if ( busy || ( ! app.isPackaged && ! devFeed ) ) {
			if ( manual && ! busy ) {
				dialog.showMessageBox( {
					message: 'Updates are checked only in a packaged build.',
				} );
			}
			return;
		}
		busy = true;
		try {
			if ( ! mode ) {
				mode = updateMode( {
					platform: process.platform,
					signed: await signed(),
					appImage: Boolean( process.env.APPIMAGE ),
				} );
			}
			release = await latest();
			if ( ! release ) {
				if ( manual ) {
					await dialog.showMessageBox( {
						message: 'Riff is up to date.',
					} );
				}
				return;
			}
			autoUpdater.setFeedURL( {
				provider: 'generic',
				url: release.feed,
			} );
			autoUpdater.autoDownload = mode === 'install';
			const result = await autoUpdater.checkForUpdates();
			const available = result && result.isUpdateAvailable;
			if ( ! available ) {
				if ( manual ) {
					await dialog.showMessageBox( {
						message: 'Riff is up to date.',
						detail: `You have version ${ app.getVersion() }.`,
					} );
				}
				return;
			}
			if ( mode === 'notify' ) {
				if ( ! manual && told.has( result.updateInfo.version ) ) {
					return;
				}
				told.add( result.updateInfo.version );
				const { response } = await dialog.showMessageBox( {
					type: 'info',
					message: `Riff ${ result.updateInfo.version } is available.`,
					detail: `You have version ${ app.getVersion() }. This copy can’t update itself, so download the new version and replace this one.`,
					buttons: [ 'Download', 'Later' ],
					defaultId: 0,
					cancelId: 1,
				} );
				if ( response === 0 ) {
					shell.openExternal( release.page );
				}
			} else if ( manual ) {
				await dialog.showMessageBox( {
					type: 'info',
					message: `Riff ${ result.updateInfo.version } is downloading.`,
					detail: 'You’ll be asked to restart when it’s ready.',
				} );
			}
		} catch ( error ) {
			if ( manual ) {
				await dialog.showMessageBox( {
					type: 'warning',
					message: 'Couldn’t check for updates.',
					detail: error.message,
				} );
			}
		} finally {
			busy = false;
		}
	}

	return { check };
}

module.exports = {
	TAG_PREFIX,
	compare,
	pickRelease,
	feedUrl,
	isDeveloperId,
	updateMode,
	setup,
};
