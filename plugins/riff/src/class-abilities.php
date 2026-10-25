<?php
/**
 * Riff's abilities, for AI tools and other plugins, through the Abilities API.
 *
 * @since 4.32.0
 * @package Riff
 */

namespace Riff;

use WP_Error;
use WP_REST_Request;

defined( 'ABSPATH' ) || exit;

/**
 * The abilities.
 *
 * Each one is a `riff/v1` route by another door: listing the library, its albums, artists and
 * tracks, and the signed-in user's likes, history and playlists; liking and unliking; adding a
 * track to a playlist and taking one out. An ability is run as a REST request to its route, so it
 * answers exactly what the route answers and is allowed exactly what the route allows: the
 * route's own permission callback decides. Nothing plays through an ability, since playback
 * happens in a browser, not on the server. Registered only where WordPress has the API.
 */
final class Abilities {

	/**
	 * The category every ability is filed under.
	 *
	 * @since 4.32.0
	 */
	public const CATEGORY = 'riff';

	/**
	 * Hooks the category and the abilities, where the Abilities API exists.
	 *
	 * @since 4.32.0
	 */
	public static function register(): void {
		if ( ! function_exists( 'wp_register_ability' ) ) {
			return;
		}
		add_action( 'wp_abilities_api_categories_init', array( self::class, 'category' ) );
		add_action( 'wp_abilities_api_init', array( self::class, 'abilities' ) );
	}

	/**
	 * Registers the category.
	 *
	 * @since 4.32.0
	 */
	public static function category(): void {
		wp_register_ability_category(
			self::CATEGORY,
			array(
				'label'       => __( 'Riff', 'riff' ),
				'description' => __( 'The music in the Media Library: its tracks, albums, artists and posts, and a listener\'s likes, history and playlists.', 'riff' ),
			)
		);
	}

