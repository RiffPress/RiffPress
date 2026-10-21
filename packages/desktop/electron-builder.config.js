/**
 * electron-builder: a dmg and a zip for macOS (the zip is what the updater downloads), an NSIS
 * installer for Windows, an AppImage for Linux, each with its latest*.yml update metadata.
 *
 * Signing switches itself on. electron-builder signs when CSC_LINK and CSC_KEY_PASSWORD (macOS, or
 * WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD for Windows) are set, and notarisation runs only when the
 * Apple ID secrets are there too. Without them the builds are unsigned and the build still passes;
 * an unsigned Mac app tells the user about a new version instead of installing it (src/updates.js).
 */
/**
 * Whether an environment variable is set and not empty, as a secret GitHub doesn't have is.
 *
 * @param {string} name Variable.
 * @return {boolean} Whether it is set.
 */
const env = ( name ) => Boolean( process.env[ name ] );
const signMac = env( 'CSC_LINK' ) && env( 'CSC_KEY_PASSWORD' );
const notarize =
	signMac &&
	env( 'APPLE_ID' ) &&
	env( 'APPLE_APP_SPECIFIC_PASSWORD' ) &&
	env( 'APPLE_TEAM_ID' );

module.exports = {
	appId: 'com.riffpress.riff',
	productName: 'Riff',
	copyright: 'GPL-2.0-or-later',
	directories: { output: 'dist', buildResources: 'resources' },
	files: [ 'src/**/*', 'package.json' ],
	// No native modules, so nothing to rebuild against Electron's Node.
	npmRebuild: false,
	icon: '../../plugins/riff/features/listen/icons/icon-512.png',
	// The generic provider, at this version's own release. The app does not read this address to
	// update: it finds the newest desktop release itself (src/updates.js). electron-builder needs a
	// publish target to write latest*.yml at all.
	publish: {
		provider: 'generic',
		url: 'https://github.com/RiffPress/RiffPress/releases/download/riff-desktop-v${version}',
	},
	electronFuses: {
		runAsNode: false,
		enableNodeOptionsEnvironmentVariable: false,
		// Playwright attaches through --inspect, so the build the e2e suite drives keeps it.
		enableNodeCliInspectArguments: env( 'RIFF_DESKTOP_E2E' ),
		onlyLoadAppFromAsar: true,
		enableEmbeddedAsarIntegrityValidation: true,
		grantFileProtocolExtraPrivileges: false,
		// Not yet: an unsigned build's keychain entry changes with every version, so macOS would ask
		// for the keychain password after each update. Turn on with signing; cookies set before then
		// are dropped once, which means signing in again.
		enableCookieEncryption: false,
	},
	mac: {
		category: 'public.app-category.music',
		target: [
			{ target: 'dmg', arch: [ 'arm64', 'x64' ] },
			{ target: 'zip', arch: [ 'arm64', 'x64' ] },
		],
		artifactName: '${productName}-${version}-${arch}.${ext}',
		// Without a certificate, ad hoc: an arm64 Mac runs nothing unsigned, and the fuses above
		// change the binary after Electron's own ad hoc signature. The hardened runtime, which
		// notarisation needs, comes with a real signature only; ad hoc it would refuse Electron's
		// own frameworks.
		identity: signMac ? undefined : '-',
		hardenedRuntime: signMac,
		notarize,
	},
	dmg: { artifactName: '${productName}-${version}-${arch}.${ext}' },
	win: {
		target: [ { target: 'nsis', arch: [ 'x64' ] } ],
		artifactName: '${productName}-Setup-${version}.${ext}',
	},
	nsis: { oneClick: true, perMachine: false },
	linux: {
		target: [ { target: 'AppImage', arch: [ 'x64' ] } ],
		category: 'AudioVideo',
		artifactName: '${productName}-${version}-${arch}.${ext}',
		executableName: 'riff',
	},
};
