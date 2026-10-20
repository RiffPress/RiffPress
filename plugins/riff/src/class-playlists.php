<?php
/**
 * Playlists people make: private posts holding core's Playlist block, owned by their user.
 *
 * @since 4.20.0
 * @package Riff
 */

namespace Riff;

use WP_Error;
use WP_Post;
use WP_REST_Request;
use WP_REST_Response;

defined( 'ABSPATH' ) || exit;

/**
 * A listener's playlists.
 *
 * A playlist is a post of the riff_playlist type, private, with its listener as its author, and its
 * tracks as the playlist-track blocks of one core Playlist block (WordPress 7.1) in its content. So
 * it lives in wp_posts with no table of its own, opens in the block editor for someone who can edit
 * it, and its tracks are read the way Riff reads any Playlist block. The routes under
 * riff/v1/users/me/playlists make, change and delete them, for the signed-in user, or for a user ID
 * by someone who may edit that user.
 */
final class Playlists {

	/**
	 * The post type.
	 *
	 * @since 4.20.0
	 */
	public const TYPE = 'riff_playlist';

	/**
	 * Tracks a playlist holds at most.
	 *
	 * @since 4.20.0
	 */
	public const MAX_TRACKS = 500;

	/**
	 * Hooks the post type, the routes and the player's data.
	 *
	 * @since 4.20.0
	 */
	public static function register(): void {
		add_action( 'init', array( self::class, 'post_type' ) );
		add_action( 'rest_api_init', array( self::class, 'routes' ) );
	}

	/**
	 * Registers riff_playlist: private by default, in the editor for whoever may edit posts, out
	 * of the site's archives, feeds and search.
	 *
	 * @since 4.20.0
	 */
	public static function post_type(): void {
		register_post_type(
			self::TYPE,
			array(
				'labels'              => array(
					'name'          => __( 'Playlists', 'riff' ),
					'singular_name' => __( 'Playlist', 'riff' ),
					'add_new_item'  => __( 'Add playlist', 'riff' ),
					'edit_item'     => __( 'Edit playlist', 'riff' ),
					'all_items'     => __( 'Playlists', 'riff' ),
				),
				'description'         => __( 'Playlists listeners make in the Listen block.', 'riff' ),
				'public'              => false,
				'show_ui'             => true,
				'show_in_menu'        => 'upload.php',
				'show_in_rest'        => true,
				'exclude_from_search' => true,
				'has_archive'         => false,
				'rewrite'             => false,
				'query_var'           => false,
				'menu_icon'           => 'dashicons-playlist-audio',
				'supports'            => array( 'title', 'editor', 'author' ),
				'capability_type'     => 'post',
				'map_meta_cap'        => true,
				'template'            => array( array( 'core/playlist' ) ),
			)
		);
	}

