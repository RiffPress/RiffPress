<?php
/**
 * Marks core audio, video and playlist blocks as tracks the player can take over.
 *
 * @since 0.1.0
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
 * figure, so the native player still works when the script does not run. A playlist block gets
 * the track on each of its track items instead, since the one figure holds them all.
 */
final class Blocks {

	/**
	 * Hooks the block renderers.
	 *
	 * @since 0.1.0
	 */
	public static function register(): void {
		add_filter( 'render_block_core/audio', array( self::class, 'render' ), 10, 3 );
		add_filter( 'render_block_core/video', array( self::class, 'render' ), 10, 3 );
		add_filter( 'render_block_core/playlist', array( self::class, 'render_playlist' ), 10, 3 );
	}

	/**
	 * Adds the track to one rendered audio or video block.
	 *
	 * @since 0.1.0
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
		$track   = Tracks::from_markup( $content, $block['attrs'] ?? array(), $type, $post_id );
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
	 * Adds a track to each item of one rendered playlist block (WordPress 7.1 and newer).
	 *
	 * Core renders one list item per track that names a file, in the block's order, so the items
	 * and the tracks line up. Core's own player is told not to start: it fetches the whole current
	 * file on every page load to draw its waveform, and the page's one player takes the tracks
	 * instead. The list, its buttons and the figure's markup stay as core wrote them.
	 *
	 * @since 0.2.0
	 * @param string        $content  Rendered block.
	 * @param array         $block    Parsed block, with its track blocks as inner blocks.
	 * @param WP_Block|null $instance Block instance, which carries the post ID in its context.
	 * @return string
	 */
	public static function render_playlist( $content, $block, $instance = null ) {
		if ( ! is_string( $content ) || '' === $content || is_admin() || is_feed() ) {
			return $content;
		}
		$post_id = $instance instanceof WP_Block && isset( $instance->context['postId'] ) ? (int) $instance->context['postId'] : (int) get_the_ID();
		$tracks  = array();
		foreach ( Blocks_Source::playlist_tracks( (array) $block ) as $item ) {
			$tracks[] = Tracks::from_block( $item, $post_id );
		}
		if ( ! array_filter( $tracks ) ) {
			return $content;
		}

		$tags = new WP_HTML_Tag_Processor( $content );
		if ( ! $tags->next_tag( 'figure' ) ) {
			return $content;
		}
		$tags->add_class( 'riff-tracks' );
		if ( $tags->next_tag( array( 'class_name' => 'wp-block-playlist__waveform-player' ) ) ) {
			$tags->remove_attribute( 'data-wp-watch' );
		}
		$i = 0;
		while (
			$tags->next_tag(
				array(
					'tag_name'   => 'li',
					'class_name' => 'wp-block-playlist-track',
				)
			)
		) {
			$track = $tracks[ $i ] ?? null;
			++$i;
			if ( ! $track ) {
				continue;
			}
			$tags->add_class( 'riff-track' );
			$tags->set_attribute( 'data-riff-track', wp_json_encode( $track ) );
		}
		return $tags->get_updated_html();
	}
}
