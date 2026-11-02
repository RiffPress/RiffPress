<?php
/**
 * Sing along beside Riff's Up next.
 *
 * @package Riff\Sing
 */

namespace Riff\Sing;

use WP_Post;

// Riff Sing is its own plugin with its own text domain; phpcs.xml.dist holds Riff's to `riff`.
// phpcs:set WordPress.WP.I18n text_domain[] riff-sing

defined( 'ABSPATH' ) || exit;

/**
 * The plugin.
 *
 * A track's melody is UltraStar's text format, the open one karaoke games read, kept as post meta on
 * the audio attachment and edited in a Melody field in the Media Library, beside the file's Lyrics.
 * WordPress has nowhere for a song's tune, and post meta is where an attachment keeps what was
 * written about it (docs/native.md). The Sing tab reads it through the media REST route, so a
 * visitor sees a melody only for a file that route already shows them.
 *
 * Everything else happens in the browser: the microphone is opened only when the listener asks, its
 * sound is turned into a note by an AudioWorklet on the device, and nothing is recorded or sent.
 * Everything it does with Riff goes through Riff's documented surface: the `riff_now_playing_tabs`
 * filter, the `riff_before_player` action, and the `riff.tab`, `riff.track`, `riff.time`,
 * `riff.play` and `riff.ended` actions with `window.riff` in the player.
 */
final class Sing {

	/**
	 * The attachment meta key for the melody.
	 */
	public const KEY = '_riff_sing_melody';

	/**
	 * The REST and Media Library field's name.
	 */
	public const FIELD = 'riff_sing_melody';

	/**
	 * The tab's slug.
	 */
	public const TAB = 'sing';

	/**
	 * The longest melody kept, in characters: a long song's chart is a few tens of thousands.
	 */
	public const MAX = 200000;

	/**
	 * Hooks the tab, the field and the script.
	 */
	public static function register(): void {
		add_action( 'init', array( self::class, 'register_meta' ) );
		add_filter( 'riff_now_playing_tabs', array( self::class, 'tab' ) );
		add_action( 'riff_before_player', array( self::class, 'enqueue' ) );
		add_filter( 'attachment_fields_to_edit', array( self::class, 'field' ), 10, 2 );
		add_filter( 'attachment_fields_to_save', array( self::class, 'save' ), 10, 2 );
		add_action( 'rest_api_init', array( self::class, 'rest_field' ) );
		add_action( 'wp_entity_fields_api_init', array( self::class, 'entity_field' ) );
	}

	/**
	 * The melody as post meta on the attachment, cleaned whichever way it is written. It is read
	 * and written over REST as the riff_sing_melody field, not as meta, so an image has none.
	 */
	public static function register_meta(): void {
		register_post_meta(
			'attachment',
			self::KEY,
			array(
				'type'              => 'string',
				'single'            => true,
				'default'           => '',
				'sanitize_callback' => array( self::class, 'clean' ),
				'auth_callback'     => static fn( $allowed, $key, $post_id ) => current_user_can( 'edit_post', $post_id ),
			)
		);
	}

	/**
	 * A typed melody, as plain text: no markup, Unix line ends, no longer than MAX.
	 *
	 * Not sanitize_textarea_field(), which drops %xx pairs (a #MP3: file name has them) and then
	 * collapses every run of spaces, losing the space UltraStar starts a word with, and turns a lone
	 * `<` (a lyric's "<3") into an entity. Tags go, and the rest is kept as typed.
	 *
	 * @param mixed $text What was typed.
	 * @return string
	 */
	public static function clean( $text ): string {
		$text = wp_check_invalid_utf8( is_scalar( $text ) ? (string) $text : '' );
		$text = str_replace( array( "\r\n", "\r" ), "\n", $text );
		$text = (string) preg_replace( '@<(script|style)[^>]*?>.*?</\1>@si', '', $text );
		$text = (string) preg_replace( '@</?[a-z][^>]*>@i', '', $text );
		$text = (string) preg_replace( '/[\x00-\x08\x0B-\x1F\x7F]/', '', $text );
		return trim( mb_substr( $text, 0, self::MAX ) );
	}

	/**
	 * A file's melody, or an empty string for none.
	 *
	 * @param int $id Attachment ID.
	 * @return string
	 */
	public static function melody( int $id ): string {
		return (string) get_post_meta( $id, self::KEY, true );
	}

	/**
	 * Writes a file's melody, or removes it when empty.
	 *
	 * @param int    $id   Attachment ID.
	 * @param string $text The melody.
	 */
	private static function write( int $id, string $text ): void {
		$text = self::clean( $text );
		if ( '' === $text ) {
			delete_post_meta( $id, self::KEY );
		} else {
			update_post_meta( $id, self::KEY, wp_slash( $text ) );
		}
	}

