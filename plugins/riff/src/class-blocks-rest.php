<?php
/**
 * A post's blocks over REST, as the tree WordPress's own parser reads them, with Riff's tracks in it.
 *
 * @since 6.5.0
 * @package Riff
 */

namespace Riff;

use WP_Error;
use WP_Post;
use WP_REST_Request;
use WP_REST_Response;

defined( 'ABSPATH' ) || exit;

/**
 * GET /riff/v1/posts/{id}/blocks.
 *
 * The tree is what parse_blocks() returns, the shape @wordpress/block-serialization-default-parser
 * gives in JavaScript too: each block's `blockName`, `attrs`, `innerBlocks`, `innerHTML` and
 * `innerContent`. Riff adds one key, `track`, to every audio, video and playlist-track block: the
 * track it plays, in the track shape, after riff_track and riff_can_play, so a renderer needs no
 * second request and never reads a file address out of the markup. A locked track's address is
 * taken out of its block's markup too, as it is on the page.
 *
 * The markup is the post's own, before any block renders, so a plugin that hides part of a post
 * as it renders is not asked. That is why it is opt-in: someone who may edit the post always gets
 * it, as they get the raw content from wp/v2, and anyone else only once riff_post_blocks says so.
 */
final class Blocks_Rest {

	/**
	 * Hooks the route.
	 *
	 * @since 6.5.0
	 */
	public static function register(): void {
		add_action( 'rest_api_init', array( self::class, 'routes' ) );
	}

