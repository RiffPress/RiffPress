<?php
/**
 * One of the signed-in listener's playlists, inside the Listen block.
 *
 * @since 4.20.0
 * @package Riff
 */

namespace Riff\Listen;

use WP_REST_Request;

use Riff\Library;

defined( 'ABSPATH' ) || exit;

/**
 * The playlist view, at ?riff_playlist={id}.
 *
 * Drawn as the apps draw a playlist: the mosaic of its first covers, its name and how many songs,
 * Play and Shuffle, Rename and Delete, then its tracks as rows. The data comes from
 * riff/v1/users/me/playlists/{id}, so only the playlist's own listener sees it. Moving and taking
 * out a track is in each row's … menu, which app.js adds to.
 */
final class Playlist_View {

	/**
	 * The most rows a page of a playlist draws.
	 */
	private const PER_PAGE = 100;

	/**
	 * Renders the view, a hundred rows at a time.
	 *
	 * @since 4.20.0
	 * @since 5.7.0 A page at a time.
	 *
	 * @param string $page   The Listen page's address.
	 * @param int    $id     The playlist's post ID.
	 * @param int    $number Page of rows.
	 * @return string
	 */
	public static function view( string $page, int $id, int $number = 1 ): string {
		$response = rest_do_request( new WP_REST_Request( 'GET', '/' . Library::REST . '/users/me/playlists/' . $id ) );
		if ( $response->is_error() ) {
			return Ui::title( __( 'Playlist', 'riff' ) ) . Ui::empty_note( __( 'This playlist isn’t here. It may have been deleted, or it may be someone else’s.', 'riff' ) );
		}
		$list  = (array) $response->get_data();
		$count = (int) $list['count'];
		$extra = sprintf(
			'<button type="button" class="riff-pill" data-riff-app-action="rename-playlist" data-riff-playlist="%1$d">%2$s</button><button type="button" class="riff-pill" data-riff-app-action="delete-playlist" data-riff-playlist="%1$d">%3$s</button>',
			(int) $list['id'],
			esc_html__( 'Rename', 'riff' ),
			esc_html__( 'Delete', 'riff' )
		);
		/* translators: %s: number of songs. */
		$meta = sprintf( _n( '%s song', '%s songs', $count, 'riff' ), number_format_i18n( $count ) );
		$html = App::header( (string) $list['title'], $meta, __( 'Playlist', 'riff' ), '', '', false, '', 0, (array) $list['covers'], $extra );
		if ( ! $list['tracks'] ) {
			return $html . Ui::empty_note( __( 'Nothing in it yet. Choose Add to playlist in the … menu beside any track.', 'riff' ) );
		}
		$pages  = (int) ceil( count( $list['tracks'] ) / self::PER_PAGE );
		$number = min( max( 1, $number ), $pages );
		$rows   = array_slice( $list['tracks'], ( $number - 1 ) * self::PER_PAGE, self::PER_PAGE );
		// A row pressed plays on into the rest of the playlist after this page, from the tracks
		// route by ID, as many as it gives at once.
		$rest = array_values( array_unique( array_map( 'intval', wp_list_pluck( array_slice( $list['tracks'], $number * self::PER_PAGE ), 'id' ) ) ) );
		$more = $rest ? array(
			'url'   => add_query_arg(
				array(
					'include'  => implode( ',', $rest ),
					'orderby'  => 'include',
					'per_page' => self::PER_PAGE,
				),
				rest_url( Library::REST . '/tracks' )
			),
			'page'  => 0,
			'pages' => (int) ceil( count( $rest ) / self::PER_PAGE ),
		) : array();
		// Each row's place in the playlist, for Move and Remove; a track the listener can no longer
		// see is not drawn, so the places can skip.
		return $html . sprintf(
			'<div class="riff-playlist-tracks" data-riff-playlist="%d" data-riff-ids="%s" data-riff-places="%s">%s</div>',
			(int) $list['id'],
			esc_attr( (string) wp_json_encode( array_map( 'intval', (array) $list['ids'] ) ) ),
			esc_attr( (string) wp_json_encode( array_map( 'intval', wp_list_pluck( $rows, 'index' ) ) ) ),
			Browse::rows( $rows, false, false, $more )
		) . Browse::next(
			add_query_arg( Browse::PLAYLIST, (int) $list['id'], $page ),
			array(
				'page'  => $number,
				'pages' => $pages,
			)
		);
	}

	/**
	 * A playlist as a card: its mosaic, its name, and how many songs.
	 *
	 * @since 4.20.0
	 *
	 * @param array  $playlist A playlist from the route.
	 * @param string $page     The Listen page's address.
	 * @return string
	 */
	public static function card( array $playlist, string $page ): string {
		$count = (int) $playlist['count'];
		return Ui::card(
			array(
				'title'  => (string) $playlist['title'],
				'href'   => add_query_arg( Browse::PLAYLIST, (int) $playlist['id'], $page ),
				/* translators: %s: number of songs. */
				'sub'    => sprintf( _n( 'Playlist · %s song', 'Playlist · %s songs', $count, 'riff' ), number_format_i18n( $count ) ),
				'covers' => (array) ( $playlist['covers'] ?? array() ),
				'class'  => 'riff-card-playlist',
				'data'   => array( 'playlist' => (int) $playlist['id'] ),
				'play'   => $count ? array(
					'action' => 'play-playlist',
					'label'  => sprintf( /* translators: %s: playlist name. */ __( 'Play %s', 'riff' ), (string) $playlist['title'] ),
					'data'   => array( 'playlist' => (int) $playlist['id'] ),
				) : array(),
			)
		);
	}

	/**
	 * The signed-in listener's playlists, or none for a visitor.
	 *
	 * @since 4.20.0
	 *
	 * @return array[]
	 */
	public static function mine(): array {
		$response = rest_do_request( new WP_REST_Request( 'GET', '/' . Library::REST . '/users/me/playlists' ) );
		return $response->is_error() ? array() : (array) ( $response->get_data()['items'] ?? array() );
	}
}
