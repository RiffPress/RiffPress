<?php
/**
 * Marks core audio and video blocks as tracks the player can take over.
 *
 * @package Riff
 */

namespace Riff;

use WP_Block;
use WP_HTML_Tag_Processor;

defined( 'ABSPATH' ) || exit;

/**
 * Block markup.
 *
 * The block's own markup stays as it is. Riff only adds the track as a data attribute on the
 * figure, so the native player still works when the script does not run.
 */
final class Blocks {

	/**
	 * Hooks the two block renderers.
	 */
	public static function register(): void {
		add_filter( 'render_block_core/audio', array( self::class, 'render' ), 10, 3 );
		add_filter( 'render_block_core/video', array( self::class, 'render' ), 10, 3 );
	}

	/**
	 * Adds the track to one rendered audio or video block.
	 *
	 * @param string        $content  Rendered block.
	 * @param array         $block    Parsed block.
	 * @param WP_Block|null $instance Block instance, which carries the post ID in its context.
	 * @return string
	 */
	public static function render( $content, $block, $instance = null ) {
		if ( ! is_string( $content ) || '' === $content || is_admin() || is_feed() ) {
			return $content;
		}
		$type    = 'core/video' === ( $block['blockName'] ?? '' ) ? 'video' : 'audio';
		$post_id = $instance instanceof WP_Block && isset( $instance->context['postId'] ) ? (int) $instance->context['postId'] : (int) get_the_ID();
		$track   = self::track( $content, $block['attrs'] ?? array(), $type, $post_id );
		if ( ! $track ) {
			return $content;
		}

		$tags = new WP_HTML_Tag_Processor( $content );
		if ( ! $tags->next_tag( 'figure' ) ) {
			return $content;
		}
		$tags->add_class( 'riff-track' );
		$tags->set_attribute( 'data-riff-track', wp_json_encode( $track ) );
		return $tags->get_updated_html();
	}

	/**
	 * Reads the track out of a block: its attachment when it has one, the file address otherwise.
	 *
	 * @param string $content Rendered block.
	 * @param array  $attrs   Block attributes.
	 * @param string $type    'audio' or 'video'.
	 * @param int    $post_id Post ID.
	 * @return array|null
	 */
	private static function track( string $content, array $attrs, string $type, int $post_id ): ?array {
		if ( ! empty( $attrs['id'] ) ) {
			$track = Tracks::from_attachment( (int) $attrs['id'], $post_id );
			if ( $track ) {
				return $track;
			}
		}

		$tags = new WP_HTML_Tag_Processor( $content );
		if ( ! $tags->next_tag( $type ) ) {
			return null;
		}
		$src = $tags->get_attribute( 'src' );
		if ( ! is_string( $src ) || '' === $src ) {
			return null;
		}
		$caption = preg_match( '#<figcaption[^>]*>(.*?)</figcaption>#s', $content, $m ) ? wp_strip_all_tags( $m[1] ) : '';
		return Tracks::from_url( $src, $type, html_entity_decode( $caption, ENT_QUOTES, 'UTF-8' ), $post_id );
	}
}
