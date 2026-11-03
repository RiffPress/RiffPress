'use strict';

/*
 * The timing Riff Lyrics, Riff Chords and Riff Sing share (plugins/riff-lyrics/assets/timing.js):
 * times read as LRC, ChordPro and WebVTT write them, and the song followed as the player plays it.
 * Each of the three carries the same file, so Lyrics and Chords mark a line and a chord by the same
 * rule; the first test keeps the copies the same. Run by `node --test .github/scripts/*.test.js`.
 */
const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const fs = require( 'node:fs' );
const path = require( 'node:path' );

const PLUGINS = path.join( __dirname, '..', '..', 'plugins' );
const FILE = path.join( PLUGINS, 'riff-lyrics', 'assets', 'timing.js' );

// A classic script that sets window.riffTiming, run here as the browser runs it, with a page of
// its own: a document to listen on, a player, and the clock, styles and motion setting it reads.
function load( { riff, reduced = false, overflow = () => 'visible', clock = () => 0 } = {} ) {
	const document = new EventTarget();
	const window = { riff };
	const page = {
		document,
		window,
		getComputedStyle: ( el ) => ( { overflowY: overflow( el ) } ),
		matchMedia: () => ( { matches: reduced } ),
		Date: { now: clock },
	};
	const names = Object.keys( page );
	new Function( 'globalThis', ...names, fs.readFileSync( FILE, 'utf8' ) )( window, ...names.map( ( n ) => page[ n ] ) );
	return { timing: window.riffTiming, document };
}

test( 'Riff Chords and Riff Sing carry the same timing.js as Riff Lyrics', () => {
	const own = fs.readFileSync( FILE, 'utf8' );
	for ( const slug of [ 'riff-chords', 'riff-sing' ] ) {
		const copy = fs.readFileSync( path.join( PLUGINS, slug, 'assets', 'timing.js' ), 'utf8' );
		assert.equal( copy, own, `plugins/${ slug }/assets/timing.js differs; copy Riff Lyrics' over it` );
	}
} );

test( 'each plugin loads its own copy before the scripts that read it', () => {
	for ( const [ slug, file, readers ] of [
		[ 'riff-lyrics', 'class-lyrics.php', [ 'riff-lyrics' ] ],
		[ 'riff-chords', 'class-chords.php', [ 'riff-chords-chart', 'riff-chords' ] ],
		[ 'riff-sing', 'class-sing.php', [ 'riff-sing' ] ],
	] ) {
		const php = fs.readFileSync( path.join( PLUGINS, slug, 'src', file ), 'utf8' );
		assert.match( php, new RegExp( `'${ slug }-timing', [A-Z_]+URL \\. 'assets/timing\\.js'` ), `${ slug } loads its timing.js` );
		for ( const handle of readers ) {
			const deps = php.match( new RegExp( `wp_enqueue_script\\( '${ handle }', [^,]+, array\\(([^)]*)\\)` ) );
			assert.ok( deps, `${ handle } is enqueued` );
			assert.match( deps[ 1 ], new RegExp( `'${ slug }-timing'` ), `${ handle } depends on ${ slug }-timing` );
		}
	}
} );

test( 'a time is read as LRC, ChordPro and WebVTT write it', () => {
	const { timing } = load();
	assert.equal( timing.seconds( '01:05.32' ), 1 * 60 + 5.32, 'LRC, as Riff Lyrics read it before' );
	assert.equal( timing.seconds( '1:05' ), 65 );
	assert.equal( timing.seconds( '00:00.5' ), 0.5 );
	assert.equal( timing.seconds( '00:01:05.320' ), 65.32, 'WebVTT, with its hours' );
	assert.equal( timing.seconds( '01:00:00.000' ), 3600 );
	assert.equal( timing.seconds( '02:03.000' ), 123, 'WebVTT, without them' );
	assert.equal( timing.seconds( '120:00.00' ), 7200, 'LRC minutes past an hour' );
} );

test( 'only a time in brackets is read as one; a chord or a name is not', () => {
	const { timing } = load();
	assert.equal( timing.stamp( '00:12.50' ), 12.5 );
	assert.equal( timing.stamp( '1:02' ), 62 );
	assert.equal( timing.stamp( '00:12.505' ), 12.505 );
	for ( const text of [ 'G', 'Am7', 'N.C.', 'ar:Someone', '', '00:12.5050', '1234:00', '00:123', '00:01:05.320', ' 00:12.50' ] ) {
		assert.equal( timing.stamp( text ), null, `${ JSON.stringify( text ) } is not a time` );
	}
} );

