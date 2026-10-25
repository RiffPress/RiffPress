/* Picking up where the listener left off. The queue and position live for the tab's session. A
 * link to another page carries the music over: the click that follows the link is the gesture the
 * new page needs to play with sound. A reload shows the same track, paused. */
import { parse, read, write } from 'riff-player/helpers';

export function resume( P ) {
	function save() {
		if ( ! P.track() ) {
			return;
		}
		const m = P.el();
		write(
			sessionStorage,
			P.STATE,
			JSON.stringify( {
				queue: P.queue,
				order: P.order,
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
		} catch {}
	}
	window.addEventListener( 'pagehide', save );

	// The saved queue, loaded paused after a reload and playing after a link, or nothing to restore.
	function restore() {
		const saved = parse( read( sessionStorage, P.STATE ) );
		if (
			! saved ||
			! Array.isArray( saved.queue ) ||
			! saved.queue.length ||
			! saved.queue[ saved.order?.[ saved.pos ] ]
		) {
			return false;
		}
		P.queue = saved.queue;
		P.order = saved.order;
		P.pos = saved.pos;
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
