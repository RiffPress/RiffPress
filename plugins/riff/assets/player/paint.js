/* Painting. Every copy of a control is updated from the same state: the play buttons, the titles,
 * the art, the modes, repeat and shuffle, the rows in the post and the items of Up next, the
 * hearts, the progress and the player's areas. */
import {
	subtitle,
	time,
	smallest,
	largest,
	esc,
	PAUSE,
} from 'riff-player/helpers';

// Strings are WordPress translations of this module (wp_set_script_module_translations()).
// Core prints wp.i18n only when there are translations, so without it the strings are the
// English they are written in.
const __ = window.wp?.i18n?.__ || ( ( english ) => english );

export function paint( P ) {
	const { root, $, $$, queueList, own } = P;

	// The hidden word a row's name starts with, Play or Pause; the rest is what the row shows.
	function verb( row, word ) {
		const said = row.querySelector( '.riff-row-verb' );
		if ( said && said.textContent !== word ) {
			said.textContent = word;
		}
	}

	function paintAll() {
		const t = P.track();
		const playing = P.playing();
		root.dataset.playing = playing ? 'true' : 'false';
		root.dataset.mode = P.isVideo( t ) ? 'video' : 'song';
		for ( const b of $$( '[data-riff-action="toggle"]' ) ) {
			b.setAttribute(
				'aria-label',
				playing ? __( 'Pause', 'riff' ) : __( 'Play', 'riff' )
			);
		}
		text( 'title', t?.title || '' );
		text( 'subtitle', t ? subtitle( t ) : '' );
		text( 'artist', t ? t.artist || t.post?.title || '' : '' );
		areas( t );
		text( 'source', t?.post?.title || '' );
		for ( const img of $$( 'img[data-riff-art]' ) ) {
			const large = img.dataset.riffSize === 'large';
			const src = large ? largest( t?.art ) : smallest( t?.art );
			if ( src && img.getAttribute( 'src' ) !== src ) {
				img.src = src;
			}
			img.hidden = ! src;
			// The large cover is content, told by what it shows; the small ones beside a title
			// are decoration, the title says it.
			img.alt = large
				? ( t?.art || [] ).find( ( a ) => a?.alt )?.alt || ''
				: '';
		}
		const modes = $( '.riff-modes' );
		modes.hidden = ! t?.video;
		paintCaptions();
		for ( const b of $$( '[data-riff-mode]' ) ) {
			b.setAttribute(
				'aria-checked',
				String( b.dataset.riffMode === P.mode )
			);
		}
		// Repeat has three states, which a pressed button cannot say: one name, the state after it.
		const repeatLabel = {
			/* translators: The Repeat button while nothing repeats. */
			off: __( 'Repeat, off', 'riff' ),
			/* translators: The Repeat button while the queue repeats. */
			all: __( 'Repeat, all', 'riff' ),
			/* translators: The Repeat button while one track repeats. */
			one: __( 'Repeat, one', 'riff' ),
		}[ P.repeat ];
		for ( const b of $$( '[data-riff-action="repeat"]' ) ) {
			b.dataset.repeat = P.repeat;
			b.setAttribute( 'aria-label', repeatLabel );
		}
		// Shuffle's name stays put; whether it is on is the toggle's pressed state.
		for ( const b of $$( '[data-riff-action="shuffle"]' ) ) {
			b.setAttribute( 'aria-pressed', String( P.shuffle ) );
		}
		for ( const { t: rt, row } of P.rows ) {
			const current = !! t && rt.id === t.id && P.sameQueue();
			row.toggleAttribute( 'data-current', current );
			row.dataset.playing = current && playing ? 'true' : 'false';
			verb(
				row,
				current && playing ? __( 'Pause', 'riff' ) : __( 'Play', 'riff' )
			);
			// A track that could not be played says so in words under its title, which are part of
			// the row's name, so a screen reader hears them too.
			const failed = P.failed.has( rt.id );
			row.toggleAttribute( 'data-failed', failed );
			let note = row.querySelector( '.riff-row-note' );
			if ( failed && ! note ) {
				note = document.createElement( 'span' );
				note.className = 'riff-row-note';
				note.innerHTML =
					PAUSE + esc( __( 'Couldn’t be played', 'riff' ) );
				row.querySelector( '.riff-row-text' )?.append( note );
			}
			if ( note ) {
				note.hidden = ! failed;
			}
		}
		for ( const li of queueList.children ) {
			const current = Number( li.dataset.pos ) === P.pos;
			// aria-current="" reads as false, so the playing one says true.
			if ( current ) {
				li.firstElementChild.setAttribute( 'aria-current', 'true' );
			} else {
				li.firstElementChild.removeAttribute( 'aria-current' );
			}
			li.dataset.playing = current && playing ? 'true' : 'false';
			// Named as a post's rows are, by what they show; the playing one offers Pause.
			verb(
				li.firstElementChild,
				current && playing ? __( 'Pause', 'riff' ) : __( 'Play', 'riff' )
			);
		}
		P.paintHearts();
		progress();
		P.meterSync?.();
		if ( 'mediaSession' in navigator ) {
			navigator.mediaSession.playbackState = t
				? playing
					? 'playing'
					: 'paused'
				: 'none';
		}
	}

	function progress() {
		const m = P.el();
		const duration = P.durationOf( m );
		const ratio = duration ? Math.min( m.currentTime / duration, 1 ) : 0;
		setBuffered( duration ? buffered( m, duration ) : 0 );
		text( 'current', time( m.currentTime ) );
		text( 'duration', time( duration ) );
		// While the line is dragged it is where the pointer put it: drawing the time playing as
		// well would swap the two back and forth.
		if ( ! P.seeking ) {
			setProgress( ratio );
			// A range's value is written only when it moves a step: each write lays the thumb out again.
			// Its words change once a second, and are written apart from it, so they are never
			// left behind when a key has already moved the value.
			const value = String( Math.round( ratio * 1000 ) );
			const said = P.seekText( m.currentTime, duration );
			for ( const input of $$( '[data-riff-seek]' ) ) {
				if ( input.value !== value ) {
					input.value = value;
				}
				if ( input.getAttribute( 'aria-valuetext' ) !== said ) {
					input.setAttribute( 'aria-valuetext', said );
				}
			}
		}
	}

	// The played fraction, on the two seek containers rather than the root: a property on the root
	// restyles every element in the player, these restyle their own lines.
	const seekers = $$( '.riff-bar-seek, .riff-np-seek' );

	// How far the file has loaded past the playhead, from the element's TimeRanges, as the lighter
	// band under the played part of the line.
	function buffered( m, duration ) {
		const ranges = m.buffered;
		for ( let i = 0; i < ranges.length; i++ ) {
			if (
				ranges.start( i ) <= m.currentTime + 0.5 &&
				ranges.end( i ) >= m.currentTime
			) {
				return Math.min( ranges.end( i ) / duration, 1 );
			}
		}
		return 0;
	}
	let lastBuffered = -1;
	function setBuffered( ratio ) {
		const value = ratio.toFixed( 3 );
		if ( value === lastBuffered ) {
			return;
		}
		lastBuffered = value;
		for ( const node of seekers ) {
			node.style.setProperty( '--riff-buffered', value );
		}
	}

	function setProgress( ratio ) {
		const value = ratio.toFixed( 4 );
		for ( const node of seekers ) {
			node.style.setProperty( '--riff-p', value );
		}
	}

	// The badges, from Riff's own listeners (own.badges): drawn again only when what they hold
	// changes. The bar's controls are kept in place by the registry, which only updates them, so a
	// control keeps its focus while the track plays on.
	let areasKey = '';
	function areas( t = P.track() ) {
		P.drawControls?.( t );
		const badges = [ ...own.badges ]
			.reduce( ( list, fn ) => fn( list, t ) || list, [] )
			.filter( ( b ) => b && b.id && b.text );
		const key = JSON.stringify(
			badges.map( ( b ) => [ b.id, b.text, b.label ] )
		);
		if ( key === areasKey ) {
			return;
		}
		areasKey = key;
		for ( const area of $$( '[data-riff-area="badges"]' ) ) {
			// A badge that stays is the same pill with new words, so its colour moves to the new
			// tier (riff.css) and the words fade in, rather than a new pill appearing in its place.
			const was = new Map(
				[ ...area.children ].map( ( el ) => [ el.dataset.riffBadge, el ] )
			);
			area.replaceChildren(
				...badges.map( ( b ) => {
					const kept = was.get( b.id );
					const pill = kept || document.createElement( 'span' );
					const changed = kept && kept.dataset.riffText !== b.text;
					pill.dataset.riffBadge = b.id;
					pill.dataset.riffText = b.text;
					// The quality pill keeps the class its styles and tests know it by, and is coloured
					// by its tier.
					pill.className = `riff-badge riff-badge-${ b.id }${
						b.id === 'quality' ? ` riff-quality riff-quality-${ P.tier( t ) }` : ''
					}`;
					pill.removeAttribute( 'title' );
					pill.innerHTML = `<span>${ esc( b.text ) }</span>`;
					if ( b.label ) {
						// The title is for a pointer; the words are for everyone else, read in
						// place of the short text.
						pill.title = b.label;
						pill.innerHTML = `<span aria-hidden="true">${ esc(
							b.text
						) }</span><span class="riff-app-sr">${ esc( b.label ) }</span>`;
					}
					if ( changed && ! P.reduce() ) {
						pill.firstElementChild.animate(
							[
								{ opacity: 0, transform: 'translateY(3px)' },
								{ opacity: 1, transform: 'none' },
							],
							{ duration: 240, easing: 'ease-out' }
						);
					}
					return pill;
				} )
			);
		}
	}

	// The text node is changed in place: replacing it is a childList mutation, and core's
	// comment-reply script watches the whole body for those and re-binds itself on every one.
	function text( name, value ) {
		for ( const node of $$( `[data-riff-text="${ name }"]` ) ) {
			if ( node.textContent === value ) {
				continue;
			}
			if (
				node.firstChild?.nodeType === Node.TEXT_NODE &&
				node.childNodes.length === 1
			) {
				node.firstChild.data = value;
			} else {
				node.textContent = value;
			}
		}
	}

	// Captions: the switch shows for a video version that has them, in video mode, and the
	// video's text tracks follow it.
	function paintCaptions() {
		const t = P.track();
		const has = !! t?.video?.captions?.length;
		for ( const b of $$( '[data-riff-action="captions"]' ) ) {
			b.hidden = ! has || P.mode !== 'video';
			b.setAttribute( 'aria-pressed', String( !! P.captionsOn ) );
		}
		for ( const track of P.video.textTracks ) {
			track.mode = has && P.captionsOn ? 'showing' : 'hidden';
		}
	}

	return {
		paint: paintAll,
		progress,
		seekers,
		setProgress,
		areas,
		text,
		paintCaptions,
	};
}
