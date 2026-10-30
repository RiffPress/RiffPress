/**
 * When the Listen app's window is out of sight. Run by `npm test` in this package.
 */
const assert = require( 'node:assert/strict' );
const { EventEmitter } = require( 'node:events' );
const { test } = require( 'node:test' );
const { watchAway } = require( '../src/away' );

test( 'the window minimised, hidden, restored or shown says so', () => {
	const told = [];
	const win = new EventEmitter();
	watchAway( new EventEmitter(), win, ( out ) => told.push( out ) );
	for ( const event of [ 'minimize', 'restore', 'hide', 'show' ] ) {
		win.emit( event );
	}
	assert.deepEqual( told, [ true, false, true, false ] );
} );

test( 'the whole app hidden with ⌘H, and shown again from the Dock, says so', () => {
	const told = [];
	const app = new EventEmitter();
	watchAway( app, new EventEmitter(), ( out ) => told.push( out ) );
	app.emit( 'hide' );
	app.emit( 'show' );
	assert.deepEqual( told, [ true, false ] );
} );

test( 'a window that is gone stops listening to the app', () => {
	const told = [];
	const app = new EventEmitter();
	const unwatch = watchAway( app, new EventEmitter(), ( out ) =>
		told.push( out )
	);
	unwatch();
	app.emit( 'hide' );
	assert.deepEqual( told, [] );
	assert.equal( app.listenerCount( 'hide' ), 0 );
	assert.equal( app.listenerCount( 'show' ), 0 );
} );
