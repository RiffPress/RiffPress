<?php
/**
 * Lyrics beside Riff's Up next.
 *
 * @package Riff\Lyrics
 */

namespace Riff\Lyrics;

use WP_Post;

// Riff Lyrics is its own plugin with its own text domain; phpcs.xml.dist holds Riff's to `riff`.
// phpcs:set WordPress.WP.I18n text_domain[] riff-lyrics

defined( 'ABSPATH' ) || exit;

/**
 * The plugin.
 *
 * WordPress already reads the lyrics in an audio file's tags (ID3 USLT) on upload and keeps them in
 * the attachment's own metadata as `unsynchronised_lyric`, which the media REST route returns in
 * `media_details`. This shows that field in a Lyrics tab and lets the Media Library edit it, so the
 * plugin stores nothing of its own. Everything it does goes through Riff's documented surface:
 * the `riff_now_playing_tabs` filter, the `riff_before_player` action, and the `riff.tab` and
 * `riff.track` actions in the player.
 */
final class Lyrics {

	/**
	 * The attachment metadata key WordPress fills from the file's lyrics tag.
	 */
	public const KEY = 'unsynchronised_lyric';

	/**
	 * The tab's slug.
	 */
	public const TAB = 'lyrics';

	/**
	 * Hooks the tab, the field and the script.
	 */
	public static function register(): void {
		add_filter( 'riff_now_playing_tabs', array( self::class, 'tab' ) );
		add_action( 'riff_before_player', array( self::class, 'enqueue' ) );
		add_filter( 'attachment_fields_to_edit', array( self::class, 'field' ), 10, 2 );
		add_filter( 'attachment_fields_to_save', array( self::class, 'save' ), 10, 2 );
	}

	/**
	 * Adds the Lyrics tab after Up next.
	 *
	 * @param array $tabs Tabs keyed by slug.
	 * @return array
	 */
	public static function tab( $tabs ) {
		$tabs              = is_array( $tabs ) ? $tabs : array();
		$tabs[ self::TAB ] = array( 'label' => __( 'Lyrics', 'riff-lyrics' ) );
		return $tabs;
	}

	/**
	 * Loads the script on pages where Riff's player renders, and nowhere else.
	 */
	public static function enqueue(): void {
		wp_enqueue_script( 'riff-lyrics', RIFF_LYRICS_URL . 'assets/lyrics.js', array(), RIFF_LYRICS_VERSION, true );
		wp_add_inline_script(
			'riff-lyrics',
			'window.riffLyrics = ' . wp_json_encode(
				array(
					'media' => esc_url_raw( rest_url( 'wp/v2/media/' ) ),
					'none'  => __( 'No lyrics for this track.', 'riff-lyrics' ),
					'idle'  => __( 'Play something to see its lyrics.', 'riff-lyrics' ),
					'error' => __( 'The lyrics could not load.', 'riff-lyrics' ),
				)
				// Signed in, the media route answers for the account only with its nonce: a track in a
				// private or draft post is the account's to read.
				+ ( is_user_logged_in() ? array( 'nonce' => wp_create_nonce( 'wp_rest' ) ) : array() )
			) . ';',
			'before'
		);
		// Riff's design tokens, such as --riff-fg-2, come from its riff-tokens stylesheet, not copies.
		wp_register_style( 'riff-lyrics', false, array( 'riff-tokens' ), RIFF_LYRICS_VERSION );
		wp_enqueue_style( 'riff-lyrics' );
		wp_add_inline_style( 'riff-lyrics', '.riff-lyrics{margin:0;white-space:pre-line;font-size:18px;line-height:1.7}.riff-lyrics-note{margin:0;color:var(--riff-fg-2)}' );
	}

	/**
	 * The Lyrics field on an audio file in the Media Library.
	 *
	 * @param array   $fields Fields.
	 * @param WP_Post $post   Attachment.
	 * @return array
	 */
	public static function field( $fields, $post ) {
		if ( ! $post instanceof WP_Post || ! str_starts_with( (string) $post->post_mime_type, 'audio/' ) ) {
			return $fields;
		}
		$meta                  = wp_get_attachment_metadata( $post->ID );
		$value                 = is_array( $meta ) ? (string) ( $meta[ self::KEY ] ?? '' ) : '';
		$fields['riff_lyrics'] = array(
			'label' => __( 'Lyrics', 'riff-lyrics' ),
			'input' => 'html',
			'html'  => sprintf(
				'<textarea name="attachments[%1$d][riff_lyrics]" id="attachments-%1$d-riff_lyrics" rows="6">%2$s</textarea>',
				(int) $post->ID,
				esc_textarea( $value )
			),
			'helps' => __( 'Read from the file when it has lyrics; edit them here. Shown in the Lyrics tab beside Up next.', 'riff-lyrics' ),
		);
		return $fields;
	}

	/**
	 * Saves the field into the attachment's own metadata, where WordPress put the file's lyrics.
	 *
	 * @param array $post       Attachment data.
	 * @param array $attachment Submitted fields.
	 * @return array
	 */
	public static function save( $post, $attachment ) {
		$id = (int) ( $post['ID'] ?? 0 );
		if ( ! $id || ! isset( $attachment['riff_lyrics'] ) || ! current_user_can( 'edit_post', $id ) ) {
			return $post;
		}
		$meta = wp_get_attachment_metadata( $id );
		$meta = is_array( $meta ) ? $meta : array();
		$text = sanitize_textarea_field( wp_unslash( (string) $attachment['riff_lyrics'] ) );
		if ( '' === $text ) {
			unset( $meta[ self::KEY ] );
		} else {
			$meta[ self::KEY ] = $text;
		}
		wp_update_attachment_metadata( $id, $meta );
		return $post;
	}
}

// PHPCS keeps a phpcs:set for the files after this one, so the domain goes back to Riff's here.
// phpcs:set WordPress.WP.I18n text_domain[] riff
