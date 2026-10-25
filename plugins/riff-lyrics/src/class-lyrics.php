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
 * the `riff_now_playing_tabs` filter, the `riff_before_player` action, and the `riff.tab`,
 * `riff.track` and `riff.time` actions in the player. Timed lyrics follow the music and seek on a
 * tap, through `window.riff`, in the formats taggers and players already write: LRC (with its
 * `[offset:]` tag and Enhanced LRC's word times) and WebVTT, typed into the field or read from the
 * file's tags, and ID3's own SYLT frame, which getID3 reads on upload but WordPress then drops:
 * Riff Lyrics writes it into the same field as LRC, so a file tagged with timed lyrics follows the
 * music as soon as it is uploaded.
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
		add_action( 'rest_api_init', array( self::class, 'rest_field' ) );
		add_action( 'wp_entity_fields_api_init', array( self::class, 'entity_field' ) );
		add_filter( 'wp_read_audio_metadata', array( self::class, 'synced_from_tags' ), 10, 4 );
	}

	/**
	 * Text in an ID3 frame's encoding, as UTF-8.
	 *
	 * @param string $text     The bytes.
	 * @param string $encoding getID3's name for the encoding: ISO-8859-1, UTF-16, UTF-16BE or UTF-8.
	 * @return string
	 */
	private static function utf8( string $text, string $encoding ): string {
		if ( 'UTF-8' !== $encoding && function_exists( 'mb_convert_encoding' ) ) {
			$text = (string) mb_convert_encoding( $text, 'UTF-8', $encoding );
		}
		return str_replace( "\u{FEFF}", '', $text );
	}

	/**
	 * Typed lyrics, as plain text: sanitize_textarea_field(), which would also take Enhanced LRC's
	 * <mm:ss.xx> word times for tags and drop them, so those are set aside first and put back.
	 *
	 * @param string $text What was typed.
	 * @return string
	 */
	public static function clean( string $text ): string {
		$text = preg_replace( '/<(\d{1,3}:\d{1,2}(?:\.\d{1,3})?)>/', "\u{E000}$1\u{E001}", $text );
		$text = sanitize_textarea_field( (string) $text );
		return str_replace( array( "\u{E000}", "\u{E001}" ), array( '<', '>' ), $text );
	}

	/**
	 * A file's SYLT frame (synchronised lyrics, timed in milliseconds), as LRC in the lyrics field,
	 * in place of its untimed USLT words when it has both, since they are the same song.
	 *
	 * SYLT carries text in pieces, often a syllable each, each with the time it starts; a piece that
	 * begins with a line break starts a new line, which is how taggers write it.
	 *
	 * @param array  $metadata    What WordPress read from the file.
	 * @param string $file        Path to the file.
	 * @param string $file_format The file's format.
	 * @param array  $data        getID3's whole reading of the file.
	 * @return array
	 */
	public static function synced_from_tags( $metadata, $file = '', $file_format = '', $data = array() ) {
		unset( $file, $file_format );
		if ( ! is_array( $metadata ) || ! is_array( $data ) ) {
			return $metadata;
		}
		$lrc = self::lrc_from_sylt( (array) ( $data['id3v2']['SYLT'] ?? array() ) );
		if ( '' !== $lrc ) {
			$metadata[ self::KEY ] = $lrc;
		}
		return $metadata;
	}

	/**
	 * LRC from getID3's SYLT frames: the first one timed in milliseconds whose content is lyrics.
	 *
	 * @param array $frames getID3's `id3v2.SYLT`.
	 * @return string LRC, or an empty string for none.
	 */
	public static function lrc_from_sylt( array $frames ): string {
		foreach ( $frames as $frame ) {
			// Format 2 is milliseconds (1 is MPEG frames, which needs the file's frame rate); content
			// type 1 is lyrics, 0 "other", which taggers use for lyrics too.
			if ( ! is_array( $frame ) || 2 !== (int) ( $frame['timestampformat'] ?? 0 ) || ! in_array( (int) ( $frame['contenttypeid'] ?? 1 ), array( 0, 1 ), true ) ) {
				continue;
			}
			$lines    = array();
			$encoding = (string) ( $frame['encoding'] ?? 'ISO-8859-1' );
			foreach ( (array) ( $frame['lyrics'] ?? array() ) as $piece ) {
				// The piece without a time is the frame's content descriptor, not a word.
				if ( ! isset( $piece['timestamp'] ) ) {
					continue;
				}
				// getID3 leaves each piece in the frame's own encoding, often UTF-16 with its mark.
				$text = self::utf8( (string) ( $piece['data'] ?? '' ), $encoding );
				$ms   = (int) $piece['timestamp'];
				if ( ! $lines || preg_match( '/^[\r\n]/', $text ) ) {
					$lines[] = array( $ms, '' );
				}
				$lines[ count( $lines ) - 1 ][1] .= str_replace( array( "\r", "\n" ), '', $text );
			}
			$out = array();
			foreach ( $lines as list( $ms, $text ) ) {
				$out[] = sprintf( '[%02d:%05.2f]%s', intdiv( $ms, 60000 ), ( $ms % 60000 ) / 1000, trim( $text ) );
			}
			if ( $out ) {
				return implode( "\n", $out );
			}
		}
		return '';
	}

	/**
	 * `riff_lyrics` on wp/v2/media: the same lyrics the tab shows, written by whoever may edit the
	 * file into the same place WordPress keeps the file's own.
	 *
	 * @since 0.4.0
	 */
	public static function rest_field(): void {
		register_rest_field(
			'attachment',
			'riff_lyrics',
			array(
				'get_callback'    => static function ( array $item ): ?string {
					if ( ! str_starts_with( (string) get_post_mime_type( (int) $item['id'] ), 'audio/' ) ) {
						return null;
					}
					$meta = wp_get_attachment_metadata( (int) $item['id'] );
					return is_array( $meta ) ? (string) ( $meta[ self::KEY ] ?? '' ) : '';
				},
				'update_callback' => static function ( $value, WP_Post $post ) {
					if ( ! current_user_can( 'edit_post', $post->ID ) ) {
						return new \WP_Error( 'rest_cannot_edit', __( 'Sorry, you are not allowed to edit this file.', 'riff-lyrics' ), array( 'status' => rest_authorization_required_code() ) );
					}
					self::save( array( 'ID' => $post->ID ), array( 'riff_lyrics' => wp_slash( (string) $value ) ) );
					return true;
				},
				'schema'          => array(
					'description' => __( 'The lyrics, as the file\'s tag has them or as typed in the Media Library.', 'riff-lyrics' ),
					'type'        => array( 'string', 'null' ),
					'context'     => array( 'view', 'edit' ),
				),
			)
		);
	}

	/**
	 * Lyrics as a field of the attachment entity, so WordPress 7.2's Media Library shows and edits
	 * them in its views and forms beside the file's other details.
	 *
	 * @since 0.4.0
	 */
	public static function entity_field(): void {
		if ( ! function_exists( 'wp_register_entity_fields' ) ) {
			return;
		}
		wp_register_entity_fields(
			'riff-lyrics',
			'postType',
			'attachment',
			array(
				array(
					'id'            => 'riff_lyrics',
					'type'          => 'text',
					'label'         => __( 'Lyrics', 'riff-lyrics' ),
					'Edit'          => array(
						'control' => 'textarea',
						'rows'    => 6,
					),
					'enableSorting' => false,
					'filterBy'      => false,
				),
			)
		);
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
		wp_add_inline_style(
			'riff-lyrics',
			'.riff-lyrics{margin:0;white-space:pre-line;font-size:18px;line-height:1.7}'
			. '.riff-lyrics-note{margin:0;color:var(--riff-fg-2)}'
			// Synced: a list of lines, each a button that seeks; the one being sung in the foreground.
			// Under #riff, as the player's own button styles are, so these win.
			. '#riff .riff-lyrics-synced{list-style:none;padding:0;white-space:normal}'
			. '#riff .riff-lyrics-synced li{margin:0}'
			. '#riff .riff-lyrics-synced li.riff-lyrics-gap{margin-top:1.2em}'
			. '#riff .riff-lyrics-line{all:unset;display:block;box-sizing:border-box;width:100%;padding:3px 0;cursor:pointer;color:var(--riff-fg-2);font:inherit;font-weight:500;transition:color .2s}'
			. '#riff .riff-lyrics-line:hover{color:var(--riff-fg)}'
			. '#riff .riff-lyrics-line:focus-visible{outline:2px solid var(--riff-accent);outline-offset:2px;border-radius:4px}'
			. '#riff [aria-current] > .riff-lyrics-line{color:var(--riff-fg);font-weight:700}'
			// Enhanced LRC: in the line being sung, the words still to come wait in the quieter colour.
			. '#riff [aria-current] > .riff-lyrics-line .riff-lyrics-word{color:var(--riff-fg-2);transition:color .12s}'
			. '#riff [aria-current] > .riff-lyrics-line .riff-lyrics-word.is-sung{color:var(--riff-fg)}'
			. '@media (prefers-reduced-motion:reduce){#riff .riff-lyrics-word{transition:none}}'
		);
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
		$text = self::clean( wp_unslash( (string) $attachment['riff_lyrics'] ) );
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