	/**
	 * Registers /posts/{id}/blocks.
	 *
	 * @since 6.5.0
	 */
	public static function routes(): void {
		register_rest_route(
			Library::REST,
			'/posts/(?P<id>\d+)/blocks',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( self::class, 'rest_blocks' ),
					'permission_callback' => array( self::class, 'can_read' ),
					'args'                => array(
						'id' => array(
							'description' => __( 'Post ID.', 'riff' ),
							'type'        => 'integer',
							'minimum'     => 1,
							'required'    => true,
						),
					),
				),
				'schema' => array( self::class, 'schema' ),
			)
		);
	}

	/**
	 * The shape of one block, as parse_blocks() gives it, with Riff's `track`.
	 *
	 * @since 6.5.0
	 * @return array JSON Schema.
	 */
	public static function block_schema(): array {
		return array(
			'title'      => 'riff-block',
			'type'       => 'object',
			'required'   => array( 'blockName', 'attrs', 'innerBlocks', 'innerHTML', 'innerContent' ),
			'properties' => array(
				'blockName'    => array(
					'type'        => array( 'string', 'null' ),
					'description' => __( 'The block\'s name, such as core/paragraph or core/audio; null for HTML outside any block, as a classic post holds.', 'riff' ),
				),
				'attrs'        => array(
					'type'                 => 'object',
					'description'          => __( 'The attributes saved in the block\'s comment. Those a block keeps in its markup, such as a paragraph\'s text, are in innerHTML instead.', 'riff' ),
					'additionalProperties' => true,
				),
				'innerBlocks'  => array(
					'type'        => 'array',
					'description' => __( 'The blocks inside this one, in order, each in this same shape.', 'riff' ),
					'items'       => array( '$ref' => '#/properties/blocks/items' ),
				),
				'innerHTML'    => array(
					'type'        => 'string',
					'description' => __( 'The block\'s own markup, with its inner blocks left out.', 'riff' ),
				),
				'innerContent' => array(
					'type'        => 'array',
					'description' => __( 'The same markup in pieces, with null where each inner block goes, in order.', 'riff' ),
					'items'       => array( 'type' => array( 'string', 'null' ) ),
				),
				'track'        => array(
					'description' => __( 'On an audio, video or playlist-track block only: the track it plays, in the track shape, or null when there is no file to play.', 'riff' ),
					'oneOf'       => array(
						Tracks::schema(),
						array( 'type' => 'null' ),
					),
				),
			),
		);
	}

	/**
	 * The schema of GET /posts/{id}/blocks.
	 *
	 * @since 6.5.0
	 * @return array JSON Schema.
	 */
	public static function schema(): array {
		return array(
			'$schema'     => 'http://json-schema.org/draft-04/schema#',
			'title'       => 'riff-post-blocks',
			'description' => __( 'A post\'s blocks as a tree, parsed by WordPress\'s own block parser, with the tracks Riff\'s blocks play resolved in place.', 'riff' ),
			'type'        => 'object',
			'properties'  => array(
				'id'       => array(
					'type'        => 'integer',
					'description' => __( 'Post ID.', 'riff' ),
				),
				'type'     => array(
					'type'        => 'string',
					'description' => __( 'Post type.', 'riff' ),
				),
				'title'    => array(
					'type'        => 'string',
					'description' => __( 'Post title, as plain text.', 'riff' ),
				),
				'url'      => array(
					'type'        => 'string',
					'format'      => 'uri',
					'description' => __( 'Permalink.', 'riff' ),
				),
				'modified' => array(
					'type'        => 'string',
					'format'      => 'date-time',
					'description' => __( 'When the post last changed, in UTC.', 'riff' ),
				),
				'blocks'   => array(
					'type'        => 'array',
					'description' => __( 'The post\'s blocks, in order. HTML between blocks that is only white space is left out.', 'riff' ),
					'items'       => self::block_schema(),
				),
			),
		);
	}

	/**
	 * Whether the requester may read the post's blocks: someone who may edit it, or anyone, for a
	 * post anyone may read, once riff_post_blocks allows it.
	 *
	 * @since 6.5.0
	 * @param WP_REST_Request $request Request.
	 * @return true|WP_Error
	 */
	public static function can_read( WP_REST_Request $request ) {
		$post    = get_post( (int) $request['id'] );
		$missing = new WP_Error( 'riff_not_found', __( 'There is no such post.', 'riff' ), array( 'status' => 404 ) );
		if ( ! $post instanceof WP_Post || 'riff_playlist' === $post->post_type ) {
			return $missing;
		}
		$type = get_post_type_object( $post->post_type );
		if ( ! $type || empty( $type->show_in_rest ) ) {
			return $missing;
		}
		if ( current_user_can( 'edit_post', $post->ID ) ) {
			return true;
		}
		if ( ! is_post_publicly_viewable( $post ) || post_password_required( $post ) ) {
			return $missing;
		}
		/**
		 * Filters whether a post's blocks are served as a tree at riff/v1/posts/{id}/blocks to
		 * someone who cannot edit the post.
		 *
		 * The tree is the post's own markup, before any block renders, so a plugin that hides part
		 * of a post as it renders, a members-only block, say, is not asked. Turn it on where nothing
		 * on the site does that. Someone who may edit the post always gets its blocks, as they get
		 * its raw content from wp/v2, and a post that is not published, or is behind a password, is
		 * never served to anyone else.
		 *
		 * @since 6.5.0
		 *
		 * @param bool    $on   Whether to serve them. Default false.
		 * @param WP_Post $post The post asked for.
		 */
		if ( ! apply_filters( 'riff_post_blocks', false, $post ) ) {
			return new WP_Error( 'riff_post_blocks_off', __( 'This site does not share its posts\' blocks.', 'riff' ), array( 'status' => rest_authorization_required_code() ) );
		}
		return true;
	}

	/**
	 * GET /posts/{id}/blocks: the tree.
	 *
	 * @since 6.5.0
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function rest_blocks( WP_REST_Request $request ): WP_REST_Response {
		$post = get_post( (int) $request['id'] );
		return new WP_REST_Response(
			array(
				'id'       => $post->ID,
				'type'     => $post->post_type,
				'title'    => html_entity_decode( wp_strip_all_tags( get_the_title( $post ) ), ENT_QUOTES, 'UTF-8' ),
				'url'      => (string) get_permalink( $post ),
				'modified' => mysql_to_rfc3339( $post->post_modified_gmt ),
				'blocks'   => self::tree( $post ),
			)
		);
	}

	/**
	 * The post's blocks, parsed, with the tracks resolved.
	 *
	 * @since 6.5.0
	 * @param WP_Post $post Post.
	 * @return array[]
	 */
	public static function tree( WP_Post $post ): array {
		$blocks = parse_blocks( $post->post_content );
		$ids    = array();
		array_walk_recursive(
			$blocks,
			static function ( $value, $key ) use ( &$ids ) {
				if ( 'id' === $key && is_numeric( $value ) ) {
					$ids[] = (int) $value;
				}
			}
		);
		// Every file the post's blocks name, and what each names in turn, in a few queries.
		Tracks::prime( $ids, array( $post->ID ) );
		return self::resolve( $blocks, $post->ID );
	}

	/**
	 * Adds each media block's track, takes a locked track's address out of its markup, and leaves
	 * out the white space between blocks.
	 *
	 * @param array[] $blocks  Parsed blocks.
	 * @param int     $post_id The post they are in.
	 * @return array[]
	 */
	private static function resolve( array $blocks, int $post_id ): array {
		$out = array();
		foreach ( $blocks as $block ) {
			$name = $block['blockName'] ?? null;
			if ( null === $name && '' === trim( (string) ( $block['innerHTML'] ?? '' ) ) ) {
				continue;
			}
			$block['attrs']       = (array) ( $block['attrs'] ?? array() );
			$block['innerBlocks'] = self::resolve( (array) ( $block['innerBlocks'] ?? array() ), $post_id );
			if ( in_array( $name, array( 'core/audio', 'core/video', 'core/playlist-track' ), true ) ) {
				$block['track'] = Tracks::from_block( $block, $post_id );
				if ( $block['track'] && ! empty( $block['track']['locked'] ) ) {
					$block = self::unplayable( $block );
				}
			}
			// An object in JSON even when empty, as a block's attributes always are.
			$block['attrs'] = (object) $block['attrs'];
			$out[]          = $block;
		}
		return $out;
	}

	/**
	 * A locked track's block with no file address left in it, in its markup or its attributes.
	 *
	 * @param array $block Parsed block.
	 * @return array
	 */
	private static function unplayable( array $block ): array {
		$strip                 = static function ( $html ) {
			if ( ! is_string( $html ) || '' === $html ) {
				return $html;
			}
			$tags = new \WP_HTML_Tag_Processor( $html );
			while ( $tags->next_tag() ) {
				if ( in_array( $tags->get_tag(), array( 'AUDIO', 'VIDEO', 'SOURCE' ), true ) ) {
					$tags->remove_attribute( 'src' );
				}
			}
			return $tags->get_updated_html();
		};
		$block['innerHTML']    = $strip( $block['innerHTML'] ?? '' );
		$block['innerContent'] = array_map( $strip, (array) ( $block['innerContent'] ?? array() ) );
		unset( $block['attrs']['src'], $block['attrs']['url'] );
		return $block;
	}
}