	/**
	 * Registers the routes.
	 *
	 * @since 4.20.0
	 */
	public static function routes(): void {
		$user   = array(
			'description' => __( 'Whose: me for the signed-in user, or a user ID, for someone who may edit that user.', 'riff' ),
			'type'        => 'string',
			'pattern'     => '^(me|\\d+)$',
		);
		$id     = array(
			'description' => __( 'The playlist\'s post ID.', 'riff' ),
			'type'        => 'integer',
			'minimum'     => 1,
		);
		$tracks = array(
			'description' => __( 'Tracks, by their audio attachments\' IDs, in order.', 'riff' ),
			'type'        => 'array',
			'items'       => array(
				'type'    => 'integer',
				'minimum' => 1,
			),
			'maxItems'    => self::MAX_TRACKS,
		);
		$title  = array(
			'description' => __( 'The playlist\'s name.', 'riff' ),
			'type'        => 'string',
			'minLength'   => 1,
			'maxLength'   => 200,
		);
		$base   = '/users/(?P<user>me|\d+)/playlists';
		/**
		 * GET and POST /riff/v1/users/me/playlists: the signed-in user's playlists, the most recently
		 * changed first, and making one, empty or with tracks.
		 *
		 * @since 4.20.0
		 */
		register_rest_route(
			Library::REST,
			$base,
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( self::class, 'rest_list' ),
					'permission_callback' => array( Likes::class, 'allowed' ),
					'args'                => array( 'user' => $user ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( self::class, 'rest_create' ),
					'permission_callback' => array( Likes::class, 'allowed' ),
					'args'                => array(
						'user'   => $user,
						'title'  => $title + array( 'required' => true ),
						'tracks' => $tracks,
					),
				),
				'schema' => array( self::class, 'list_schema' ),
			)
		);
		/**
		 * GET, POST and DELETE /riff/v1/users/me/playlists/{id}: one playlist with its tracks;
		 * renaming it or setting its tracks in a new order; and deleting it, to the trash.
		 *
		 * @since 4.20.0
		 */
		register_rest_route(
			Library::REST,
			$base . '/(?P<id>\d+)',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( self::class, 'rest_get' ),
					'permission_callback' => array( self::class, 'allowed' ),
					'args'                => array(
						'user' => $user,
						'id'   => $id,
					),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( self::class, 'rest_update' ),
					'permission_callback' => array( self::class, 'allowed' ),
					'args'                => array(
						'user'   => $user,
						'id'     => $id,
						'title'  => $title,
						'tracks' => $tracks,
					),
				),
				array(
					'methods'             => 'DELETE',
					'callback'            => array( self::class, 'rest_delete' ),
					'permission_callback' => array( self::class, 'allowed' ),
					'args'                => array(
						'user' => $user,
						'id'   => $id,
					),
				),
				'schema' => array( self::class, 'playlist_schema' ),
			)
		);
		/**
		 * POST /riff/v1/users/me/playlists/{id}/tracks: adds tracks to the end of a playlist.
		 *
		 * @since 4.20.0
		 */
		register_rest_route(
			Library::REST,
			$base . '/(?P<id>\d+)/tracks',
			array(
				array(
					'methods'             => 'POST',
					'callback'            => array( self::class, 'rest_add' ),
					'permission_callback' => array( self::class, 'allowed' ),
					'args'                => array(
						'user'   => $user,
						'id'     => $id,
						'tracks' => $tracks + array( 'required' => true ),
					),
				),
				'schema' => array( self::class, 'playlist_schema' ),
			)
		);
		/**
		 * DELETE /riff/v1/users/me/playlists/{id}/tracks/{index}: takes the track at a place in a
		 * playlist out, counting from 0, so one of two copies of a track can go.
		 *
		 * @since 4.20.0
		 */
		register_rest_route(
			Library::REST,
			$base . '/(?P<id>\d+)/tracks/(?P<index>\d+)',
			array(
				array(
					'methods'             => 'DELETE',
					'callback'            => array( self::class, 'rest_remove' ),
					'permission_callback' => array( self::class, 'allowed' ),
					'args'                => array(
						'user'  => $user,
						'id'    => $id,
						'index' => array(
							'description' => __( 'The track\'s place in the playlist, from 0.', 'riff' ),
							'type'        => 'integer',
							'minimum'     => 0,
						),
					),
				),
				'schema' => array( self::class, 'playlist_schema' ),
			)
		);
	}

	/**
	 * Whether the request may see and change this playlist: as for likes, and the playlist must be
	 * one of that user's.
	 *
	 * @since 4.20.0
	 *
	 * @param WP_REST_Request $request Request.
	 * @return true|WP_Error
	 */
	public static function allowed( WP_REST_Request $request ) {
		$allowed = Likes::allowed( $request );
		if ( true !== $allowed ) {
			return $allowed;
		}
		if ( ! self::owned( (int) $request['id'], self::user( $request ) ) ) {
			return new WP_Error( 'rest_post_invalid_id', __( 'Invalid playlist ID.', 'riff' ), array( 'status' => 404 ) );
		}
		return true;
	}

	/**
	 * GET a user's playlists.
	 *
	 * @since 4.20.0
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function rest_list( WP_REST_Request $request ): WP_REST_Response {
		return new WP_REST_Response( array( 'items' => self::all( self::user( $request ) ) ) );
	}

	/**
	 * POST a new playlist.
	 *
	 * @since 4.20.0
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function rest_create( WP_REST_Request $request ) {
		$id = self::create( self::user( $request ), (string) $request['title'], (array) $request['tracks'] );
		if ( is_wp_error( $id ) ) {
			return $id;
		}
		$response = new WP_REST_Response( self::detail( get_post( $id ) ) );
		$response->set_status( 201 );
		return $response;
	}

	/**
	 * GET one playlist.
	 *
	 * @since 4.20.0
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function rest_get( WP_REST_Request $request ): WP_REST_Response {
		return new WP_REST_Response( self::detail( get_post( (int) $request['id'] ) ) );
	}

	/**
	 * POST a new name or a new order.
	 *
	 * @since 4.20.0
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function rest_update( WP_REST_Request $request ): WP_REST_Response {
		$id = (int) $request['id'];
		if ( null !== $request['title'] ) {
			self::save( $id, array( 'post_title' => self::title( (string) $request['title'] ) ) );
		}
		if ( null !== $request['tracks'] ) {
			self::set_tracks( $id, (array) $request['tracks'] );
		}
		return self::rest_get( $request );
	}

	/**
	 * DELETE a playlist, to the trash, where someone who can edit it may restore it.
	 *
	 * @since 4.20.0
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function rest_delete( WP_REST_Request $request ): WP_REST_Response {
		$id   = (int) $request['id'];
		$gone = self::summary( get_post( $id ) );
		wp_trash_post( $id );
		return new WP_REST_Response(
			array(
				'deleted'  => true,
				'previous' => $gone,
			)
		);
	}

	/**
	 * POST tracks onto the end of a playlist.
	 *
	 * @since 4.20.0
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function rest_add( WP_REST_Request $request ): WP_REST_Response {
		$id = (int) $request['id'];
		self::set_tracks( $id, array_merge( self::ids( get_post( $id ) ), (array) $request['tracks'] ) );
		return self::rest_get( $request );
	}

	/**
	 * DELETE the track at a place.
	 *
	 * @since 4.20.0
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function rest_remove( WP_REST_Request $request ) {
		$id    = (int) $request['id'];
		$ids   = self::ids( get_post( $id ) );
		$index = (int) $request['index'];
		if ( ! isset( $ids[ $index ] ) ) {
			return new WP_Error( 'rest_invalid_param', __( 'There is no track at that place.', 'riff' ), array( 'status' => 400 ) );
		}
		array_splice( $ids, $index, 1 );
		self::set_tracks( $id, $ids );
		return self::rest_get( $request );
	}

	/**
	 * Makes a playlist for a user.
	 *
	 * @since 4.20.0
	 *
	 * @param int    $user_id User ID.
	 * @param string $title   Its name.
	 * @param int[]  $tracks  Track IDs, in order.
	 * @return int|WP_Error The playlist's post ID.
	 */
	public static function create( int $user_id, string $title, array $tracks = array() ) {
		$id = wp_insert_post(
			array(
				'post_type'    => self::TYPE,
				'post_status'  => 'private',
				'post_author'  => $user_id,
				'post_title'   => self::title( $title ),
				'post_content' => self::content( self::valid( $tracks ) ),
			),
			true
		);
		return is_wp_error( $id ) ? $id : (int) $id;
	}

	/**
	 * A user's playlists, the most recently changed first, each as summary() has it.
	 *
	 * @since 4.20.0
	 *
	 * @param int $user_id User ID.
	 * @return array[]
	 */
	public static function all( int $user_id ): array {
		if ( $user_id <= 0 ) {
			return array();
		}
		$posts = get_posts(
			array(
				'post_type'        => self::TYPE,
				'post_status'      => array( 'private', 'publish', 'draft' ),
				'author'           => $user_id,
				'posts_per_page'   => 100,
				'orderby'          => array(
					'modified' => 'DESC',
					'ID'       => 'DESC',
				),
				'suppress_filters' => false,
			)
		);
		return array_map( array( self::class, 'summary' ), $posts );
	}

	/**
	 * A playlist in brief: ID, name, how many tracks, and up to four covers for its mosaic.
	 *
	 * @since 4.20.0
	 *
	 * @param WP_Post $post The playlist.
	 * @return array
	 */
	public static function summary( WP_Post $post ): array {
		$ids    = self::ids( $post );
		$covers = array();
		foreach ( array_unique( $ids ) as $track ) {
			// Covers come from the tracks the requester can see, as the tracks themselves do.
			if ( ! Catalog_Rest::visible( $track ) ) {
				continue;
			}
			$art = Tracks::from_attachment( $track, (int) get_post_field( 'post_parent', $track ) )['art'] ?? array();
			$src = $art ? (string) end( $art )['src'] : '';
			if ( '' !== $src && ! in_array( $src, $covers, true ) ) {
				$covers[] = $src;
			}
			if ( count( $covers ) >= 4 ) {
				break;
			}
		}
		return array(
			'id'       => (int) $post->ID,
			// Its own name; get_the_title() would put "Private:" before it.
			'title'    => (string) $post->post_title,
			'count'    => count( $ids ),
			'covers'   => $covers,
			'modified' => (string) get_post_modified_time( 'c', true, $post ),
		);
	}

	/**
	 * A playlist with its tracks, in the track shape, in its order. A track the requester can no
	 * longer see is left out of `tracks` but kept in `ids`, so the playlist's places stay true.
	 *
	 * @since 4.20.0
	 *
	 * @param WP_Post $post The playlist.
	 * @return array
	 */
	public static function detail( WP_Post $post ): array {
		$ids   = self::ids( $post );
		$found = array();
		if ( $ids ) {
			$request = new WP_REST_Request( 'GET', '/' . Library::REST . '/tracks' );
			$request->set_query_params(
				array(
					'include'  => array_values( array_unique( $ids ) ),
					'per_page' => 100,
				)
			);
			foreach ( array_chunk( array_values( array_unique( $ids ) ), 100 ) as $chunk ) {
				$request->set_param( 'include', $chunk );
				$response = rest_do_request( $request );
				foreach ( $response->is_error() ? array() : (array) $response->get_data()['items'] as $track ) {
					$found[ (int) $track['id'] ] = $track;
				}
			}
		}
		$tracks = array();
		foreach ( $ids as $index => $id ) {
			if ( isset( $found[ $id ] ) ) {
				$tracks[] = $found[ $id ] + array( 'index' => $index );
			}
		}
		return self::summary( $post ) + array(
			'ids'    => $ids,
			'tracks' => $tracks,
		);
	}

	/**
	 * A playlist's track IDs, in order, from its Playlist block.
	 *
	 * @since 4.20.0
	 *
	 * @param WP_Post|null $post The playlist.
	 * @return int[]
	 */
	public static function ids( ?WP_Post $post ): array {
		if ( ! $post ) {
			return array();
		}
		foreach ( parse_blocks( $post->post_content ) as $block ) {
			if ( 'core/playlist' === ( $block['blockName'] ?? '' ) ) {
				return array_map( static fn( $track ) => (int) $track['attrs']['id'], Blocks_Source::playlist_tracks( $block ) );
			}
		}
		return array();
	}

	/**
	 * Sets a playlist's tracks, in order.
	 *
	 * @since 4.20.0
	 *
	 * @param int   $id     The playlist's post ID.
	 * @param int[] $tracks Track IDs.
	 */
	public static function set_tracks( int $id, array $tracks ): void {
		self::save( $id, array( 'post_content' => self::content( self::valid( $tracks ) ) ) );
	}

	/**
	 * Whether a playlist is a user's.
	 *
	 * @param int $id      Post ID.
	 * @param int $user_id User ID.
	 * @return bool
	 */
	private static function owned( int $id, int $user_id ): bool {
		$post = get_post( $id );
		return $post instanceof WP_Post && self::TYPE === $post->post_type && 'trash' !== $post->post_status && (int) $post->post_author === $user_id && $user_id > 0;
	}

	/**
	 * Updates a playlist's post without changing who wrote it.
	 *
	 * @param int   $id     Post ID.
	 * @param array $fields Fields.
	 */
	private static function save( int $id, array $fields ): void {
		wp_update_post( wp_slash( array( 'ID' => $id ) + $fields ) );
	}

	/**
	 * The Playlist block holding these tracks, as the editor saves it.
	 *
	 * @param int[] $tracks Track IDs.
	 * @return string
	 */
	private static function content( array $tracks ): string {
		$inner = array();
		foreach ( $tracks as $track ) {
			$inner[] = array(
				'blockName'    => 'core/playlist-track',
				'attrs'        => array(
					'id'    => $track,
					'src'   => (string) wp_get_attachment_url( $track ),
					'title' => get_the_title( $track ),
				),
				'innerBlocks'  => array(),
				'innerHTML'    => '',
				'innerContent' => array(),
			);
		}
		return serialize_block(
			array(
				'blockName'    => 'core/playlist',
				'attrs'        => array(),
				'innerBlocks'  => $inner,
				'innerHTML'    => '<figure class="wp-block-playlist"><ol class="wp-block-playlist__tracklist"></ol></figure>',
				'innerContent' => array_merge(
					array( '<figure class="wp-block-playlist"><ol class="wp-block-playlist__tracklist">' ),
					array_fill( 0, count( $inner ), null ),
					array( '</ol></figure>' )
				),
			)
		);
	}

	/**
	 * Track IDs that name audio in the Media Library, no more than MAX_TRACKS.
	 *
	 * @param array $tracks IDs.
	 * @return int[]
	 */
	private static function valid( array $tracks ): array {
		$ok = array();
		foreach ( $tracks as $track ) {
			$track = (int) $track;
			if ( $track > 0 && 'attachment' === get_post_type( $track ) && str_starts_with( (string) get_post_mime_type( $track ), 'audio/' ) ) {
				$ok[] = $track;
			}
		}
		return array_slice( $ok, 0, self::MAX_TRACKS );
	}

	/**
	 * A playlist's name: plain text, never empty.
	 *
	 * @param string $title Name given.
	 * @return string
	 */
	private static function title( string $title ): string {
		$title = trim( sanitize_text_field( $title ) );
		return '' !== $title ? mb_substr( $title, 0, 200 ) : __( 'New playlist', 'riff' );
	}

	/**
	 * The user a request names: the signed-in user for me, or the ID given.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return int User ID.
	 */
	private static function user( WP_REST_Request $request ): int {
		$user = (string) $request['user'];
		return 'me' === $user || '' === $user ? get_current_user_id() : (int) $user;
	}

	/**
	 * The signed-in user's playlists for the player, for Add to playlist, with where to send them.
	 *
	 * @since 4.20.0
	 *
	 * @param array $data The player's data.
	 * @return array
	 */
	public static function player_data( $data ) {
		if ( ! is_array( $data ) ) {
			return $data;
		}
		if ( true !== Likes::allowed() ) {
			// A visitor is offered a way to sign in instead.
			$data['signIn'] = wp_login_url( (string) ( is_singular() ? get_permalink() : home_url( add_query_arg( array() ) ) ) );
			return $data;
		}
		$data['me']['playlists']         = array_map(
			static fn( array $p ): array => array(
				'id'    => $p['id'],
				'title' => $p['title'],
				'count' => $p['count'],
			),
			self::all( get_current_user_id() )
		);
		$data['me']['rest']['playlists'] = rest_url( Library::REST . '/users/me/playlists' );
		return $data;
	}

	/**
	 * The shape of the list of playlists.
	 *
	 * @since 4.20.0
	 * @return array JSON Schema.
	 */
	public static function list_schema(): array {
		return array(
			'$schema'     => 'http://json-schema.org/draft-04/schema#',
			'title'       => 'riff-playlists',
			'description' => __( 'A user\'s playlists, the most recently changed first. Each is a private riff_playlist post holding a core Playlist block.', 'riff' ),
			'type'        => 'object',
			'properties'  => array(
				'items' => array(
					'type'  => 'array',
					'items' => self::summary_schema(),
				),
			),
		);
	}

	/**
	 * The shape of one playlist.
	 *
	 * @since 4.20.0
	 * @return array JSON Schema.
	 */
	public static function playlist_schema(): array {
		$schema                         = self::summary_schema();
		$schema['$schema']              = 'http://json-schema.org/draft-04/schema#';
		$schema['title']                = 'riff-playlist';
		$schema['properties']['ids']    = array(
			'description' => __( 'Every track\'s ID, in order, including any the requester cannot see.', 'riff' ),
			'type'        => 'array',
			'items'       => array( 'type' => 'integer' ),
		);
		$track                          = Tracks::schema();
		$track['properties']['index']   = array(
			'description' => __( 'The track\'s place in the playlist, from 0.', 'riff' ),
			'type'        => 'integer',
		);
		$schema['properties']['tracks'] = array(
			'description' => __( 'The tracks the requester can see, in the track shape, in order.', 'riff' ),
			'type'        => 'array',
			'items'       => array_diff_key( $track, array_flip( array( '$schema', 'title' ) ) ),
		);
		return $schema;
	}

	/**
	 * The shape of a playlist in brief.
	 *
	 * @return array
	 */
	private static function summary_schema(): array {
		return array(
			'type'       => 'object',
			'properties' => array(
				'id'       => array( 'type' => 'integer' ),
				'title'    => array( 'type' => 'string' ),
				'count'    => array(
					'description' => __( 'How many tracks it holds.', 'riff' ),
					'type'        => 'integer',
				),
				'covers'   => array(
					'description' => __( 'Up to four covers from its first tracks, for a mosaic.', 'riff' ),
					'type'        => 'array',
					'items'       => array( 'type' => 'string' ),
				),
				'modified' => array(
					'description' => __( 'When it last changed.', 'riff' ),
					'type'        => 'string',
					'format'      => 'date-time',
				),
			),
		);
	}
}
