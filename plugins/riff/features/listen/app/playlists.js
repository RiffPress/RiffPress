/* Playlists. Made, renamed and deleted from Your Library and a playlist's page; tracks moved and
 * taken out from each row's … menu, which this adds to through api.listen( 'menu' ). Every change
 * goes through the player's api. */
import { esc, fmt, parse } from 'riff-app/helpers';

export function playlists( ctx ) {
	const { api, view, __, tell, speak, playError } = ctx;

	const failed = () =>
		tell( __( 'The playlist could not be changed. Try again.', 'riff' ) );

	function playlistAction( action ) {
		const kind = action?.dataset.riffAppAction;
		const id = Number( action?.dataset.riffPlaylist );
		if ( kind === 'new-playlist' ) {
			api.createPlaylist( __( 'New playlist', 'riff' ) ).then( ( p ) => {
				const to = ctx.postOf( ctx.listAddress( p.id ) );
				if ( to ) {
					ctx.show( to ).catch( () => {} );
				}
			}, failed );
			return true;
		}
		if ( kind === 'play-playlist' ) {
			api.playlist( id ).then(
				( p ) => {
					if ( p.tracks?.length ) {
						api.play( p.tracks, 0 );
					}
				},
				() => tell( playError() )
			);
			return true;
		}
		if ( kind === 'rename-playlist' ) {
			rename( action, id );
			return true;
		}
		if ( kind === 'delete-playlist' ) {
			const name =
				view.querySelector( '.riff-album-title' )?.textContent || '';
			// The browser's own confirmation, as core's list tables ask before deleting.
			// eslint-disable-next-line no-alert
			const sure = window.confirm(
				fmt(
					/* translators: %s: playlist name. */ __(
						'Delete %s? It goes to the trash, where a site admin can restore it.',
						'riff'
					),
					name
				)
			);
			if ( sure ) {
				api.deletePlaylist( id ).then( () => {
					speak(
						fmt(
							/* translators: %s: playlist name. */ __(
								'%s deleted',
								'riff'
							),
							name
						)
					);
					const to = ctx.postOf( ctx.libraryAddress( 'playlists' ) );
					if ( to ) {
						ctx.show( to ).catch( () => {} );
					}
				}, failed );
			}
			return true;
		}
		return false;
	}

	// Renaming: the name becomes a field, Enter or Save keeps it, Escape or Cancel puts it back.
	function rename( button, id ) {
		const title = view.querySelector( '.riff-album-title' );
		if ( ! title || view.querySelector( '.riff-rename' ) ) {
			return;
		}
		const form = document.createElement( 'form' );
		form.className = 'riff-rename';
		form.innerHTML =
			`<label class="riff-app-sr" for="riff-rename">${ esc( __( 'Playlist name', 'riff' ) ) }</label>` +
			`<input id="riff-rename" type="text" maxlength="200" required value="${ esc( title.textContent ) }">` +
			`<button type="submit" class="riff-pill riff-pill-solid">${ esc( __( 'Save', 'riff' ) ) }</button>` +
			`<button type="button" class="riff-pill" data-riff-cancel>${ esc( __( 'Cancel', 'riff' ) ) }</button>`;
		title.hidden = true;
		title.after( form );
		const field = form.querySelector( 'input' );
		field.focus();
		field.select();
		const done = () => {
			form.remove();
			title.hidden = false;
			button.focus();
		};
		form.querySelector( '[data-riff-cancel]' ).addEventListener(
			'click',
			done
		);
		form.addEventListener( 'keydown', ( e ) => {
			if ( e.key === 'Escape' ) {
				e.preventDefault();
				e.stopPropagation();
				done();
			}
		} );
		form.addEventListener( 'submit', ( e ) => {
			e.preventDefault();
			e.stopPropagation();
			api.renamePlaylist( id, field.value ).then( () => {
				speak(
					fmt(
						/* translators: %s: the playlist's new name. */ __(
							'Renamed %s',
							'riff'
						),
						field.value.trim()
					)
				);
				ctx.redraw( () =>
					view.querySelector(
						'[data-riff-app-action="rename-playlist"]'
					)
				);
			}, failed );
		} );
	}

	// A row in a playlist's page gets Move up, Move down and Remove from this playlist.
	api.listen?.( 'menu', ( items, track, context ) => {
		const holder = context?.element?.closest?.( '[data-riff-playlist]' );
		if ( ! holder || ! view.contains( holder ) ) {
			return items;
		}
		const id = Number( holder.dataset.riffPlaylist );
		const ids = parse( holder.dataset.riffIds ) || [];
		const places = parse( holder.dataset.riffPlaces ) || [];
		const rows = [ ...holder.querySelectorAll( '[data-riff-track]' ) ];
		const at = rows.indexOf( context.element );
		const spot = places[ at ];
		if ( spot === undefined ) {
			return items;
		}
		// Found once the view is drawn again, in the new rows, not these.
		const rowMenu = ( n ) => () =>
			view
				.querySelectorAll( '[data-riff-playlist] [data-riff-track]' )
				[ n ]?.querySelector( '.riff-more-button' );
		const move = ( to ) => () => {
			const next = [ ...ids ];
			const [ moved ] = next.splice( spot, 1 );
			next.splice( places[ to ], 0, moved );
			api.setPlaylistTracks( id, next ).then(
				() => ctx.redraw( rowMenu( to ) ),
				failed
			);
		};
		const extra = [];
		if ( at > 0 ) {
			extra.push( {
				id: 'playlist-up',
				label: __( 'Move up', 'riff' ),
				run: move( at - 1 ),
			} );
		}
		if ( at < rows.length - 1 ) {
			extra.push( {
				id: 'playlist-down',
				label: __( 'Move down', 'riff' ),
				run: move( at + 1 ),
			} );
		}
		extra.push( {
			id: 'playlist-remove',
			label: __( 'Remove from this playlist', 'riff' ),
			run: () =>
				api.removeFromPlaylist( id, spot ).then( ( p ) => {
					tell(
						fmt(
							/* translators: %s: playlist name. */ __(
								'Removed from %s',
								'riff'
							),
							p.title
						)
					);
					ctx.redraw(
						() =>
							rowMenu( Math.min( at, rows.length - 2 ) )() ||
							view.querySelector( 'h2' )
					);
				}, failed ),
		} );
		return [ ...items, ...extra ];
	} );

	// A change to a playlist leaves every view drawn before it out of date, its sidebar included.
	api.listen?.( 'playlist', () => ctx.forget() );

	return { playlistAction };
}
