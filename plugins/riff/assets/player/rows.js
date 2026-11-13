/* Rows in the post. Each block keeps its native player underneath, hidden, so a page where this
 * script fails still plays. mount() reads every marked element on the page, a block's figure or a
 * playlist's item; the app calls it again after it swaps a view in, and an element already turned
 * into a row keeps that row. And arriving by a shared link: the track is shown and its row focused,
 * nothing more. */
import { esc, parse, subtitle, rowArt, time, PAUSE } from 'riff-player/helpers';

// Strings are WordPress translations of this module (wp_set_script_module_translations()).
// Core prints wp.i18n only when there are translations, so without it the strings are the
// English they are written in.
const __ = window.wp?.i18n?.__ || ( ( english ) => english );

export function rows( P ) {
	const list = [];
	const built = new WeakMap();
	// What each element was made a row of. Following a link without leaving the page
	// (navigation.js), the router can reuse an element for the next page's block: a row made for
	// another track, or one the router took out, is made again.
	const madeOf = new WeakMap();
	const hearts = new WeakMap(); // A row's heart, beside its … menu.
	function mount() {
		list.length = 0;
		document
			.querySelectorAll( 'figure[data-riff-track], li[data-riff-track]' )
			.forEach( ( fig ) => {
				const old = built.get( fig );
				if (
					old &&
					( madeOf.get( fig ) !== fig.dataset.riffTrack ||
						old.parentNode !== fig )
				) {
					fig.querySelectorAll(
						':scope > [data-riff-added]'
					).forEach( ( el ) => el.remove() );
					built.delete( fig );
				}
				madeOf.set( fig, fig.dataset.riffTrack );
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
		row.innerHTML = rowInner( t, __( 'Play', 'riff' ) );
		fig.insertBefore( row, fig.firstChild );
		const more = P.moreButton( t );
		row.after( more );
		row.dataset.riffAdded = '';
		more.dataset.riffAdded = '';
		if ( P.inLibrary( t ) ) {
			const heart = P.likeButton( t );
			heart.dataset.riffAdded = '';
			hearts.set( row, heart );
			row.after( heart );
		}
		row.addEventListener( 'click', () => {
			P.press( 'row' );
			if ( P.track()?.id === t.id && sameQueue() ) {
				const resumes = P.el().paused;
				P.toggle();
				if ( resumes && P.isVideo() ) {
					P.open();
				}
				return;
			}
			// Rows that are one page of a longer list name where the rest is, and the queue goes on
			// into it.
			const holder = fig.closest( '[data-riff-more]' );
			P.setQueue(
				list.map( ( r ) => r.t ),
				list.findIndex( ( r ) => r.row === row ),
				{ more: holder ? parse( holder.dataset.riffMore ) : null }
			);
			// A video is played to be seen: its picture is in Now Playing, which opens on it. A song,
			// even one with a video version, plays as the song and stays here.
			if ( P.isVideo() ) {
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
		// Why it is locked, when the site says: "No longer available", say.
		let verb = t.unlock
			? /* translators: Heard before a locked track's title, on the link that unlocks it. */ __(
					'Unlock',
					'riff'
				)
			: /* translators: Heard before a locked track's title. */ __(
					'Locked',
					'riff'
				);
		if ( t.reason ) {
			verb = t.reason;
			row.title = t.reason;
		}
		row.innerHTML = rowInner( t, verb, true );
		row.dataset.riffAdded = '';
		fig.insertBefore( row, fig.firstChild );
		return row;
	}

	// A title in another language than the page's carries it, so it is read in that language.
	const langAttr = ( t ) =>
		t.lang && t.lang !== document.documentElement.lang
			? ` lang="${ esc( t.lang ) }"`
			: '';
	P.langAttr = langAttr;

	// A track from a post visitors can't see, marked as the Listen app's cards are: WordPress's
	// lock with its body filled (a locked track's own lock is an outline, in the time column), and
	// the word said rather than shown. The server only sets post.private for
	// someone signed in who may see the post; riff.css shows it only in the Listen app, since a
	// post's own page already says so in its title.
	const PRIVATE =
		'<span class="riff-private"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9.25 10.75V7.5C9.25 5.98122 10.4812 4.75 12 4.75C13.5188 4.75 14.75 5.98122 14.75 7.5V10.75"/><path d="M7.75 10.75H16.25C16.5261 10.75 16.75 10.9739 16.75 11.25V17.25C16.75 17.5261 16.5261 17.75 16.25 17.75H7.75C7.47386 17.75 7.25 17.5261 7.25 17.25V11.25C7.25 10.9739 7.47386 10.75 7.75 10.75Z" fill="currentColor"/></svg>' +
		`<span class="riff-app-sr">${ esc(
			/* translators: Heard before a track's artist, when the post it is in is one visitors can't see. */ __(
				'Private',
				'riff'
			)
		) }, </span></span>`;

	// A row is named by what it shows, the verb first: Play, then its title, artist and length.
	function rowInner( t, verb, locked = false ) {
		return (
			rowArt( t ) +
			`<span class="riff-app-sr riff-row-verb">${ esc( verb ) }</span>` +
			`<span class="riff-row-text"><span class="riff-row-title"${ langAttr( t ) }>${ esc(
				t.title
			) }${ P.videoMark( t ) }</span>` +
			// The pause sits inside the line it comes before, so a view that hides that line hides it.
			`<span class="riff-row-sub">${ subtitle( t ) ? PAUSE : '' }${
				t.post?.private ? PRIVATE : ''
			}${ esc(
				subtitle( t )
			) }</span></span>` +
			`<span class="riff-row-time">${ t.duration ? PAUSE : '' }${
				locked
					? '<svg class="riff-row-lock" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9.25 10.75H7.75C7.47386 10.75 7.25 10.9739 7.25 11.25V17.25C7.25 17.5261 7.47386 17.75 7.75 17.75H16.25C16.5261 17.75 16.75 17.5261 16.75 17.25V11.25C16.75 10.9739 16.5261 10.75 16.25 10.75H14.75M9.25 10.75V7.5C9.25 5.98122 10.4812 4.75 12 4.75C13.5188 4.75 14.75 5.98122 14.75 7.5V10.75M9.25 10.75H14.75"/></svg>'
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