	/**
	 * Every ability, keyed by name: the route it runs, what it takes and what it answers.
	 *
	 * @since 4.32.0
	 *
	 * @return array[] Each with label, description, method, route, input (JSON Schema properties),
	 *                 output (the route's schema) and readonly.
	 */
	public static function list(): array {
		$page   = array(
			'type'        => 'integer',
			'description' => __( 'Page of results, from 1.', 'riff' ),
			'minimum'     => 1,
		);
		$search = array(
			'type'        => 'string',
			'description' => __( 'Words to search for.', 'riff' ),
		);
		$kind   = array(
			'type'        => 'string',
			'enum'        => array( 'track', 'album', 'artist' ),
			'description' => __( 'What to like: a track, an album or an artist.', 'riff' ),
		);
		$id     = array(
			'type'        => 'integer',
			'description' => __( 'Its ID: an audio attachment, an album term or an artist term.', 'riff' ),
			'minimum'     => 1,
		);
		return array(
			'riff/tracks'               => array(
				'label'       => __( 'List tracks', 'riff' ),
				'description' => __( 'Lists the tracks the requester can see, searchable by title, artist or album, or those on one album or by one artist, a page at a time.', 'riff' ),
				'method'      => 'GET',
				'route'       => '/tracks',
				'input'       => array(
					'search'   => $search,
					'album'    => array(
						'type'        => 'integer',
						'description' => __( 'Only the tracks on this album, by term ID, in album order.', 'riff' ),
					),
					'artist'   => array(
						'type'        => 'integer',
						'description' => __( 'Only the tracks by this artist, by term ID.', 'riff' ),
					),
					'orderby'  => array(
						'type'        => 'string',
						'enum'        => array( 'title', 'added' ),
						'description' => __( 'By title, or the most recently added first.', 'riff' ),
					),
					'page'     => $page,
					'per_page' => array(
						'type'        => 'integer',
						'description' => __( 'Tracks per page, up to 100.', 'riff' ),
						'minimum'     => 1,
						'maximum'     => 100,
					),
				),
				'output'      => Catalog_Rest::tracks_schema(),
				'readonly'    => true,
			),
			'riff/albums'               => array(
				'label'       => __( 'List albums', 'riff' ),
				'description' => __( 'Lists the albums with a track the requester can see, by name, each with its artist, artwork and track count, searchable by name.', 'riff' ),
				'method'      => 'GET',
				'route'       => '/albums',
				'input'       => array(
					'search' => $search,
					'page'   => $page,
				),
				'output'      => Catalog_Rest::terms_schema( Catalog::ALBUM ),
				'readonly'    => true,
			),
			'riff/artists'              => array(
				'label'       => __( 'List artists', 'riff' ),
				'description' => __( 'Lists the artists with a track the requester can see, by name, each with a track count, searchable by name.', 'riff' ),
				'method'      => 'GET',
				'route'       => '/artists',
				'input'       => array(
					'search' => $search,
					'page'   => $page,
				),
				'output'      => Catalog_Rest::terms_schema( Catalog::ARTIST ),
				'readonly'    => true,
			),
			'riff/library'              => array(
				'label'       => __( 'List the library', 'riff' ),
				'description' => __( 'Lists the posts with music the requester can see, newest first, each with its title, artwork, track count and length, a page at a time.', 'riff' ),
				'method'      => 'GET',
				'route'       => '/library',
				'input'       => array( 'page' => $page ),
				'output'      => Library::list_schema(),
				'readonly'    => true,
			),
			'riff/likes'                => array(
				'label'       => __( 'List likes', 'riff' ),
				'description' => __( 'Lists what the signed-in user has liked: tracks, albums and artists, newest first.', 'riff' ),
				'method'      => 'GET',
				'route'       => '/users/me/likes',
				'input'       => array(),
				'output'      => Likes_Rest::likes_schema(),
				'readonly'    => true,
			),
			'riff/history'              => array(
				'label'       => __( 'List listening history', 'riff' ),
				'description' => __( 'Lists the tracks the signed-in user has played, most recent first.', 'riff' ),
				'method'      => 'GET',
				'route'       => '/users/me/history',
				'input'       => array(),
				'output'      => Likes_Rest::history_schema(),
				'readonly'    => true,
			),
			'riff/playlists'            => array(
				'label'       => __( 'List playlists', 'riff' ),
				'description' => __( 'Lists the signed-in user\'s playlists, each with its tracks.', 'riff' ),
				'method'      => 'GET',
				'route'       => '/users/me/playlists',
				'input'       => array(),
				'output'      => Playlists_Rest::list_schema(),
				'readonly'    => true,
			),
			'riff/like'                 => array(
				'label'       => __( 'Like', 'riff' ),
				'description' => __( 'Adds a track, album or artist to the signed-in user\'s likes.', 'riff' ),
				'method'      => 'POST',
				'route'       => '/users/me/likes',
				'input'       => array(
					'kind' => $kind + array( 'required' => true ),
					'id'   => $id + array( 'required' => true ),
				),
				'output'      => Likes_Rest::likes_schema(),
				'readonly'    => false,
			),
			'riff/unlike'               => array(
				'label'       => __( 'Unlike', 'riff' ),
				'description' => __( 'Takes a track, album or artist out of the signed-in user\'s likes.', 'riff' ),
				'method'      => 'DELETE',
				'route'       => '/users/me/likes/{kind}/{id}',
				'input'       => array(
					'kind' => $kind + array( 'required' => true ),
					'id'   => $id + array( 'required' => true ),
				),
				'output'      => Likes_Rest::likes_schema(),
				'readonly'    => false,
			),
			'riff/add-to-playlist'      => array(
				'label'       => __( 'Add to a playlist', 'riff' ),
				'description' => __( 'Adds tracks, by audio attachment ID, to the end of one of the signed-in user\'s playlists.', 'riff' ),
				'method'      => 'POST',
				'route'       => '/users/me/playlists/{playlist}/tracks',
				'input'       => array(
					'playlist' => array(
						'type'        => 'integer',
						'description' => __( 'The playlist\'s ID.', 'riff' ),
						'minimum'     => 1,
						'required'    => true,
					),
					'tracks'   => array(
						'type'        => 'array',
						'description' => __( 'Audio attachment IDs, in the order to add them.', 'riff' ),
						'items'       => array(
							'type'    => 'integer',
							'minimum' => 1,
						),
						'minItems'    => 1,
						'required'    => true,
					),
				),
				'output'      => Playlists_Rest::playlist_schema(),
				'readonly'    => false,
			),
			'riff/remove-from-playlist' => array(
				'label'       => __( 'Remove from a playlist', 'riff' ),
				'description' => __( 'Takes the track at a place in one of the signed-in user\'s playlists out, counting from 0.', 'riff' ),
				'method'      => 'DELETE',
				'route'       => '/users/me/playlists/{playlist}/tracks/{index}',
				'input'       => array(
					'playlist' => array(
						'type'        => 'integer',
						'description' => __( 'The playlist\'s ID.', 'riff' ),
						'minimum'     => 1,
						'required'    => true,
					),
					'index'    => array(
						'type'        => 'integer',
						'description' => __( 'The track\'s place in the playlist, from 0.', 'riff' ),
						'minimum'     => 0,
						'required'    => true,
					),
				),
				'output'      => Playlists_Rest::playlist_schema(),
				'readonly'    => false,
			),
		);
	}

