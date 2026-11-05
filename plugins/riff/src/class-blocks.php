<?php
/**
 * Marks core audio, video and playlist blocks as tracks the player can take over.
 *
 * @since 4.0.0
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
	 * @since 4.0.0
	 */
	public static function register(): void {
		add_filter( 'render_block_core/audio', array( self::class, 'render' ), 10, 3 );
		add_filter( 'render_block_core/video', array( self::class, 'render' ), 10, 3 );
		add_filter( 'render_block_core/playlist-track', array( self::class, 'render_playlist_track' ), 10, 3 );
		add_filter( 'render_block_core/playlist', array( self::class, 'render_playlist' ), 10, 3 );
	}

	/**
	 * Takes the file out of a locked track's own markup, so the block's native player has nothing
	 * to play either.
	 *
	 * @since 4.17.0
	 * @param WP_HTML_Tag_Processor $tags Markup, at its start.
	 */
	private static function unplayable( WP_HTML_Tag_Processor $tags ): void {
		while ( $tags->next_tag() ) {
			if ( in_array( $tags->get_tag(), array( 'AUDIO', 'VIDEO', 'SOURCE' ), true ) ) {
				$tags->remove_attribute( 'src' );
			}
		}
	}

	/**
	 * Adds the track to one rendered audio or video block.
	 *
	 * @since 4.0.0
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
		if ( $track['locked'] ) {
			self::unplayable( $tags );
		} elseif ( $tags->next_tag( $type ) ) {
			// The page's one player plays the track, so the block's own player fetches nothing
			// until it is pressed: left to the browser, each fetches the start of its file, and a
			// page of rows asks for fifty files before anything plays.
			$tags->set_attribute( 'preload', 'none' );
		}
		return $tags->get_updated_html();
	}

	/**
	 * Adds the track to one rendered item of a playlist block (WordPress 7.1 and newer).
	 *
	 * Each item is marked as core renders it, so a track core leaves out, one with no file, adds
	 * no item and moves no other track onto the wrong one.
	 *
	 * @since 6.2.0
	 * @param string        $content  Rendered item.
	 * @param array         $block    Parsed track block.
	 * @param WP_Block|null $instance Block instance.
	 * @return string
	 */
	public static function render_playlist_track( $content, $block, $instance = null ) {
		if ( ! is_string( $content ) || '' === $content || is_admin() || is_feed() ) {
			return $content;
		}
		$post_id = $instance instanceof WP_Block && isset( $instance->context['postId'] ) ? (int) $instance->context['postId'] : (int) get_the_ID();
		$track   = Tracks::from_block( (array) $block, $post_id );
		$tags    = new WP_HTML_Tag_Processor( $content );
		if ( ! $track || ! $tags->next_tag( 'li' ) ) {
			return $content;
		}
		$tags->add_class( 'riff-track' );
		$tags->set_attribute( 'data-riff-track', wp_json_encode( $track ) );
		return $tags->get_updated_html();
	}

	/**
	 * Hands a rendered playlist block's items to the page's one player.
	 *
	 * Core's own player is told not to start: it fetches the whole current file on every page
	 * load to draw its waveform, and the page's one player takes the tracks instead. A locked
	 * track's address comes out of core's interactivity state, where core wrote it as it rendered,
	 * so the item stays listed with nothing to play. The list, its buttons and the figure's markup
	 * stay as core wrote them.
	 *
	 * @since 4.0.0
	 * @since 6.2.0 Items are marked as each renders; a locked track's address comes out of core's state here.
	 * @param string        $content  Rendered block.
	 * @param array         $block    Parsed block, with its track blocks as inner blocks.
	 * @param WP_Block|null $instance Block instance.
	 * @return string
	 */
	public static function render_playlist( $content, $block, $instance = null ) {
		unset( $block, $instance );
		if ( ! is_string( $content ) || ! str_contains( $content, 'data-riff-track' ) || is_admin() || is_feed() ) {
			return $content;
		}

		$tags = new WP_HTML_Tag_Processor( $content );
		if ( ! $tags->next_tag( 'figure' ) ) {
			return $content;
		}
		$tags->add_class( 'riff-tracks' );
		$playlist = (string) ( json_decode( (string) $tags->get_attribute( 'data-wp-context' ), true )['playlistId'] ?? '' );
		if ( $tags->next_tag( array( 'class_name' => 'wp-block-playlist__waveform-player' ) ) ) {
			$tags->remove_attribute( 'data-wp-watch' );
		}

		$locked = array();
		while ( $tags->next_tag( array( 'class_name' => 'riff-track' ) ) ) {
			$track = json_decode( (string) $tags->get_attribute( 'data-riff-track' ), true );
			if ( empty( $track['locked'] ) || ! $tags->next_tag( array( 'class_name' => 'wp-block-playlist-track__button' ) ) ) {
				continue;
			}
			$key = (string) ( json_decode( (string) $tags->get_attribute( 'data-wp-context' ), true )['trackId'] ?? '' );
			if ( '' !== $key ) {
				$locked[ $key ] = array( 'url' => '' );
			}
		}
		if ( $locked && '' !== $playlist ) {
			wp_interactivity_state( 'core/playlist', array( 'playlists' => array( $playlist => array( 'tracks' => $locked ) ) ) );
		}
		return $tags->get_updated_html();
	}
}