	/**
	 * Whether a post is an audio file.
	 *
	 * @param int $id Post ID.
	 * @return bool
	 */
	private static function audio( int $id ): bool {
		return 'attachment' === get_post_type( $id ) && str_starts_with( (string) get_post_mime_type( $id ), 'audio/' );
	}

	/**
	 * `riff_sing_melody` on wp/v2/media: what the Sing tab reads, and what whoever may edit the file
	 * writes.
	 */
	public static function rest_field(): void {
		register_rest_field(
			'attachment',
			self::FIELD,
			array(
				'get_callback'    => static function ( array $item ): ?string {
					return self::audio( (int) $item['id'] ) ? self::melody( (int) $item['id'] ) : null;
				},
				'update_callback' => static function ( $value, WP_Post $post ) {
					if ( ! current_user_can( 'edit_post', $post->ID ) ) {
						return new \WP_Error( 'rest_cannot_edit', __( 'Sorry, you are not allowed to edit this file.', 'riff-sing' ), array( 'status' => rest_authorization_required_code() ) );
					}
					// The Media Library's form may send the field's empty value for an image too.
					if ( ! self::audio( $post->ID ) && '' === trim( (string) $value ) ) {
						return true;
					}
					if ( ! self::audio( $post->ID ) ) {
						return new \WP_Error( 'rest_invalid_param', __( 'Only an audio file has a melody.', 'riff-sing' ), array( 'status' => 400 ) );
					}
					self::write( $post->ID, (string) $value );
					return true;
				},
				'schema'          => array(
					'description' => __( 'The melody to sing along with, in UltraStar\'s text format.', 'riff-sing' ),
					'type'        => array( 'string', 'null' ),
					'context'     => array( 'view', 'edit' ),
				),
			)
		);
	}

