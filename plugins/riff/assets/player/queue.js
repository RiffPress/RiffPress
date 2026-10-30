/* The queue: set from a post's rows or a script, changed while it plays (play next, add, move,
 * remove, clear) with the track playing keeping its place so nothing restarts, shuffled, and drawn
 * as Up next. */
import { fmt, esc, speak, rowArt, time } from 'riff-player/helpers';

// Strings are WordPress translations of this module (wp_set_script_module_translations()).
// Core prints wp.i18n only when there are translations, so without it the strings are the
// English they are written in.
const __ = window.wp?.i18n?.__ || ( ( english ) => english );

export function queue( P ) {
	const { api, queueList, emit, filter } = P;

	function setQueue( tracks, index, { play = true, at = 0 } = {} ) {
		stopAll();
		/**
		 * Filters the tracks about to become the queue.
		 *
		 * Return a new array to add, drop or reorder tracks before any of them plays.
		 *
		 * @since 4.0.0
		 *
		 * @param {Object[]} tracks The tracks, in the shape `Tracks::schema()` describes.
		 * @param {number}   index  The position in `tracks` that will play first.
		 */
		tracks = filter( 'queue', tracks, index );
		tracks = tracks.map( ( t ) =>
			/**
			 * Filters one track as a queue is set, after `riff.queue`.
			 *
			 * @since 4.0.0
			 *
			 * @param {Object} track The track, in the shape `Tracks::schema()` describes.
			 */
			filter( 'track', t )
		);
		// A track with no file, a locked one among them, has nothing to play: it is left out, and
		// the one chosen to play first is the next that can.
		const first = tracks.findIndex( ( t, i ) => i >= index && t?.src );
		const playable = tracks.filter( ( t ) => t?.src );
		if ( ! playable.length ) {
			return;
		}
		index = first < 0 ? 0 : playable.indexOf( tracks[ first ] );
		tracks = playable;
		P.queue = tracks;
		P.order = tracks.map( ( _, i ) => i );
		P.pos = index;
		if ( P.shuffle ) {
			reshuffle();
		}
		P.mode = 'song';
		P.load( { play, at } );
	}

	// ---- Changing the queue while it plays. The play order changes; the track playing keeps its
	// place, so nothing restarts.
	function insert( tracks, at, change ) {
		const list = ( Array.isArray( tracks ) ? tracks : [ tracks ] )
			.map( ( t ) =>
				/**
				 * Filters one track as it joins the queue, the same as when a queue is set.
				 *
				 * @since 4.0.0
				 *
				 * @param {Object} track The track, in the shape `Tracks::schema()` describes.
				 */
				filter( 'track', t )
			)
			.filter( ( t ) => t?.src );
		if ( ! list.length ) {
			return;
		}
		if ( P.pos < 0 || ! P.track() ) {
			setQueue( list, 0 );
			return;
		}
		const first = P.queue.length;
		P.queue.push( ...list );
		P.order.splice(
			Math.max( 0, Math.min( at, P.order.length ) ),
			0,
			...list.map( ( _, i ) => first + i )
		);
		changed( change );
	}
	function reorder( from, to ) {
		if (
			from === to ||
			from < 0 ||
			to < 0 ||
			from >= P.order.length ||
			to >= P.order.length
		) {
			return;
		}
		const current = P.order[ P.pos ];
		const [ index ] = P.order.splice( from, 1 );
		P.order.splice( to, 0, index );
		P.pos = P.order.indexOf( current );
		changed( 'move' );
		speak(
			fmt(
				/* translators: 1: the track's new place in the queue, 2: how many tracks it holds. */ __(
					'Moved to %1$s of %2$s',
					'riff'
				),
				to + 1,
				P.order.length
			)
		);
	}
	function remove( at ) {
		if ( at === P.pos || at < 0 || at >= P.order.length ) {
			return;
		}
		const gone = P.queue[ P.order[ at ] ];
		P.order.splice( at, 1 );
		if ( at < P.pos ) {
			P.pos--;
		}
		changed( 'remove' );
		speak(
			fmt(
				/* translators: %s: track title. */ __(
					'%s removed from the queue',
					'riff'
				),
				gone?.title
			)
		);
	}
	function clear() {
		if ( P.pos < 0 ) {
			return;
		}
		P.order = [ P.order[ P.pos ] ];
		P.pos = 0;
		changed( 'clear' );
		speak( __( 'Queue cleared', 'riff' ) );
	}
	function changed( change ) {
		renderQueue();
		P.save();
		/**
		 * Fires when the queue changes while it plays: tracks added to play next or at the end, one
		 * moved or removed, or the queue cleared.
		 *
		 * @since 4.19.0
		 *
		 * @param {Object}   detail        What changed.
		 * @param {string}   detail.change `next`, `add`, `move`, `remove` or `clear`.
		 * @param {Object[]} detail.queue  The queue in play order.
		 * @param {number}   detail.index  The playing track's place in it.
		 * @param {Object}   api           `window.riff`.
		 */
		emit( 'queue', { change, queue: api.queue(), index: P.pos } );
	}

	function reshuffle() {
		const current = P.order[ P.pos ];
		const rest = P.queue
			.map( ( _, i ) => i )
			.filter( ( i ) => i !== current );
		for ( let i = rest.length - 1; i > 0; i-- ) {
			const j = Math.floor( Math.random() * ( i + 1 ) );
			[ rest[ i ], rest[ j ] ] = [ rest[ j ], rest[ i ] ];
		}
		P.order = [ current, ...rest ];
		P.pos = 0;
	}

	function stopAll() {
		for ( const m of [ P.audio, P.video ] ) {
			m.pause();
		}
	}

	// A track moved by its menu or the keyboard keeps the focus on its new place.
	function moveAndFocus( from, to ) {
		reorder( from, to );
		queueList
			.querySelector( `li[data-pos="${ to }"] > button` )
			?.focus();
	}

	const clearButton = P.$( '[data-riff-action="clear-queue"]' );
	clearButton?.addEventListener( 'click', () => clear() );

	// Up next draws a window of the queue around the track playing, and more as the listener
	// scrolls or tabs to either end of it, so a queue of thousands is a few hundred items in the
	// page, not thousands. Each item still says its place in the whole queue.
	const BEFORE = 20;
	const AFTER = 80;
	const STEP = 100;
	const MOST = 300;
	const drawn = { order: null, length: 0, from: 0, to: 0 };

	function item( p ) {
		const t = P.queue[ P.order[ p ] ];
		const li = document.createElement( 'li' );
		li.dataset.pos = String( p );
		li.setAttribute( 'aria-posinset', String( p + 1 ) );
		li.setAttribute( 'aria-setsize', String( P.order.length ) );
		li.innerHTML =
			'<button type="button">' +
			rowArt( t ) +
			`<span class="riff-row-text"><span class="riff-row-title"${ P.langAttr( t ) }>${ esc(
				t.title
			) }</span>` +
			`<span class="riff-row-sub">${ esc(
				t.artist || t.post?.title || ''
			) }` +
			( t.duration
				? `<span class="riff-row-dot"> • ${ time( t.duration ) }</span>`
				: '' ) +
			'</span></span>' +
			`<span class="riff-row-time">${
				t.duration ? time( t.duration ) : ''
			}</span>` +
			'</button>';
		li.firstElementChild.addEventListener( 'click', () =>
			p === P.pos ? P.toggle() : P.go( p )
		);
		// Alt and an arrow moves the track; dragging does too, with a mouse.
		li.firstElementChild.addEventListener( 'keydown', ( e ) => {
			if ( e.altKey && ( e.key === 'ArrowUp' || e.key === 'ArrowDown' ) ) {
				e.preventDefault();
				const to = p + ( e.key === 'ArrowUp' ? -1 : 1 );
				if ( to >= 0 && to < P.order.length ) {
					moveAndFocus( p, to );
				}
			}
		} );
		li.draggable = true;
		li.addEventListener( 'dragstart', ( e ) => {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData( 'text/x-riff-queue', String( p ) );
			li.classList.add( 'is-dragging' );
		} );
		li.addEventListener( 'dragend', () =>
			li.classList.remove( 'is-dragging' )
		);
		li.addEventListener( 'dragover', ( e ) => {
			if ( e.dataTransfer.types.includes( 'text/x-riff-queue' ) ) {
				e.preventDefault();
			}
		} );
		li.addEventListener( 'drop', ( e ) => {
			const from = Number( e.dataTransfer.getData( 'text/x-riff-queue' ) );
			if ( Number.isInteger( from ) ) {
				e.preventDefault();
				reorder( from, p );
			}
		} );
		li.append( P.moreButton( t, p ) );
		return li;
	}

	function items( from, to ) {
		const out = document.createDocumentFragment();
		for ( let p = from; p < to; p++ ) {
			out.append( item( p ) );
		}
		return out;
	}

	// Whatever scrolls Up next, so items added or taken above what the listener sees leave it
	// where it was. Chromium anchors the scroll itself; then the correction is nothing.
	function steady( anchor, change ) {
		const before = anchor?.getBoundingClientRect().top;
		change();
		const moved = anchor?.isConnected
			? anchor.getBoundingClientRect().top - before
			: 0;
		if ( moved ) {
			let scroller = queueList;
			while ( scroller && scroller.scrollHeight <= scroller.clientHeight ) {
				scroller = scroller.parentElement;
			}
			if ( scroller ) {
				scroller.scrollTop += moved;
			}
		}
	}

	// More of the queue, after what is drawn or before it. Past the most kept at once, as many go
	// from the other end, never the one with the focus.
	function more( after ) {
		const length = P.order.length;
		if ( after ? drawn.to >= length : drawn.from <= 0 ) {
			return;
		}
		if ( after ) {
			const to = Math.min( length, drawn.to + STEP );
			queueList.append( items( drawn.to, to ) );
			drawn.to = to;
		} else {
			const from = Math.max( 0, drawn.from - STEP );
			steady( queueList.firstElementChild, () =>
				queueList.prepend( items( from, drawn.from ) )
			);
			drawn.from = from;
		}
		const focused = queueList
			.querySelector( 'li:focus-within' )
			?.dataset.pos;
		while ( drawn.to - drawn.from > MOST ) {
			const edge = after ? drawn.from : drawn.to - 1;
			if ( Number( focused ) === edge ) {
				break;
			}
			const li = after
				? queueList.firstElementChild
				: queueList.lastElementChild;
			if ( after ) {
				steady( li.nextElementSibling, () => li.remove() );
				drawn.from++;
			} else {
				li.remove();
				drawn.to--;
			}
		}
		watch();
		P.paint();
	}

	// The first and last items drawn, while there is more beyond them: seen, or given the focus,
	// they draw more.
	const edges =
		'IntersectionObserver' in window
			? new IntersectionObserver(
					( entries ) => {
						for ( const e of entries ) {
							if ( e.isIntersecting ) {
								more( e.target === queueList.lastElementChild );
							}
						}
					},
					{ rootMargin: '400px 0px' }
			  )
			: null;
	function watch() {
		if ( ! edges ) {
			return;
		}
		edges.disconnect();
		if ( drawn.from > 0 && queueList.firstElementChild ) {
			edges.observe( queueList.firstElementChild );
		}
		if ( drawn.to < P.order.length && queueList.lastElementChild ) {
			edges.observe( queueList.lastElementChild );
		}
	}
	queueList.addEventListener( 'focusin', ( e ) => {
		const p = Number( e.target.closest( 'li' )?.dataset.pos );
		if ( p >= drawn.to - 3 ) {
			more( true );
		} else if ( p <= drawn.from + 2 ) {
			more( false );
		}
	} );

	// With follow, as a new track loads: the queue is the same, so what is drawn stays, and only
	// a track past the end of it draws more. Otherwise the queue changed, and is drawn again.
	function renderQueue( { follow = false } = {} ) {
		const length = P.order.length;
		const same = drawn.order === P.order && drawn.length === length;
		if ( follow && same ) {
			if ( P.pos >= drawn.from && P.pos < drawn.to - BEFORE ) {
				return;
			}
			if ( P.pos >= drawn.from && P.pos < drawn.to + STEP ) {
				more( true );
				return;
			}
		}
		// Redrawing replaces every button, so a keyboard listener in the list, or on Clear as it
		// hides, is put back on the same place, or the nearest one left, rather than on the body.
		const focused = document.activeElement;
		const inList = queueList.contains( focused );
		const at = inList ? Number( focused.closest( 'li' )?.dataset.pos ) : -1;
		const onMore =
			inList && focused.classList.contains( 'riff-more-button' );
		const onClear = !! clearButton && focused === clearButton;
		if ( clearButton ) {
			clearButton.hidden = length < 2;
		}
		// A change to the queue keeps the part of it in view, grown by what was added; a new queue,
		// a new order, or a track played outside what is drawn, is drawn around the track playing.
		// Either way the place with the focus is in it.
		let from = Math.max( 0, P.pos - BEFORE );
		let to = Math.min( length, P.pos + AFTER );
		if ( drawn.order === P.order && ! follow && drawn.from < length ) {
			from = drawn.from;
			to = Math.min(
				length,
				drawn.to + Math.max( 0, length - drawn.length )
			);
		}
		const target = Math.min( Math.max( at, 0 ), length - 1 );
		if ( at >= 0 ) {
			from = Math.min( from, Math.max( 0, target - 1 ) );
			to = Math.max( to, Math.min( length, target + 2 ) );
		}
		from = Math.max( 0, Math.min( from, length ) );
		queueList.textContent = '';
		queueList.append( items( from, to ) );
		Object.assign( drawn, { order: P.order, length, from, to } );
		watch();
		if ( at >= 0 || ( onClear && clearButton.hidden ) ) {
			const li = queueList.querySelector( `li[data-pos="${ target }"]` );
			( onMore
				? li?.querySelector( '.riff-more-button' )
				: li?.firstElementChild
			)?.focus( { preventScroll: true } );
		}
	}

	return {
		setQueue,
		insert,
		reorder,
		remove,
		clear,
		reshuffle,
		stopAll,
		moveAndFocus,
		renderQueue,
	};
}
