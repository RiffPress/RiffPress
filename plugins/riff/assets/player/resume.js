/* Picking up where the listener left off. The queue and position live for the tab's session. A
 * link to another page carries the music over: the click that follows the link is the gesture the
 * new page needs to play with sound. A reload shows the same track, paused.
 *
 * The queue is kept apart from the position: the position is saved every few seconds while a
 * track plays, the queue only when it changes. A queue longer than WINDOW keeps the tracks
 * around the one playing, in play order, so a playlist of thousands neither fills the tab's
 * storage nor is written out again every time. */
import { parse, read, write } from 'riff-player/helpers';

const WINDOW = 500;
// Tracks kept before the one playing, of a queue cut to the window.
const BEHIND = 100;

export function resume( P ) {
	// What the queue was when it was last saved: the array, its play order and the slice kept.
	let kept = { queue: null, order: '', from: 0, length: 0 };

	function saveQueue() {
		const order = P.order.join( ',' );
		const inside =
			P.pos >= kept.from && P.pos < kept.from + kept.length;
		if ( P.queue === kept.queue && order === kept.order && inside ) {
			return;
		}
		let from = 0;
		let saved = { queue: P.queue, order: P.order };
		if ( P.order.length > WINDOW ) {
			from = Math.max(
				0,
				Math.min( P.pos - BEHIND, P.order.length - WINDOW )
			);
			// In play order: what is kept is the part of the queue that plays from here.
			const tracks = P.order
				.slice( from, from + WINDOW )
				.map( ( i ) => P.queue[ i ] );
			saved = { queue: tracks, order: tracks.map( ( _, i ) => i ) };
		}
		write( sessionStorage, P.QUEUE, JSON.stringify( { ...saved, from } ) );
		kept = {
			queue: P.queue,
			order,
			from,
			length: saved.order.length,
		};
	}

	function save() {
		if ( ! P.track() ) {
			return;
		}
		saveQueue();
		const m = P.el();
		write(
			sessionStorage,
			P.STATE,
			JSON.stringify( {
				pos: P.pos,
				mode: P.mode,
				repeat: P.repeat,
				shuffle: P.shuffle,
				at: m.currentTime || 0,
				playing: ! m.paused && ! m.ended,
			} )
		);
	}
	function forget() {
		try {
			sessionStorage.removeItem( P.STATE );
			sessionStorage.removeItem( P.QUEUE );
		} catch {}
		kept = { queue: null, order: '', from: 0, length: 0 };
	}
	window.addEventListener( 'pagehide', save );

	// The saved queue, loaded paused after a reload and playing after a link, or nothing to restore.
	function restore() {
		const saved = parse( read( sessionStorage, P.STATE ) );
		const queue = parse( read( sessionStorage, P.QUEUE ) );
		const pos = Number( saved?.pos ) - ( Number( queue?.from ) || 0 );
		if (
			! saved ||
			! Array.isArray( queue?.queue ) ||
			! Array.isArray( queue.order ) ||
			! queue.queue[ queue.order[ pos ] ]
		) {
			return false;
		}
		P.queue = queue.queue;
		P.order = queue.order;
		P.pos = pos;
		P.repeat = [ 'off', 'all', 'one' ].includes( saved.repeat )
			? saved.repeat
			: 'off';
		P.shuffle = !! saved.shuffle;
		P.mode = saved.mode === 'video' ? 'video' : 'song';
		const arrival = performance.getEntriesByType( 'navigation' )[ 0 ]?.type;
		P.load( {
			play: !! saved.playing && arrival !== 'reload',
			at: Number( saved.at ) || 0,
		} );
		return true;
	}

	return { save, forget, restore };
}