	/**
	 * The melody as a field of the attachment entity, so WordPress 7.2's Media Library shows and
	 * edits it in its views and forms beside the file's other details.
	 */
	public static function entity_field(): void {
		if ( ! function_exists( 'wp_register_entity_fields' ) ) {
			return;
		}
		wp_register_entity_fields(
			'riff-sing',
			'postType',
			'attachment',
			array(
				array(
					'id'            => self::FIELD,
					'type'          => 'text',
					'label'         => __( 'Melody', 'riff-sing' ),
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
	 * Adds the Sing tab after the others.
	 *
	 * @param array $tabs Tabs keyed by slug.
	 * @return array
	 */
	public static function tab( $tabs ) {
		$tabs              = is_array( $tabs ) ? $tabs : array();
		$tabs[ self::TAB ] = array( 'label' => __( 'Sing', 'riff-sing' ) );
		return $tabs;
	}

	/**
	 * The words the panel shows, translated here because the script is not a module.
	 *
	 * @return array
	 */
	private static function strings(): array {
		return array(
			'idle'          => __( 'Play something to sing along with it.', 'riff-sing' ),
			'none'          => __( 'No melody for this track yet.', 'riff-sing' ),
			'broken'        => __( 'This track\'s melody couldn\'t be read.', 'riff-sing' ),
			'error'         => __( 'The melody could not load.', 'riff-sing' ),
			'intro'         => __( 'Sing along and see how close you come to each note. Riff Sing listens through your microphone to hear which note you sing, and your browser asks you first.', 'riff-sing' ),
			'private'       => __( 'Your voice stays on this device: the notes are worked out in your browser, and nothing is recorded or sent.', 'riff-sing' ),
			'mic'           => __( 'Sing with the microphone', 'riff-sing' ),
			'midi'          => __( 'Use a MIDI instrument', 'riff-sing' ),
			'stop'          => __( 'Stop listening', 'riff-sing' ),
			'input'         => __( 'Microphone', 'riff-sing' ),
			/* translators: %s: a number, for a microphone the browser gives no name. */
			'unnamed'       => __( 'Microphone %s', 'riff-sing' ),
			'level'         => __( 'How close counts', 'riff-sing' ),
			'levels'        => array(
				__( 'Easy: within two semitones', 'riff-sing' ),
				__( 'Medium: within a semitone', 'riff-sing' ),
				__( 'Strict: within a quarter tone', 'riff-sing' ),
			),
			'asking'        => __( 'Waiting for your browser\'s answer…', 'riff-sing' ),
			'listening'     => __( 'Listening. Play the song and sing along; headphones work best.', 'riff-sing' ),
			'listeningMidi' => __( 'Listening to your MIDI instrument.', 'riff-sing' ),
			'stopped'       => __( 'Stopped listening.', 'riff-sing' ),
			'lost'          => __( 'The microphone went away, so Riff Sing stopped listening.', 'riff-sing' ),
			'denied'        => __( 'The microphone wasn\'t allowed. To sing, allow it for this site in your browser\'s settings, then try again.', 'riff-sing' ),
			'missing'       => __( 'No microphone was found. Connect one and try again.', 'riff-sing' ),
			'busy'          => __( 'The microphone is in use by another app.', 'riff-sing' ),
			'failed'        => __( 'The microphone couldn\'t be started in this browser.', 'riff-sing' ),
			'noMic'         => __( 'This browser can\'t listen to a microphone here, but a MIDI instrument works.', 'riff-sing' ),
			'unsupported'   => __( 'This browser can\'t listen to a microphone or a MIDI instrument here.', 'riff-sing' ),
			'midiDenied'    => __( 'MIDI wasn\'t allowed.', 'riff-sing' ),
			'midiNone'      => __( 'No MIDI instrument is connected yet. Connect one and play.', 'riff-sing' ),
			'grades'        => array(
				'great' => __( 'Brilliant!', 'riff-sing' ),
				'good'  => __( 'Lovely singing.', 'riff-sing' ),
				'close' => __( 'Getting there.', 'riff-sing' ),
				'keep'  => __( 'Keep going.', 'riff-sing' ),
			),
			/* translators: 1: a word of praise, such as "Lovely singing.", 2: how much of the line was in tune, as a whole number. */
			'line'          => __( 'That line: %1$s %2$s%% in tune.', 'riff-sing' ),
			/* translators: %s: how much of the song so far was in tune, as a whole number. */
			'song'          => __( 'The song so far: %s%%.', 'riff-sing' ),
			/* translators: 1: a word of praise, such as "Lovely singing.", 2: how much of the song was in tune, as a whole number. */
			'done'          => __( 'Song finished. %1$s %2$s%% in tune.', 'riff-sing' ),
		);
	}

	/**
	 * Loads the script on pages where Riff's player renders, and nowhere else.
	 */
	public static function enqueue(): void {
		wp_enqueue_script( 'riff-sing-melody', RIFF_SING_URL . 'assets/melody.js', array(), RIFF_SING_VERSION, true );
		wp_enqueue_script( 'riff-sing', RIFF_SING_URL . 'assets/sing.js', array( 'riff-sing-melody', 'wp-a11y' ), RIFF_SING_VERSION, true );
		wp_add_inline_script(
			'riff-sing',
			'window.riffSing = ' . wp_json_encode(
				array(
					'media'   => esc_url_raw( rest_url( 'wp/v2/media/' ) ),
					// The pitch detector runs in an AudioWorklet, which loads it by its address.
					'worklet' => esc_url_raw( add_query_arg( 'ver', RIFF_SING_VERSION, RIFF_SING_URL . 'assets/pitch.js' ) ),
				)
				+ self::strings()
				// Signed in, the media route answers for the account only with its nonce: a track in a
				// private or draft post is the account's to sing.
				+ ( is_user_logged_in() ? array( 'nonce' => wp_create_nonce( 'wp_rest' ) ) : array() )
				// Someone who can edit the Media Library is shown the way to a track's Melody field.
				+ ( current_user_can( 'upload_files' ) ? array(
					'edit' => admin_url( 'post.php?action=edit&post=' ),
					'add'  => __( 'Add a melody', 'riff-sing' ),
				) : array() ),
				JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE
			) . ';',
			'before'
		);
		// Riff's design tokens, such as --riff-fg-2, come from its riff-tokens stylesheet, not copies.
		wp_register_style( 'riff-sing', false, array( 'riff-tokens' ), RIFF_SING_VERSION );
		wp_enqueue_style( 'riff-sing' );
		wp_add_inline_style(
			'riff-sing',
			// The lane's colours, read by the script for its canvas.
			'#riff .riff-sing-lane{--sing-note:var(--riff-fg-3);--sing-hit:var(--riff-fg);--sing-gold:var(--riff-accent);--sing-voice:var(--riff-accent);--sing-line:var(--riff-line);position:relative;height:160px;margin:0 -8px;border-radius:8px;background:var(--riff-hover)}'
			. '#riff .riff-sing-lane canvas{display:block;width:100%;height:100%}'
			. '@media (forced-colors:active){#riff .riff-sing-lane{--sing-note:GrayText;--sing-hit:CanvasText;--sing-gold:CanvasText;--sing-voice:Highlight;--sing-line:CanvasText;border:1px solid CanvasText}}'
			. '#riff .riff-sing{display:flex;flex-direction:column;gap:12px}'
			. '#riff .riff-sing p{margin:0}'
			. '#riff .riff-sing-words{min-height:1.5em;font-size:20px;font-weight:600;line-height:1.5;color:var(--riff-fg-2)}'
			// The syllables already sung in the foreground, as Riff Lyrics lights its words.
			. '#riff .riff-sing-syllable.is-sung{color:var(--riff-fg)}'
			. '#riff .riff-sing-result{min-height:1.4em;color:var(--riff-fg);font-size:16px;font-weight:600}'
			. '#riff .riff-sing-controls{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px}'
			. '#riff .riff-sing-button{min-height:44px;padding:8px 16px;border-radius:999px;box-shadow:inset 0 0 0 1px var(--riff-fg-3);color:var(--riff-fg);font-size:14px;font-weight:600}'
			. '#riff .riff-sing-button:hover{box-shadow:inset 0 0 0 1px var(--riff-fg)}'
			. '#riff .riff-sing-button.is-primary{background:var(--riff-accent);box-shadow:none;color:var(--riff-bg)}'
			. '#riff .riff-sing-button[hidden],#riff .riff-sing-field[hidden]{display:none}'
			. '#riff .riff-sing-button:focus-visible,#riff .riff-sing-field select:focus-visible,#riff .riff-sing-add:focus-visible{outline:2px solid var(--riff-accent);outline-offset:2px}'
			. '#riff .riff-sing-field{display:flex;align-items:center;gap:8px;color:var(--riff-fg-2);font-size:14px}'
			. '#riff .riff-sing-field select{min-height:44px;max-width:100%;padding:4px 8px;border:1px solid var(--riff-fg-3);border-radius:8px;background:var(--riff-surface);color:var(--riff-fg);font:inherit}'
			. '#riff .riff-sing-status{min-height:1.4em;color:var(--riff-fg);font-size:14px}'
			. '#riff .riff-sing-note{color:var(--riff-fg-2);font-size:14px;line-height:1.5}'
			// Nothing to sing: one quiet message in the middle of the panel, as Riff Lyrics has it.
			. '#riff .riff-sing-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;box-sizing:border-box;min-height:min(320px,100%);height:100%;padding:32px 24px;text-align:center}'
			. '#riff .riff-sing-empty svg{width:40px;height:40px;fill:currentColor;color:var(--riff-fg-3)}'
			. '#riff .riff-sing-message{max-width:24em;margin:0;color:var(--riff-fg);font-size:16px;font-weight:600;line-height:1.4}'
			. '#riff .riff-sing-add{margin-top:4px;padding:8px 16px;border-radius:999px;box-shadow:inset 0 0 0 1px var(--riff-fg-3);color:var(--riff-fg);font-size:14px;font-weight:600;text-decoration:none}'
			. '#riff .riff-sing-add:hover{box-shadow:inset 0 0 0 1px var(--riff-fg)}'
		);
	}

	/**
	 * The Melody field on an audio file in the Media Library.
	 *
	 * @param array   $fields Fields.
	 * @param WP_Post $post   Attachment.
	 * @return array
	 */
	public static function field( $fields, $post ) {
		if ( ! $post instanceof WP_Post || ! str_starts_with( (string) $post->post_mime_type, 'audio/' ) ) {
			return $fields;
		}
		$fields[ self::FIELD ] = array(
			'label' => __( 'Melody', 'riff-sing' ),
			'input' => 'html',
			'html'  => sprintf(
				'<textarea name="attachments[%1$d][%2$s]" id="attachments-%1$d-%2$s" rows="6" spellcheck="false">%3$s</textarea>',
				(int) $post->ID,
				esc_attr( self::FIELD ),
				esc_textarea( self::melody( $post->ID ) )
			),
			'helps' => __( 'The tune to sing along with, in UltraStar\'s text format: a #BPM: line, then a line per syllable. Shown in the Sing tab beside Up next.', 'riff-sing' ),
		);
		return $fields;
	}

	/**
	 * Saves the field into the attachment's meta.
	 *
	 * @param array $post       Attachment data.
	 * @param array $attachment Submitted fields.
	 * @return array
	 */
	public static function save( $post, $attachment ) {
		$id = (int) ( $post['ID'] ?? 0 );
		if ( ! $id || ! isset( $attachment[ self::FIELD ] ) || ! current_user_can( 'edit_post', $id ) || ! self::audio( $id ) ) {
			return $post;
		}
		self::write( $id, wp_unslash( (string) $attachment[ self::FIELD ] ) );
		return $post;
	}
}

// PHPCS keeps a phpcs:set for the files after this one, so the domain goes back to Riff's here.
// phpcs:set WordPress.WP.I18n text_domain[] riff
