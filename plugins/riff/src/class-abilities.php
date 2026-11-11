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
 * Each one is a REST route by another door: Riff's own `riff/v1` routes for the library, its
 * albums, artists and tracks, its summary, making an album and importing a zip, and the signed-in
 * user's likes, history and playlists; WordPress's own `wp/v2/media` route for a track's details,
 * where Riff's fields already are. An ability is run as a REST request to its route, so it answers
 * exactly what the route answers and is allowed exactly what the route allows: the route's own
 * permission callback decides, with WordPress's capabilities. Nothing plays through an ability,
 * since playback happens in a browser, not on the server. Registered only where WordPress has the
 * API.
 *
 * An extension adds its own the same way, through the `riff_abilities` filter. None of them is
 * offered to an MCP client unless the site turns that on (Mcp).
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
	 * Riff's own abilities, keyed by name: the route each runs, what it takes and what it answers.
	 *
	 * @since 4.32.0
	 * @since 6.5.0 Getting one album's post, the library's summary, making a playlist or an album,
	 *              a track's details and importing a zip; each may name its route's namespace,
	 *              shape the route's parameters and say whether it is destructive or idempotent.
	 *
	 * @return array[] Each with label, description, method, route, input (JSON Schema properties),
	 *                 output (the route's schema) and readonly; and optionally namespace,
	 *                 params, destructive and idempotent, as the `riff_abilities` filter has them.
	 */
	public static function list(): array {
		$page    = array(
			'type'        => 'integer',
			'description' => __( 'Page of results, from 1.', 'riff' ),
			'minimum'     => 1,
		);
		$search  = array(
			'type'        => 'string',
			'description' => __( 'Words to search for.', 'riff' ),
		);
		$include = array(
			'type'        => 'array',
			'description' => __( 'Only these, by ID, such as one to look at on its own.', 'riff' ),
			'items'       => array(
				'type'    => 'integer',
				'minimum' => 1,
			),
		);
		$kind    = array(
			'type'        => 'string',
			'enum'        => array( 'track', 'album', 'artist' ),
			'description' => __( 'What to like: a track, an album or an artist.', 'riff' ),
		);
		$id      = array(
			'type'        => 'integer',
			'description' => __( 'Its ID: an audio attachment, an album term or an artist term.', 'riff' ),
			'minimum'     => 1,
		);
		$tracks  = array(
			'type'        => 'array',
			'description' => __( 'Audio attachment IDs, in order.', 'riff' ),
			'items'       => array(
				'type'    => 'integer',
				'minimum' => 1,
			),
			'minItems'    => 1,
		);
		$attach  = array(
			'type'        => 'integer',
			'description' => __( 'The audio attachment\'s ID.', 'riff' ),
			'minimum'     => 1,
			'required'    => true,
		);
		return array(
			'riff/tracks'               => array(
				'label'       => __( 'List tracks', 'riff' ),
				'description' => __( 'Lists the tracks the requester can see, searchable by title, artist or album, or those on one album or by one artist, or named by ID, a page at a time.', 'riff' ),
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
					'include'  => $include,
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
				'description' => __( 'Lists the albums with a track the requester can see, by name, each with its artist, artwork and track count, searchable by name. An album\'s tracks are riff/tracks with its ID as album.', 'riff' ),
				'method'      => 'GET',
				'route'       => '/albums',
				'input'       => array(
					'search'  => $search,
					'artist'  => array(
						'type'        => 'integer',
						'description' => __( 'Only the albums with a track by this artist, by term ID.', 'riff' ),
					),
					'include' => $include,
					'page'    => $page,
				),
				'output'      => Catalog_Rest::terms_schema( Catalog::ALBUM ),
				'readonly'    => true,
			),
			'riff/artists'              => array(
				'label'       => __( 'List artists', 'riff' ),
				'description' => __( 'Lists the artists with a track the requester can see, by name, each with a track count, searchable by name. An artist\'s tracks are riff/tracks with their ID as artist.', 'riff' ),
				'method'      => 'GET',
				'route'       => '/artists',
				'input'       => array(
					'search'  => $search,
					'include' => $include,
					'page'    => $page,
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
			'riff/library-post'         => array(
				'label'       => __( 'Get an album\'s post', 'riff' ),
				'description' => __( 'Gets one published post with music, such as an album, with its tracks in order as the player reads them.', 'riff' ),
				'method'      => 'GET',
				'route'       => '/library/{id}',
				'input'       => array(
					'id' => array(
						'type'        => 'integer',
						'description' => __( 'The post\'s ID, as riff/library lists it.', 'riff' ),
						'minimum'     => 1,
						'required'    => true,
					),
				),
				'output'      => Library::post_schema(),
				'readonly'    => true,
			),
			'riff/library-summary'      => array(
				'label'       => __( 'Summarize the library', 'riff' ),
				'description' => __( 'Counts the tracks, albums, artists and posts with music, and says how much space the audio and every upload take, and the site\'s limit where it has one. For someone who can upload files.', 'riff' ),
				'method'      => 'GET',
				'route'       => '/library/summary',
				'input'       => array(),
				'output'      => Library::summary_schema(),
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
				// The route takes a list of likes; the ability takes one.
				'params'      => static fn( array $input ): array => array( 'items' => array( $input ) ),
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
				'destructive' => true,
			),
			'riff/create-playlist'      => array(
				'label'       => __( 'Make a playlist', 'riff' ),
				'description' => __( 'Makes a playlist for the signed-in user, empty or with tracks.', 'riff' ),
				'method'      => 'POST',
				'route'       => '/users/me/playlists',
				'input'       => array(
					'title'  => array(
						'type'        => 'string',
						'description' => __( 'The playlist\'s name.', 'riff' ),
						'minLength'   => 1,
						'maxLength'   => 200,
						'required'    => true,
					),
					'tracks' => array_diff_key( $tracks, array( 'minItems' => true ) ),
				),
				'output'      => Playlists_Rest::playlist_schema(),
				'readonly'    => false,
				'idempotent'  => false,
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
					'tracks'   => $tracks + array( 'required' => true ),
				),
				'output'      => Playlists_Rest::playlist_schema(),
				'readonly'    => false,
				'idempotent'  => false,
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
				'destructive' => true,
			),
			'riff/create-album'         => array(
				'label'       => __( 'Make an album', 'riff' ),
				'description' => __( 'Makes an album of audio files already in the Media Library: a post with one audio block for each, in the order given, a draft unless asked otherwise. For someone who can write posts and edit the files.', 'riff' ),
				'method'      => 'POST',
				'route'       => '/library',
				'input'       => array(
					'title'   => array(
						'type'        => 'string',
						'description' => __( 'The album\'s title.', 'riff' ),
						'minLength'   => 1,
						'maxLength'   => 200,
						'required'    => true,
					),
					'tracks'  => $tracks + array(
						'maxItems' => 200,
						'required' => true,
					),
					'status'  => array(
						'type'        => 'string',
						'enum'        => array( 'draft', 'publish', 'private' ),
						'description' => __( 'Draft, for its author to look over first; published; or private. Draft unless given.', 'riff' ),
					),
					'artwork' => array(
						'type'        => 'integer',
						'description' => __( 'An image attachment ID for the cover; the first track\'s artwork when not given.', 'riff' ),
						'minimum'     => 1,
					),
				),
				'output'      => Library::created_schema(),
				'readonly'    => false,
				'idempotent'  => false,
			),
			'riff/update-track'         => array(
				'label'       => __( 'Set a track\'s details', 'riff' ),
				'description' => __( 'Sets a track\'s title, artist, album or artwork, through the Media Library\'s own REST route. For someone who can edit the file.', 'riff' ),
				'method'      => 'POST',
				'namespace'   => 'wp/v2',
				'route'       => '/media/{id}',
				'input'       => array(
					'id'      => $attach,
					'title'   => array(
						'type'        => 'string',
						'description' => __( 'The track\'s title.', 'riff' ),
					),
					'artist'  => array(
						'type'        => 'string',
						'description' => __( 'The artist, kept with the file\'s tags; empty to clear it.', 'riff' ),
					),
					'album'   => array(
						'type'        => 'string',
						'description' => __( 'The album, kept with the file\'s tags; empty to clear it.', 'riff' ),
					),
					'artwork' => array(
						'type'        => 'integer',
						'description' => __( 'An image attachment ID for the track\'s artwork; 0 to take it away.', 'riff' ),
						'minimum'     => 0,
					),
				),
				'params'      => static fn( array $input ): array => self::rename(
					$input,
					array(
						'artist'  => 'riff_artist',
						'album'   => 'riff_album',
						'artwork' => 'featured_media',
					)
				),
				'output'      => self::media_schema(
					array(
						'title'          => array(
							'type'       => 'object',
							'properties' => array(
								'raw'      => array( 'type' => 'string' ),
								'rendered' => array( 'type' => 'string' ),
							),
						),
						'riff_artist'    => array( 'type' => array( 'string', 'null' ) ),
						'riff_album'     => array( 'type' => array( 'string', 'null' ) ),
						'featured_media' => array( 'type' => 'integer' ),
					)
				),
				'readonly'    => false,
			),
			'riff/import-zip'           => array(
				'label'       => __( 'Import a zip', 'riff' ),
				'description' => __( 'Imports a zip of an album, or of a folder of albums, already uploaded to the Media Library and attached to no post, as uploading it there does: in the background, into private album posts with each track Protected, for its uploader to publish, unless the site says otherwise. For someone who can write posts and edit the zip.', 'riff' ),
				'method'      => 'POST',
				'route'       => '/imports',
				'input'       => array(
					'attachment' => array(
						'type'        => 'integer',
						'description' => __( 'The zip\'s attachment ID.', 'riff' ),
						'minimum'     => 1,
						'required'    => true,
					),
				),
				'output'      => Import::queued_schema(),
				'readonly'    => false,
			),
		);
	}

	/**
	 * Every ability: Riff's own, and what extensions add.
	 *
	 * @since 6.5.0
	 *
	 * @return array[] As list() has them.
	 */
	public static function all(): array {
		/**
		 * Filters the abilities Riff registers, so an extension adds its own the way Riff adds
		 * its: each the REST route it runs, with what it takes and what it answers. Each is
		 * registered in Riff's category, run as a REST request to its route and allowed what the
		 * route's own permission callback allows, and offered to an MCP client only where the site
		 * turns that on.
		 *
		 * Each is keyed by its name, a namespace of the plugin's own, a slash and a name, such as
		 * `riff-lyrics/set-lyrics`, and has a `label` and a `description`; the route's `method`,
		 * its `namespace` (`riff/v1` unless given) and its `route`, with each part the input fills
		 * in braces, such as `/media/{id}`; the `input`'s properties as JSON Schema, each with
		 * `required` where it must be given; the `output` as JSON Schema; and `readonly`. It may
		 * also have `params`, a callable that takes the input left after the route's parts and
		 * gives the route's parameters, and `destructive` (default false) and `idempotent`
		 * (default true).
		 *
		 * @since 6.5.0
		 *
		 * @param array[] $abilities Abilities by name: Riff's own, and any added before.
		 */
		$all = apply_filters( 'riff_abilities', self::list() );
		return is_array( $all ) ? $all : self::list();
	}

	/**
	 * Registers every ability.
	 *
	 * @since 4.32.0
	 */
	public static function abilities(): void {
		foreach ( self::all() as $name => $ability ) {
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
						'annotations' => array(
							'readonly'    => (bool) $ability['readonly'],
							'destructive' => (bool) ( $ability['destructive'] ?? false ),
							'idempotent'  => (bool) ( $ability['idempotent'] ?? true ),
						),
						// Not offered to MCP clients unless the site turns that on: Mcp::expose().
						'mcp'         => array(
							'public' => false,
							'type'   => 'tool',
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
		$ability = self::all()[ $name ] ?? null;
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
		$request = new WP_REST_Request( $ability['method'], '/' . self::space( $ability ) . $path );
		if ( isset( $ability['params'] ) && is_callable( $ability['params'] ) ) {
			$input = (array) call_user_func( $ability['params'], $input );
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
		foreach ( rest_get_server()->get_routes( self::space( self::all()[ $name ] ) ) as $route => $handlers ) {
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

	/**
	 * The shape of what `wp/v2/media` answers for an audio file, as much as an ability that
	 * writes one of its fields needs: its ID, and the fields named.
	 *
	 * @since 6.5.0
	 *
	 * @param array $fields JSON Schema properties, by field.
	 * @return array JSON Schema.
	 */
	public static function media_schema( array $fields ): array {
		return array(
			'$schema'    => 'http://json-schema.org/draft-04/schema#',
			'title'      => 'attachment',
			'type'       => 'object',
			'properties' => array( 'id' => array( 'type' => 'integer' ) ) + $fields,
		);
	}

	/**
	 * An ability's route namespace.
	 *
	 * @param array $ability The ability.
	 * @return string
	 */
	private static function space( array $ability ): string {
		return trim( (string) ( $ability['namespace'] ?? Library::REST ), '/' );
	}

	/**
	 * Input with some keys given the route's names for them.
	 *
	 * @param array                 $input Input.
	 * @param array<string, string> $names The route's name for each key that differs.
	 * @return array
	 */
	private static function rename( array $input, array $names ): array {
		$out = array();
		foreach ( $input as $key => $value ) {
			$out[ $names[ $key ] ?? $key ] = $value;
		}
		return $out;
	}
}