test( 'a time has come a moment before it, as the player says where it is a few times a second', () => {
	const { timing } = load();
	assert.equal( timing.due( 10, 10 ), true );
	assert.equal( timing.due( 10.05, 10 ), true );
	assert.equal( timing.due( 10.051, 10 ), false );
	assert.equal( timing.due( 9, 10 ), true );
} );

test( 'the thing being played is the last whose time has come', () => {
	const { timing } = load();
	const lines = [ { time: 1 }, { time: 2 }, { time: 2 }, { time: 5 } ];
	assert.equal( timing.at( lines, 0 ), -1, 'before the first' );
	assert.equal( timing.at( lines, 0.96 ), 0, 'just before it, as it is heard' );
	assert.equal( timing.at( lines, 1.5 ), 0 );
	assert.equal( timing.at( lines, 2 ), 2, 'the last of two at the same time' );
	assert.equal( timing.at( lines, 4.9 ), 2 );
	assert.equal( timing.at( lines, 60 ), 3, 'the last, to the end' );
	assert.equal( timing.at( [], 3 ), -1, 'nothing to follow' );
} );

test( 'where the song is: the player\'s time, or 0 until it starts', () => {
	assert.equal( load().timing.now(), 0, 'no player' );
	assert.equal( load( { riff: {} } ).timing.now(), 0, 'the #riff element, before the player starts' );
	assert.equal( load( { riff: { time: () => 42.5 } } ).timing.now(), 42.5 );
} );

test( 'each riff:time is passed on with its time and its detail', () => {
	const { timing, document } = load();
	const heard = [];
	timing.listen( ( time, detail ) => heard.push( [ time, detail ] ) );
	const tell = ( detail ) => {
		const e = new Event( 'riff:time' );
		e.detail = detail;
		document.dispatchEvent( e );
	};
	tell( { time: 12.5, duration: 200 } );
	tell( { time: 'nonsense' } );
	tell( undefined );
	assert.deepEqual( heard, [
		[ 12.5, { time: 12.5, duration: 200 } ],
		[ 0, { time: 'nonsense' } ],
		[ 0, {} ],
	] );
} );

test( 'scrolling the view by hand holds the following off for four seconds; elsewhere it does not', () => {
	let now = 100000;
	const { timing, document } = load( { clock: () => now } );
	const view = { inView: true };
	const scrolled = timing.scrolling( ( target ) => target?.inView );
	const scroll = ( type, target ) => {
		const e = new Event( type );
		Object.defineProperty( e, 'target', { value: target } );
		document.dispatchEvent( e );
	};
	assert.equal( scrolled(), false, 'not scrolled yet' );
	scroll( 'wheel', { inView: false } );
	assert.equal( scrolled(), false, 'the page around it is not the view' );
	scroll( 'wheel', view );
	assert.equal( scrolled(), true );
	now += 4000;
	assert.equal( scrolled(), true, 'for four seconds' );
	now += 1;
	assert.equal( scrolled(), false, 'then the following takes over again' );
	scroll( 'touchmove', view );
	assert.equal( scrolled(), true, 'a finger as a wheel' );
} );

test( 'a line is scrolled to the middle of the box it scrolls in, at once when motion is reduced', () => {
	// A box 300 high that scrolls, at the top of the page, scrolled 100 down, holding a line 20 high
	// at 250 on screen: the middle puts the line's top at 140.
	const box = ( overflowY, scrolls = true ) => ( {
		overflowY,
		scrollTop: 100,
		scrollHeight: scrolls ? 1000 : 300,
		clientHeight: 300,
		getBoundingClientRect: () => ( { top: 0, height: 300 } ),
		scrollTo( to ) {
			this.went = to;
		},
	} );
	const outer = box( 'auto' );
	const inner = { ...box( 'visible' ), parentElement: outer };
	const line = { parentElement: inner, getBoundingClientRect: () => ( { top: 250, height: 20 } ) };
	const overflow = ( el ) => el.overflowY;

	load( { overflow } ).timing.centre( line );
	assert.deepEqual( outer.went, { top: 210, behavior: 'smooth' }, 'the nearest box around it that scrolls' );
	assert.equal( inner.went, undefined );

	const given = box( 'hidden' );
	load( { overflow, reduced: true } ).timing.centre( line, given );
	assert.deepEqual( given.went, { top: 210, behavior: 'auto' }, 'the box given, at once' );

	const short = box( 'auto', false );
	load( { overflow } ).timing.centre( line, short );
	assert.equal( short.went, undefined, 'a box with nothing to scroll is left alone' );
	load( { overflow } ).timing.centre( line, null );
	load( { overflow } ).timing.centre( { parentElement: null } );
} );
