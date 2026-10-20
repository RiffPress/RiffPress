'use strict';

const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const { releases, withChangelog } = require( './readme-changelog.js' );

const CHANGELOG = `# Changelog

## [4.2.0](https://github.com/RiffPress/RiffPress/compare/v4.1.0...v4.2.0) (2026-10-20)


### Features

* the bar shows the track ([#10](https://github.com/RiffPress/RiffPress/issues/10)) ([abc1234](https://github.com/RiffPress/RiffPress/commit/abc1234))


### Bug Fixes

* **player:** a long title wraps ([#11](https://github.com/RiffPress/RiffPress/issues/11)) ([def5678](https://github.com/RiffPress/RiffPress/commit/def5678))

## 4.1.0 (2026-10-19)


### Miscellaneous Chores

* nothing a listener sees
`;

test( 'each release becomes sentences, without its links, and a release with nothing to tell is left out', () => {
	assert.deepStrictEqual( releases( CHANGELOG ), [
		{ version: '4.2.0', lines: [ 'The bar shows the track.', 'Fixed: a long title wraps.' ] },
	] );
} );

test( 'the changelog section is replaced and what follows it is kept', () => {
	const readme = '=== Riff ===\nStable tag: 4.2.0\n\n== Changelog ==\n\n= 4.0.0 =\n* Old.\n\n== Upgrade Notice ==\n\nNone.\n';
	const out = withChangelog( readme, releases( CHANGELOG ) );
	assert.match( out, /== Changelog ==\n\n= 4\.2\.0 =\n\* The bar shows the track\.\n\* Fixed: a long title wraps\.\n\nEvery release/ );
	assert.doesNotMatch( out, /= 4\.0\.0 =/ );
	assert.match( out, /\n== Upgrade Notice ==\n\nNone\.\n$/ );
	assert.strictEqual( withChangelog( out, releases( CHANGELOG ) ), out, 'running it again changes nothing' );
} );

test( 'a readme without a changelog section is an error, not a silent no-op', () => {
	assert.throws( () => withChangelog( '=== Riff ===\n', [] ), /Changelog/ );
} );