	/**
	 * Registers every ability.
	 *
	 * @since 4.32.0
	 */
	public static function abilities(): void {
		foreach ( self::list() as $name => $ability ) {
			$required = array_keys( array_filter( $ability['input'], static fn( array $arg ): bool => ! empty( $arg['required'] ) ) );
			$input    = array(
				'type'                 => 'object',
				'properties'           => array_map( static fn( array $arg ): array => array_diff_key( $arg, array( 'required' => true ) ), $ability['input'] ),
				'additionalProperties' => false,
			);
			if ( $required ) {
				$input['required'] = $required;
			}
			wp_register_ability(
				$name,
				array(
					'label'               => $ability['label'],
					'description'         => $ability['description'],
					'category'            => self::CATEGORY,
					'output_schema'       => $ability['output'],
					'execute_callback'    => static fn( $input = null ) => self::run( $name, is_array( $input ) ? $input : array() ),
					'permission_callback' => static fn( $input = null ) => self::permitted( $name, is_array( $input ) ? $input : array() ),
					'meta'                => array(
						'public'      => true,
						'annotations' => array(
							'readonly'    => $ability['readonly'],
							'destructive' => 'riff/unlike' === $name || 'riff/remove-from-playlist' === $name,
							'idempotent'  => 'riff/add-to-playlist' !== $name,
						),
					),
				// An ability that takes nothing has no input schema: core holds any input to the
				// schema, and none is what it is given.
				) + ( $ability['input'] ? array( 'input_schema' => $input ) : array() )
			);
		}
	}

	/**
	 * The REST request an ability runs: its route, with the input's named parts in the path and
	 * the rest as the request's parameters.
	 *
	 * @since 4.32.0
	 *
	 * @param string $name  Ability name.
	 * @param array  $input Input, already validated against the ability's schema.
	 * @return WP_REST_Request|null The request, or null for no such ability.
	 */
	public static function request( string $name, array $input ): ?WP_REST_Request {
		$ability = self::list()[ $name ] ?? null;
		if ( ! $ability ) {
			return null;
		}
		$path    = (string) preg_replace_callback(
			'/\{(\w+)\}/',
			static function ( array $m ) use ( &$input ): string {
				$value = (string) ( $input[ $m[1] ] ?? '' );
				unset( $input[ $m[1] ] );
				return rawurlencode( $value );
			},
			$ability['route']
		);
		$request = new WP_REST_Request( $ability['method'], '/' . Library::REST . $path );
		if ( 'riff/like' === $name ) {
			// The route takes a list of likes; the ability takes one.
			$input = array(
				'items' => array(
					array_intersect_key(
						$input,
						array(
							'kind' => 1,
							'id'   => 1,
						)
					),
				),
			);
		}
		if ( 'GET' === $ability['method'] ) {
			$request->set_query_params( $input );
		} else {
			$request->set_body_params( $input );
		}
		return $request;
	}

	/**
	 * Runs an ability as its REST request and answers what the route answers.
	 *
	 * @since 4.32.0
	 *
	 * @param string $name  Ability name.
	 * @param array  $input Input.
	 * @return mixed The route's data, or a WP_Error with the route's status.
	 */
	public static function run( string $name, array $input ) {
		$request = self::request( $name, $input );
		if ( ! $request ) {
			return new WP_Error( 'riff_no_ability', __( 'No such ability.', 'riff' ) );
		}
		$response = rest_do_request( $request );
		if ( $response->is_error() ) {
			return $response->as_error();
		}
		return $response->get_data();
	}

	/**
	 * Whether the current user may run an ability: what the route's own permission callback says
	 * of the same request.
	 *
	 * @since 4.32.0
	 *
	 * @param string $name  Ability name.
	 * @param array  $input Input.
	 * @return bool
	 */
	public static function permitted( string $name, array $input ): bool {
		$request = self::request( $name, $input );
		if ( ! $request ) {
			return false;
		}
		$path = $request->get_route();
		foreach ( rest_get_server()->get_routes( Library::REST ) as $route => $handlers ) {
			if ( ! preg_match( '@^' . $route . '$@i', $path, $matches ) ) {
				continue;
			}
			foreach ( $handlers as $handler ) {
				$methods = (array) ( $handler['methods'] ?? array() );
				if ( ! isset( $methods[ $request->get_method() ] ) && ! in_array( $request->get_method(), $methods, true ) ) {
					continue;
				}
				$request->set_url_params( array_filter( $matches, 'is_string', ARRAY_FILTER_USE_KEY ) );
				$request->set_attributes( $handler );
				$allowed = is_callable( $handler['permission_callback'] ?? null ) ? call_user_func( $handler['permission_callback'], $request ) : false;
				return true === $allowed;
			}
		}
		return false;
	}
}
