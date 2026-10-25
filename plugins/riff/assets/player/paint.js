/* Painting. Every copy of a control is updated from the same state: the play buttons, the titles,
 * the art, the modes, repeat and shuffle, the rows in the post and the items of Up next, the
 * hearts, the progress and the player's areas. */
import {
	fmt,
	subtitle,
	time,
	smallest,
	largest,
	esc,
} from 'riff-player/helpers';

// Strings are WordPress translations of this module (wp_set_script_module_translations()).
// Core prints wp.i18n only when there are translations, so without it the strings are the
// English they are written in.
const __ = window.wp?.i18n?.__ || ( ( english ) => english );

export function paint( P ) {
	const { root, $, $$, queueList, own } = P;

	function paintAll() {
		const t = P.track();
		const m = P.el();
		const playing = !! t && ! m.paused;
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
		// Named for the track, so the two buttons that open Now Playing are told apart.
		$( '.riff-bar-info' )?.setAttribute(
			'aria-label',
			t
				? fmt(
						/* translators: %s: the track, as its title and artist. */ __(
							'Open Now Playing: %s',
							'riff'
						),
						P.named( t )
					)
				: __( 'Open Now Playing', 'riff' )
		);
		text( 'artist', t ? t.artist || t.post?.title || '' : '' );
		areas( t );
		text( 'source', t?.post?.title || '' );
		for ( const img of $$( 'img[data-riff-art]' ) ) {
			const src =
				img.dataset.riffSize === 'large'
					? largest( t?.art )
					: smallest( t?.art );
			if ( src && img.getAttribute( 'src' ) !== src ) {
				img.src = src;
			}
			img.hidden = ! src;
		}
		const modes = $( '.riff-modes' );
		modes.hidden = ! t?.video;
		for ( const b of $$( '[data-riff-mode]' ) ) {
			b.setAttribute(
				'aria-checked',
				String( b.dataset.riffMode === P.mode )
			);
		}
		const repeatLabel = {
			off: __( 'Repeat off', 'riff' ),
			all: __( 'Repeat all', 'riff' ),
			one: __( 'Repeat one', 'riff' ),
		}[ P.repeat ];
		for ( const b of $$( '[data-riff-action="repeat"]' ) ) {
			b.dataset.repeat = P.repeat;
			b.setAttribute( 'aria-pressed', String( P.repeat !== 'off' ) );
			b.setAttribute( 'aria-label', repeatLabel );
		}
		for ( const b of $$( '[data-riff-action="shuffle"]' ) ) {
			b.setAttribute( 'aria-pressed', String( P.shuffle ) );
			b.setAttribute(
				'aria-label',
				P.shuffle
					? __( 'Shuffle on', 'riff' )
					: __( 'Shuffle off', 'riff' )
			);
		}
		for ( const { t: rt, row } of P.rows ) {
			const current = !! t && rt.id === t.id && P.sameQueue();
			row.toggleAttribute( 'data-current', current );
			row.dataset.playing = current && playing ? 'true' : 'false';
			row.setAttribute(
				'aria-label',
				current && playing
					? fmt(
							/* translators: %s: track title. */ __(
								'Pause %s',
								'riff'
							),
							rt.title
						)
					: fmt(
							/* translators: %s: track title. */ __(
								'Play %s',
								'riff'
							),
							rt.title
						)
			);
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
			// Named as a post's rows are, with the artist, since the title and the artist would
			// otherwise be read run together; the playing one offers Pause.
			const qt = P.queue[ P.order[ Number( li.dataset.pos ) ] ];
			if ( qt ) {
				li.firstElementChild.setAttribute(
					'aria-label',
					fmt(
						current && playing
							? /* translators: %s: the track, as its title and artist. */ __(
									'Pause %s',
									'riff'
								)
							: /* translators: %s: the track, as its title and artist. */ __(
									'Play %s',
									'riff'
								),
						P.named( qt )
					)
				);
			}
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

	// The played fraction, on the two seek containers rather than the root, for the same reason as
	// the heat.
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

	// The player's areas, from Riff's own listeners (own.badges, own.controls): drawn again only
	// when what they hold changes, so a control keeps its focus while the track plays on.
	let areasKey = '';
	function areas( t = P.track() ) {
		const collect = ( name ) =>
			[ ...own[ name ] ].reduce(
				( list, fn ) => fn( list, t ) || list,
				[]
			);
		const badges = collect( 'badges' ).filter(
			( b ) => b && b.id && b.text
		);
		const controls = collect( 'controls' ).filter(
			( c ) => c && c.id && c.label && typeof c.run === 'function'
		);
		const key = JSON.stringify( [
			badges.map( ( b ) => [ b.id, b.text, b.label ] ),
			controls.map( ( c ) => [ c.id, c.label, c.pressed ] ),
		] );
		if ( key === areasKey ) {
			return;
		}
		areasKey = key;
		for ( const area of $$( '[data-riff-area="badges"]' ) ) {
			area.replaceChildren(
				...badges.map( ( b ) => {
					const pill = document.createElement( 'span' );
					// The quality pill keeps the class its styles and tests know it by.
					pill.className = `riff-badge riff-badge-${ b.id }${
						b.id === 'quality' ? ' riff-quality' : ''
					}`;
					pill.textContent = b.text;
					if ( b.label ) {
						// The title is for a pointer; the words are for everyone else, read in
						// place of the short text.
						pill.title = b.label;
						pill.innerHTML = `<span aria-hidden="true">${ esc(
							b.text
						) }</span><span class="riff-app-sr">${ esc( b.label ) }</span>`;
					}
					return pill;
				} )
			);
		}
		for ( const area of $$( '[data-riff-area="controls"]' ) ) {
			area.replaceChildren(
				...controls.map( ( c ) => {
					const button = document.createElement( 'button' );
					button.type = 'button';
					button.className = `riff-btn riff-control riff-control-${ c.id }`;
					button.dataset.riffControl = c.id;
					button.setAttribute( 'aria-label', c.label );
					if ( 'pressed' in c ) {
						button.setAttribute(
							'aria-pressed',
							String( !! c.pressed )
						);
					}
					// An icon from Riff's own code, never from the page.
					button.innerHTML = c.icon || '';
					button.addEventListener( 'click', () => {
						c.run( P.track() );
						areas();
					} );
					return button;
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

	return { paint: paintAll, progress, seekers, setProgress, areas, text };
}
