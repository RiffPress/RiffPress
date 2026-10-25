/* Rows in the post. Each block keeps its native player underneath, hidden, so a page where this
 * script fails still plays. mount() reads every marked element on the page, a block's figure or a
 * playlist's item; the app calls it again after it swaps a view in, and an element already turned
 * into a row keeps that row. And arriving by a shared link: the track is shown and its row focused,
 * nothing more. */
import { fmt, esc, parse, subtitle, rowArt, time } from 'riff-player/helpers';

// Strings are WordPress translations of this module (wp_set_script_module_translations()).
// Core prints wp.i18n only when there are translations, so without it the strings are the
// English they are written in.
const __ = window.wp?.i18n?.__ || ( ( english ) => english );

export function rows( P ) {
	const list = [];
	const built = new WeakMap();
	const hearts = new WeakMap(); // A row's heart, beside its … menu.
	function mount() {
		list.length = 0;
		document
			.querySelectorAll( 'figure[data-riff-track], li[data-riff-track]' )
			.forEach( ( fig ) => {
				const t = parse( fig.dataset.riffTrack );
				// A locked track is shown, with a lock and where to unlock it, and never queued.
				if ( t?.locked && ! built.get( fig ) ) {
					built.set( fig, buildLocked( fig, t ) );
				}
				if ( ! t || ! t.src ) {
					return;
				}
				P.askCors( t.src );
				let row = built.get( fig );
				if ( ! row ) {
					row = buildRow( fig, t );
					built.set( fig, row );
				}
				list.push( { t, row } );
			} );
		P.paint();
	}

	function buildRow( fig, t ) {
		const native = fig.querySelector( 'audio, video' );
		if ( native ) {
			native.pause();
			native.preload = 'none';
			native.hidden = true;
		}
		const row = document.createElement( 'button' );
		row.type = 'button';
		row.className = 'riff-row';
		row.setAttribute(
			'aria-label',
			fmt(
				/* translators: %s: track title. */ __( 'Play %s', 'riff' ),
				t.title
			)
		);
		row.innerHTML = rowInner( t );
		fig.insertBefore( row, fig.firstChild );
		row.after( P.moreButton( t ) );
		if ( P.inLibrary( t ) ) {
			const heart = P.likeButton( t );
			hearts.set( row, heart );
			row.after( heart );
		}
		row.addEventListener( 'click', () => {
			if ( P.track()?.id === t.id && sameQueue() ) {
				P.toggle();
				return;
			}
			P.setQueue(
				list.map( ( r ) => r.t ),
				list.findIndex( ( r ) => r.row === row )
			);
			if ( t.type === 'video' ) {
				P.open();
			}
		} );
		return row;
	}

	// A row for a track the visitor may not play: a link to unlock it when the site names one.
	function buildLocked( fig, t ) {
		fig.querySelector( 'audio, video' )?.setAttribute( 'hidden', '' );
		const row = document.createElement( t.unlock ? 'a' : 'div' );
		row.className = 'riff-row riff-row-locked';
		if ( t.unlock ) {
			row.href = t.unlock;
		}
		row.setAttribute(
			'aria-label',
			fmt(
				t.unlock
					? /* translators: %s: track title. */ __(
							'Unlock %s',
							'riff'
						)
					: /* translators: %s: track title. */ __(
							'%s is locked',
							'riff'
						),
				t.title
			)
		);
		row.innerHTML = rowInner( t, true );
		fig.insertBefore( row, fig.firstChild );
		return row;
	}

	function rowInner( t, locked = false ) {
		return (
			rowArt( t ) +
			`<span class="riff-row-text"><span class="riff-row-title">${ esc(
				t.title
			) }${ P.videoMark( t ) }</span>` +
			`<span class="riff-row-sub">${ esc(
				subtitle( t )
			) }</span></span>` +
			`<span class="riff-row-time">${
				locked
					? '<svg class="riff-row-lock" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>'
					: ''
			}${ t.duration ? time( t.duration ) : '' }</span>`
		);
	}

	// The page's rows are the queue that is playing, so a row tap toggles instead of restarting.
	const sameQueue = () =>
		P.queue.length === list.length &&
		list.every( ( r, i ) => r.t.id === P.queue[ i ].id );

	// Arriving by a shared link: what was playing carries on, and nothing starts by itself. A post
	// can hold the same file twice; the link opens the first.
	function reveal() {
		const id = new URLSearchParams( location.search ).get( P.SHARED );
		if ( ! id ) {
			return;
		}
		const hit = list.find( ( r ) => r.t.id === id );
		if ( ! hit ) {
			P.toast(
				__( 'The shared track is no longer in this post.', 'riff' )
			);
			return;
		}
		hit.row.dataset.shared = '';
		hit.row.scrollIntoView( { block: 'center' } );
		hit.row.focus( { preventScroll: true } );
	}

	return { rows: list, rowHearts: hearts, mount, sameQueue, reveal };
}
