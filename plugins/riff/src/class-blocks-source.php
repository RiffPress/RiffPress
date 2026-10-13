<?php
/**
 * The first source: the core audio and video blocks in a post.
 *
 * @package Riff
 * @since 0.2.0
 */

namespace Riff;

use WP_Post;

defined( 'ABSPATH' ) || exit;

/**
 * The core source: audio and video blocks in a post's content.
 *
 * @since 0.2.0
 */
final class Blocks_Source implements Source {

	/**
	 * The id: "blocks".
	 *
	 * @since 0.2.0
	 *
	 * @return string
	 */
	public function id(): string {
		return 'blocks';
	}

	/**
	 * Whether the post holds a core audio or video block.
	 *
	 * @since 0.2.0
	 *
	 * @param WP_Post $post Post.
	 * @return bool
	 */
	public function supports( WP_Post $post ): bool {
		return has_block( 'core/audio', $post ) || has_block( 'core/video', $post );
	}

	/**
	 * The tracks in the post's audio and video blocks, in order.
	 *
	 * @since 0.2.0
	 *
	 * @param WP_Post $post Post.
	 * @return array[]
	 */
	public function tracks( WP_Post $post ): array {
		$tracks = array();
		foreach ( self::media_blocks( parse_blocks( $post->post_content ) ) as $block ) {
			$track = Tracks::from_block( $block, $post->ID );
			if ( $track ) {
				$tracks[] = $track;
			}
		}
		return $tracks;
	}

	/**
	 * The post's media blocks rendered as they are on the post, figures marked with their tracks.
	 *
	 * @since 0.2.0
	 *
	 * @param WP_Post $post Post.
	 * @return string
	 */
	public function html( WP_Post $post ): string {
		// The block renderer reads the post from the loop, the way it does on the post's own page.
		$previous        = $GLOBALS['post'] ?? null;
		$GLOBALS['post'] = $post; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- put back below.
		setup_postdata( $post );
		$html = '';
		foreach ( self::media_blocks( parse_blocks( $post->post_content ) ) as $block ) {
			$html .= render_block( $block );
		}
		wp_reset_postdata();
		$GLOBALS['post'] = $previous; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- as it was.
		return $html;
	}

	/**
	 * Posts whose content holds an audio or video block.
	 *
	 * @since 0.2.0
	 *
	 * @return string
	 */
	public function where(): string {
		global $wpdb;
		return $wpdb->prepare(
			"({$wpdb->posts}.post_content LIKE %s OR {$wpdb->posts}.post_content LIKE %s)", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- the posts table name.
			'%' . $wpdb->esc_like( '<!-- wp:audio' ) . '%',
			'%' . $wpdb->esc_like( '<!-- wp:video' ) . '%'
		);
	}

	/**
	 * Core audio and video blocks, found at any depth.
	 *
	 * @param array $blocks Parsed blocks.
	 * @return array[]
	 */
	private static function media_blocks( array $blocks ): array {
		$found = array();
		foreach ( $blocks as $block ) {
			$name = $block['blockName'] ?? '';
			if ( 'core/audio' === $name || 'core/video' === $name ) {
				$found[] = $block;
			} elseif ( ! empty( $block['innerBlocks'] ) ) {
				$found = array_merge( $found, self::media_blocks( $block['innerBlocks'] ) );
			}
		}
		return $found;
	}
}
