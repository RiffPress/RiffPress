/* The track menu: … beside every row and every track in Up next. The Listen app adds a playlist's
 * own items through internal.listen( 'menu' ). */
import { fmt } from 'riff-player/helpers';

// Strings are WordPress translations of this module (wp_set_script_module_translations()).
// Core prints wp.i18n only when there are translations, so without it the strings are the
// English they are written in.
const __ = window.wp?.i18n?.__ || ( ( english ) => english );

export function menu( P ) {
	const { root, data, me, own } = P;
	const el = document.createElement( 'div' );
	el.className = 'riff-menu';
	el.setAttribute( 'role', 'menu' );
	el.hidden = true;
	root.append( el );
	let menuFor = null;
	const DOTS =
		'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>';

	function menuItems( t, at, button ) {
		const items = [
			{
				id: 'next',
				label: __( 'Play next', 'riff' ),
				run: () => {
					P.internal.playNext( [ t ] );
					P.toast(
						fmt(
							/* translators: %s: track title. */ __(
								'%s plays next',
								'riff'
							),
							t.title
						)
					);
				},
			},
			{
				id: 'add',
				label: __( 'Add to queue', 'riff' ),
				run: () => {
					P.internal.addToQueue( [ t ] );
					P.toast(
						fmt(
							/* translators: %s: track title. */ __(
								'%s added to the queue',
								'riff'
							),
							t.title
						)
					);
				},
			},
		];
		if ( P.inLibrary( t ) ) {
			items.push( {
				id: 'like',
				label: P.isLiked( t.id )
					? __( 'Remove from Liked songs', 'riff' )
					: __( 'Add to Liked songs', 'riff' ),
				run: () => P.toggleLike( t ),
			} );
			if ( me ) {
				items.push( {
					id: 'playlist',
					label: __( 'Add to playlist', 'riff' ),
					run: () => openMenu( button, t, at, P.playlistItems( t ) ),
				} );
			} else if ( data.signIn ) {
				items.push( {
					id: 'playlist',
					label: __( 'Sign in to add to a playlist', 'riff' ),
					href: data.signIn,
				} );
			}
		}
		if ( at !== undefined ) {
			if ( at > 0 ) {
				items.push( {
					id: 'up',
					label: __( 'Move up', 'riff' ),
					run: () => P.moveAndFocus( at, at - 1 ),
				} );
			}
			if ( at < P.order.length - 1 ) {
				items.push( {
					id: 'down',
					label: __( 'Move down', 'riff' ),
					run: () => P.moveAndFocus( at, at + 1 ),
				} );
			}
			if ( at !== P.pos ) {
				items.push( {
					id: 'remove',
					label: __( 'Remove from queue', 'riff' ),
					run: () => P.remove( at ),
				} );
			}
		}
		if ( t.post?.url ) {
			items.push( {
				id: 'post',
				label: __( 'Go to post', 'riff' ),
				href: t.post.url,
			} );
		}
		const context =
			at === undefined
				? {
						where: 'row',
						element: button?.closest( '[data-riff-track]' ) || null,
					}
				: { where: 'queue', index: at };
		return [ ...own.menu ].reduce(
			( list, fn ) => fn( list, t, context ),
			items
		);
	}

	function openMenu( button, t, at, list = null ) {
		closeMenu( false );
		const items = ( list || menuItems( t, at, button ) || [] ).filter(
			( i ) => i && i.label && ( typeof i.run === 'function' || i.href )
		);
		el.replaceChildren(
			...items.map( ( i ) => {
				const item = document.createElement( i.href ? 'a' : 'button' );
				if ( i.href ) {
					item.href = i.href;
				} else {
					item.type = 'button';
				}
				item.setAttribute( 'role', 'menuitem' );
				item.tabIndex = -1;
				item.textContent = i.label;
				item.addEventListener( 'click', ( e ) => {
					if ( i.run ) {
						e.preventDefault();
						closeMenu();
						i.run();
					} else {
						closeMenu( false );
					}
				} );
				return item;
			} )
		);
		// The player is hidden until something plays, and the menu would be too; before then it
		// opens from the page itself. Opened from Now Playing it goes inside the dialog, where a
		// screen reader kept to it can reach it.
		( root.hidden
			? document.body
			: ( ! P.np.hidden && P.np ) || root
		).append( el );
		el.hidden = false;
		const r = button.getBoundingClientRect();
		const w = el.offsetWidth;
		const h = el.offsetHeight;
		el.style.left = `${ Math.max( 8, Math.min( r.right - w, window.innerWidth - w - 8 ) ) }px`;
		el.style.top = `${ r.bottom + h + 8 > window.innerHeight ? Math.max( 8, r.top - h - 4 ) : r.bottom + 4 }px`;
		button.setAttribute( 'aria-expanded', 'true' );
		menuFor = button;
		el.firstElementChild?.focus();
	}

	function closeMenu( refocus = true ) {
		if ( el.hidden ) {
			return;
		}
		el.hidden = true;
		menuFor?.setAttribute( 'aria-expanded', 'false' );
		if ( refocus && menuFor?.isConnected ) {
			menuFor.focus();
		}
		menuFor = null;
	}

	el.addEventListener( 'keydown', ( e ) => {
		const items = [ ...el.children ];
		const i = items.indexOf( document.activeElement );
		const to = {
			ArrowDown: ( i + 1 ) % items.length,
			ArrowUp: ( i - 1 + items.length ) % items.length,
			Home: 0,
			End: items.length - 1,
		}[ e.key ];
		if ( to !== undefined ) {
			e.preventDefault();
			items[ to ]?.focus();
		} else if ( e.key === 'Escape' ) {
			e.preventDefault();
			e.stopPropagation();
			closeMenu();
		} else if ( e.key === 'Tab' ) {
			closeMenu( false );
		}
	} );
	document.addEventListener( 'pointerdown', ( e ) => {
		if (
			! el.hidden &&
			! el.contains( e.target ) &&
			! menuFor?.contains( e.target )
		) {
			closeMenu( false );
		}
	} );
	window.addEventListener( 'resize', () => closeMenu( false ) );

	function moreButton( t, at ) {
		const b = document.createElement( 'button' );
		b.type = 'button';
		b.className = 'riff-more-button';
		b.setAttribute( 'aria-haspopup', 'menu' );
		b.setAttribute( 'aria-expanded', 'false' );
		b.setAttribute(
			'aria-label',
			fmt(
				/* translators: %s: track title. */ __(
					'More options for %s',
					'riff'
				),
				t.title
			)
		);
		b.innerHTML = DOTS;
		b.addEventListener( 'click', ( e ) => {
			e.stopPropagation();
			if ( menuFor === b ) {
				closeMenu();
			} else {
				openMenu( b, t, at );
			}
		} );
		return b;
	}

	return { moreButton, openMenu, closeMenu };
}
