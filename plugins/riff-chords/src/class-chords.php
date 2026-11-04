<?php
/**
 * A chord chart beside Riff's Up next, with practice controls.
 *
 * @package Riff\Chords
 */

namespace Riff\Chords;

use WP_Post;

// Riff Chords is its own plugin with its own text domain; phpcs.xml.dist holds Riff's to `riff`.
// phpcs:set WordPress.WP.I18n text_domain[] riff-chords

defined( 'ABSPATH' ) || exit;

/**
 * The plugin.
 *
 * A song's chord chart is ChordPro, the format chord sheets are written in, with LRC's times on
 * its lines and chords so it can follow the music. WordPress reads nothing like it from a file, so
 * it is kept as the audio attachment's own post meta, `_riff_chords`, registered with
 * register_post_meta(), shown and edited in the Media Library beside the file's other details,
 * and read through the media REST route as `riff_chords`. Everything it does in the player goes
 * through Riff's documented surface: `riff_register_view()` and `riff_register_shortcut()` on the
 * `riff_register` action, the `riff_before_player` action and the `riff_track` filter, the
 * `riff.view`, `riff.track`, `riff.time`, `riff.play` and `riff.pause` actions, the `riff.menu`
 * filter, and `window.riff`'s `seek()`, `time()`, `playing()`, `speed()`, `shortcut()`,
 * `current()`, `queue()`, `play()` and `openView()`. The chart is a view of Now Playing, as the
 * lyrics are: it follows the song, so it takes the whole screen above the bar while it shows.
 */
final class Chords {

	/**
	 * The attachment's meta key.
	 */
	public const KEY = '_riff_chords';

	/**
	 * The REST field and the Media Library field.
	 */
	public const FIELD = 'riff_chords';

	/**
	 * The view's id.
	 */
	public const VIEW = 'chords';

	/**
	 * A piano's keys, the Chords view's icon.
	 */
	private const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5.5 16h-3v-5.5h.5c.55 0 1-.45 1-1V5h1v7.5c0 .55.45 1 1 1h.5V19zM5 5h2v7.5c0 .55.45 1 1 1h.5V19H5V5zm14 14h-3.5v-5.5h.5c.55 0 1-.45 1-1V5h2v14z"/></svg>';

	/**
	 * Hooks the meta, the view, the field and the script.
	 */
	public static function register(): void {
		// On init, since the meta's description is translated, and translations load from there.
		add_action( 'init', array( self::class, 'meta' ) );
		add_action( 'riff_register', array( self::class, 'view' ) );
		add_action( 'riff_register', array( self::class, 'shortcuts' ) );
		add_action( 'riff_before_player', array( self::class, 'enqueue' ) );
		add_filter( 'riff_track', array( self::class, 'track' ), 10, 2 );
		add_filter( 'attachment_fields_to_edit', array( self::class, 'field' ), 10, 2 );
		add_filter( 'attachment_fields_to_save', array( self::class, 'save' ), 10, 2 );
		add_action( 'rest_api_init', array( self::class, 'rest_field' ) );
		add_action( 'wp_entity_fields_api_init', array( self::class, 'entity_field' ) );
	}

	/**
	 * The chart's meta key, so WordPress sanitizes it and asks who may write it whichever way it is
	 * written.
	 */
	public static function meta(): void {
		register_post_meta(
			'attachment',
			self::KEY,
			array(
				'type'              => 'string',
				'description'       => __( 'The chord chart, in ChordPro.', 'riff-chords' ),
				'single'            => true,
				'sanitize_callback' => array( self::class, 'clean' ),
				'auth_callback'     => static fn( $allowed, $key, $id ) => current_user_can( 'edit_post', (int) $id ),
				'show_in_rest'      => false,
			)
		);
	}

	/**
	 * A typed chart, as plain text: no markup, its line breaks kept.
	 *
	 * @param mixed $text What was typed.
	 * @return string
	 */
	public static function clean( $text ): string {
		return sanitize_textarea_field( is_string( $text ) ? $text : '' );
	}

	/**
	 * Whether an attachment is a song, which is all a chart belongs to.
	 *
	 * @param int $id Attachment ID.
	 * @return bool
	 */
	private static function is_audio( int $id ): bool {
		return str_starts_with( (string) get_post_mime_type( $id ), 'audio/' );
	}

	/**
	 * A song's chart.
	 *
	 * @param int $id Attachment ID.
	 * @return string
	 */
	public static function get( int $id ): string {
		return (string) get_post_meta( $id, self::KEY, true );
	}

	/**
	 * Saves a chart, or clears it when it is empty.
	 *
	 * @param int    $id   Attachment ID.
	 * @param string $text The chart, unslashed.
	 */
	private static function put( int $id, string $text ): void {
		$text = self::clean( $text );
		if ( '' === $text ) {
			delete_post_meta( $id, self::KEY );
			return;
		}
		update_post_meta( $id, self::KEY, wp_slash( $text ) );
	}

	/**
	 * `riff_chords` on wp/v2/media: the chart the view shows, readable wherever the file is, and
	 * written only by whoever may edit the file.
	 */
	public static function rest_field(): void {
		register_rest_field(
			'attachment',
			self::FIELD,
			array(
				'get_callback'    => static function ( array $item ): ?string {
					$id = (int) $item['id'];
					return self::is_audio( $id ) ? self::get( $id ) : null;
				},
				'update_callback' => static function ( $value, WP_Post $post ) {
					if ( ! current_user_can( 'edit_post', $post->ID ) ) {
						return new \WP_Error( 'rest_cannot_edit', __( 'Sorry, you are not allowed to edit this file.', 'riff-chords' ), array( 'status' => rest_authorization_required_code() ) );
					}
					if ( ! self::is_audio( $post->ID ) ) {
						return new \WP_Error( 'rest_invalid_param', __( 'Only an audio file has a chord chart.', 'riff-chords' ), array( 'status' => 400 ) );
					}
					self::put( $post->ID, (string) $value );
					return true;
				},
				'schema'          => array(
					'description' => __( 'The chord chart, in ChordPro, with LRC times to follow the music.', 'riff-chords' ),
					'type'        => array( 'string', 'null' ),
					'context'     => array( 'view', 'edit' ),
				),
			)
		);
	}

	/**
	 * The chart as a field of the attachment entity, so WordPress 7.2's Media Library shows and
	 * edits it in its views and forms beside the file's other details.
	 */
	public static function entity_field(): void {
		if ( ! function_exists( 'wp_register_entity_fields' ) ) {
			return;
		}
		wp_register_entity_fields(
			'riff-chords',
			'postType',
			'attachment',
			array(
				array(
					'id'            => self::FIELD,
					'type'          => 'text',
					'label'         => __( 'Chords', 'riff-chords' ),
					'Edit'          => array(
						'control' => 'textarea',
						'rows'    => 8,
					),
					'enableSorting' => false,
					'filterBy'      => false,
				),
			)
		);
	}

	/**
	 * The Chords view: a screen of Now Playing, its button in the bar after Lyrics' and before Up
	 * next's, as the chart follows the song.
	 */
	public static function view(): void {
		riff_register_view(
			self::VIEW,
			array(
				'label' => __( 'Chords', 'riff-chords' ),
				'icon'  => self::ICON,
				'order' => 34,
			)
		);
	}

	/**
	 * The practice controls' keys, listed on the listener's profile with Riff's own and acting while
	 * the Chords view shows a chart. Letters, as every layout has them where it has Riff's J, K and
	 * L, chosen for what they do: A for the loop's A and B, S slower, F faster, D down and U up.
	 */
	public static function shortcuts(): void {
		$keys = array(
			'chords-loop'   => array( 'a', __( 'Set the loop’s start, then its end, then clear it, in the Chords view', 'riff-chords' ) ),
			'chords-slower' => array( 's', __( 'Slower, in the Chords view', 'riff-chords' ) ),
			'chords-faster' => array( 'f', __( 'Faster, in the Chords view', 'riff-chords' ) ),
			'chords-down'   => array( 'd', __( 'Transpose down a semitone, in the Chords view', 'riff-chords' ) ),
			'chords-up'     => array( 'u', __( 'Transpose up a semitone, in the Chords view', 'riff-chords' ) ),
		);
		foreach ( $keys as $id => list( $key, $label ) ) {
			riff_register_shortcut(
				$id,
				array(
					'key'   => $key,
					'label' => $label,
				)
			);
		}
	}

	/**
	 * Marks a track whose file has a chart, `chords: true`, so the track menu offers Practice this
	 * for it without asking the server first: only where the media route would hand the visitor
	 * that chart, as a file in a draft or private post is not theirs to read. The meta is read
	 * from the cache WordPress fills as the file's details are read.
	 *
	 * @param array $track         The track.
	 * @param int   $attachment_id Attachment ID, or 0 for a file outside the Media Library.
	 * @return array
	 */
	public static function track( $track, $attachment_id ) {
		$id = (int) $attachment_id;
		if ( ! is_array( $track ) || $id <= 0 || '' === self::get( $id ) ) {
			return $track;
		}
		static $media = null;
		$post         = get_post( $id );
		$media      ??= new \WP_REST_Attachments_Controller( 'attachment' );
		if ( $post instanceof WP_Post && $media->check_read_permission( $post ) ) {
			$track['chords'] = true;
		}
		return $track;
	}

	/**
	 * Loads the scripts on pages where Riff's player renders, and nowhere else.
	 */
	public static function enqueue(): void {
		wp_enqueue_script( 'riff-chords-timing', RIFF_CHORDS_URL . 'assets/timing.js', array(), RIFF_CHORDS_VERSION, true );
		wp_enqueue_script( 'riff-chords-chart', RIFF_CHORDS_URL . 'assets/chart.js', array( 'riff-chords-timing' ), RIFF_CHORDS_VERSION, true );
		wp_enqueue_script( 'riff-chords', RIFF_CHORDS_URL . 'assets/chords.js', array( 'riff-chords-timing', 'riff-chords-chart', 'wp-hooks', 'wp-a11y' ), RIFF_CHORDS_VERSION, true );
		wp_add_inline_script(
			'riff-chords',
			'window.riffChords = ' . wp_json_encode(
				array(
					'media'       => esc_url_raw( rest_url( 'wp/v2/media/' ) ),
					'none'        => __( 'No chords for this track.', 'riff-chords' ),
					'idle'        => __( 'Play something to see its chords.', 'riff-chords' ),
					'error'       => __( 'The chords could not load.', 'riff-chords' ),
					'practice'    => __( 'Practice', 'riff-chords' ),
					'practiceOn'  => __( 'Practice this', 'riff-chords' ),
					'speed'       => __( 'Speed', 'riff-chords' ),
					'slower'      => __( 'Slower', 'riff-chords' ),
					'faster'      => __( 'Faster', 'riff-chords' ),
					'transpose'   => __( 'Transpose', 'riff-chords' ),
					'down'        => __( 'Down a semitone', 'riff-chords' ),
					'up'          => __( 'Up a semitone', 'riff-chords' ),
					'capo'        => __( 'Capo', 'riff-chords' ),
					'capoDown'    => __( 'Capo down a fret', 'riff-chords' ),
					'capoUp'      => __( 'Capo up a fret', 'riff-chords' ),
					'loop'        => __( 'Loop', 'riff-chords' ),
					'loopFrom'    => __( 'Loop from here', 'riff-chords' ),
					'loopTo'      => __( 'Loop to here', 'riff-chords' ),
					'countIn'     => __( 'Count in', 'riff-chords' ),
					/* translators: %s: where the loop starts, such as 1:05. */
					'loopFromAt'  => __( 'Loop from %s', 'riff-chords' ),
					/* translators: 1: where the loop starts, such as 1:05; 2: where it ends, such as 1:20. */
					'loopOn'      => __( 'Looping from %1$s to %2$s', 'riff-chords' ),
					'loopOff'     => __( 'Loop cleared', 'riff-chords' ),
					/* translators: %s: a section of the song, such as Chorus. */
					'loopSection' => __( 'Loop %s', 'riff-chords' ),
					/* translators: %s: the chord that comes next, such as Am. */
					'next'        => __( 'Next: %s', 'riff-chords' ),
					/* translators: %s: the song's key, such as G. */
					'key'         => __( 'Key of %s', 'riff-chords' ),
					/* translators: %s: beats per minute, as the chart gives them. */
					'tempo'       => __( '%s BPM', 'riff-chords' ),
					/* translators: %s: a chord, such as Cadd9. */
					'noShape'     => __( 'No diagram for %s', 'riff-chords' ),
					/* translators: 1: a chord, such as G; 2: the fret for each string from the lowest, such as "3, 2, open, open, open, 3". */
					'fingering'   => __( '%1$s, from the low string: %2$s', 'riff-chords' ),
					/* translators: 1: a chord, such as G; 2: the fret for each string from the G string, such as "open, 2, 3, 2". */
					'ukeFrets'    => __( '%1$s, from the G string: %2$s', 'riff-chords' ),
					/* translators: 1: a chord, such as G7; 2: its notes, such as "G, B, D, F". */
					'pianoKeys'   => __( '%1$s, its notes %2$s', 'riff-chords' ),
					'open'        => _x( 'open', 'a string played without a finger on it', 'riff-chords' ),
					'muted'       => _x( 'not played', 'a guitar string', 'riff-chords' ),
					'instrument'  => __( 'Instrument', 'riff-chords' ),
					'instruments' => array(
						'guitar'  => __( 'Guitar', 'riff-chords' ),
						'ukulele' => __( 'Ukulele', 'riff-chords' ),
						'piano'   => _x( 'Piano', 'the instrument', 'riff-chords' ),
					),
					'sections'    => array(
						'verse'  => __( 'Verse', 'riff-chords' ),
						'chorus' => __( 'Chorus', 'riff-chords' ),
						'bridge' => __( 'Bridge', 'riff-chords' ),
						'tab'    => __( 'Tab', 'riff-chords' ),
						'grid'   => __( 'Grid', 'riff-chords' ),
					),
				)
				// Signed in, the media route answers for the account only with its nonce: a track in a
				// private or draft post is the account's to read.
				+ ( is_user_logged_in() ? array( 'nonce' => wp_create_nonce( 'wp_rest' ) ) : array() )
				// Someone who can edit the Media Library is shown the way to a track's Chords field.
				+ ( current_user_can( 'upload_files' ) ? array(
					'edit' => admin_url( 'post.php?action=edit&post=' ),
					'add'  => __( 'Add chords', 'riff-chords' ),
				) : array() )
			) . ';',
			'before'
		);
		// Riff's design tokens, such as --riff-fg-2, come from its riff-tokens stylesheet, not copies.
		wp_register_style( 'riff-chords', false, array( 'riff-tokens' ), RIFF_CHORDS_VERSION );
		wp_enqueue_style( 'riff-chords' );
		wp_add_inline_style( 'riff-chords', self::css() );
	}

	/**
	 * The view's styles, under #riff as the player's own are, so they win over its button styles.
	 *
	 * @return string
	 */
	private static function css(): string {
		return '.riff-chords{display:flex;flex:1;flex-direction:column;gap:12px;min-height:0}'
			. '.riff-chords-head{display:flex;flex-direction:column;gap:12px}'
			// The chord being played, its fingering beside its name; for a chart without times, every chord in it in a row.
			. '.riff-chords-now{display:flex;align-items:center;gap:16px;min-height:96px;overflow-x:auto}'
			. '.riff-chords-now.is-waiting{opacity:.6}'
			. '#riff .riff-chords-shape{flex:none;margin:0;color:var(--riff-fg);text-align:center}'
			. '#riff .riff-chords-shape svg{display:block;width:74px;height:66px;overflow:visible}'
			. '#riff .riff-chords-now > .riff-chords-shape svg{width:96px;height:86px}'
			// A piano's two octaves, wider than a fretboard is tall.
			. '#riff .riff-chords-shape svg.riff-chords-keys{width:112px;height:52px}'
			. '#riff .riff-chords-now > .riff-chords-shape svg.riff-chords-keys{width:148px;height:69px}'
			// A piano's keys are white and black whatever the theme, each dot the other colour.
			. '.riff-chords-piano-key{fill:#f5f5f5;stroke:#1c1c1c;stroke-width:.6}'
			. '.riff-chords-piano-key.is-black,.riff-chords-keys .riff-chords-dot{fill:#1c1c1c}'
			. '.riff-chords-keys .riff-chords-dot.is-black{fill:#f5f5f5}'
			. '.riff-chords-string,.riff-chords-fret{stroke:var(--riff-fg-3);stroke-width:1}'
			. '.riff-chords-nut{stroke:var(--riff-fg);stroke-width:3}'
			. '.riff-chords-dot{fill:var(--riff-accent)}'
			. '.riff-chords-open{fill:none;stroke:var(--riff-fg-2);stroke-width:1.2}'
			. '.riff-chords-mark,.riff-chords-base{fill:var(--riff-fg-2);font-size:9px}'
			. '.riff-chords-shape-none{max-width:8em;color:var(--riff-fg-2);font-size:12px}'
			. '#riff .riff-chords-name{margin:0;color:var(--riff-fg);font-size:28px;font-weight:700;line-height:1.1}'
			. '#riff .riff-chords-shape .riff-chords-name{margin-bottom:4px;font-size:14px}'
			. '#riff .riff-chords-next,#riff .riff-chords-meta{margin:4px 0 0;color:var(--riff-fg-2);font-size:14px}'
			. '#riff .riff-chords-meta{display:flex;gap:12px;margin:0}'
			. '#riff .riff-chords-meta[hidden],.riff-chords-key:empty{display:none}'
			// The practice controls: steppers and the loop, wrapping onto as many rows as the panel needs.
			. '.riff-chords-tools{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center}'
			. '.riff-chords-stepper,.riff-chords-loop{display:flex;align-items:center;gap:4px}'
			. '.riff-chords-label{margin-right:4px;color:var(--riff-fg-2);font-size:12px;font-weight:500;text-transform:uppercase}'
			. '.riff-chords-value{min-width:3em;color:var(--riff-fg);font-size:14px;font-variant-numeric:tabular-nums;text-align:center}'
			. '#riff .riff-chords-tools [hidden]{display:none}'
			. '.riff-chords-instrument{display:flex;align-items:center;gap:4px}'
			. '#riff .riff-chords-step,#riff .riff-chords-ab,#riff .riff-chords-pick,#riff .riff-chords-loop-toggle,#riff .riff-chords-count-in,#riff .riff-chords-loop-section{all:unset;box-sizing:border-box;min-width:44px;height:44px;padding:0 12px;border-radius:999px;box-shadow:inset 0 0 0 1px var(--riff-line);color:var(--riff-fg);cursor:pointer;font-size:14px;font-weight:600;font-variant-numeric:tabular-nums;line-height:44px;text-align:center}'
			. '#riff .riff-chords-step:hover,#riff .riff-chords-ab:hover,#riff .riff-chords-pick:hover,#riff .riff-chords-loop-toggle:hover,#riff .riff-chords-count-in:hover,#riff .riff-chords-loop-section:hover{background:var(--riff-hover)}'
			// The count-in's beat, counted out beside it, its room kept between counts so nothing moves.
			. '.riff-chords-count{min-width:1.5em;color:var(--riff-accent);font-size:20px;font-weight:700;font-variant-numeric:tabular-nums;text-align:center}'
			. '#riff .riff-chords-loop-toggle[aria-pressed="true"],#riff .riff-chords-pick[aria-pressed="true"],#riff .riff-chords-count-in[aria-pressed="true"]{background:var(--riff-accent);box-shadow:none;color:var(--riff-bg)}'
			. '#riff .riff-chords-tools button:disabled{cursor:default;opacity:.4}'
			. '#riff .riff-chords-tools button:focus-visible,#riff .riff-chords-chart button:focus-visible{outline:2px solid var(--riff-accent);outline-offset:2px}'
			// The chart: each section under its name, each line its chords over its words.
			. '#riff .riff-chords-chart{flex:1;min-height:120px;margin:0;padding:0;overflow-y:auto;list-style:none;overscroll-behavior:contain}'
			. '#riff .riff-chords-section{margin:0 0 20px}'
			. '#riff .riff-chords-heading{display:flex;align-items:center;gap:8px;margin:0 0 4px;color:var(--riff-fg-2);font-size:12px;font-weight:600;text-transform:uppercase}'
			. '#riff .riff-chords-jump{all:unset;cursor:pointer;color:var(--riff-fg-2)}'
			. '#riff .riff-chords-jump:hover{color:var(--riff-fg);text-decoration:underline}'
			. '#riff .riff-chords-loop-section{min-width:0;height:32px;padding:0 10px;font-size:12px;line-height:32px;text-transform:none}'
			. '#riff .riff-chords-lines{margin:0;padding:0;list-style:none}'
			. '#riff .riff-chords-line{margin:0;color:var(--riff-fg-2);font-size:16px;line-height:1.4}'
			. '#riff .riff-chords-line.riff-chords-gap{margin-bottom:12px}'
			. '#riff .riff-chords-line.is-comment{color:var(--riff-fg-3);font-style:italic}'
			. '#riff .riff-chords-line.is-tab{font-family:ui-monospace,monospace;font-size:13px;white-space:pre}'
			. '#riff .riff-chords-seek{all:unset;display:block;box-sizing:border-box;width:100%;padding:2px 0;cursor:pointer}'
			. '#riff .riff-chords-seek:hover,#riff [aria-current] > .riff-chords-seek{color:var(--riff-fg)}'
			// A line is pressed to seek, and still read and copied: it selects as the page around it does, where riff-tokens keeps a button's text from selecting.
			. '#riff .riff-chords-seek{-webkit-user-select:auto!important;user-select:auto!important}'
			. '.riff-chords-piece{display:inline-flex;flex-direction:column;vertical-align:bottom}'
			. '.riff-chords-chord{min-height:1.4em;padding-right:.4em;color:var(--riff-accent);font-size:14px;font-weight:700;white-space:nowrap}'
			. '.riff-chords-chord.is-current{border-radius:4px;background:var(--riff-accent);color:var(--riff-bg)}'
			. '.riff-chords-words{white-space:pre}'
			// No chart, nothing playing, or none could load: one quiet message in the middle of the panel.
			. '.riff-chords-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;box-sizing:border-box;min-height:min(320px,100%);height:100%;padding:32px 24px;text-align:center}'
			. '#riff .riff-chords-empty svg{width:40px;height:40px;fill:currentColor;color:var(--riff-fg-3)}'
			. '.riff-chords-empty .riff-chords-note{max-width:24em;margin:0;color:var(--riff-fg);font-size:16px;font-weight:600;line-height:1.4}'
			. '#riff .riff-chords-add{margin-top:4px;padding:8px 16px;border-radius:999px;box-shadow:inset 0 0 0 1px var(--riff-fg-3);color:var(--riff-fg);font-size:14px;font-weight:600;text-decoration:none}'
			. '#riff .riff-chords-add:hover{box-shadow:inset 0 0 0 1px var(--riff-fg)}';
	}

	/**
	 * The Chords field on an audio file in the Media Library.
	 *
	 * @param array   $fields Fields.
	 * @param WP_Post $post   Attachment.
	 * @return array
	 */
	public static function field( $fields, $post ) {
		if ( ! $post instanceof WP_Post || ! self::is_audio( $post->ID ) ) {
			return $fields;
		}
		$fields[ self::FIELD ] = array(
			'label' => __( 'Chords', 'riff-chords' ),
			'input' => 'html',
			'html'  => sprintf(
				'<textarea name="attachments[%1$d][riff_chords]" id="attachments-%1$d-riff_chords" rows="8">%2$s</textarea>',
				(int) $post->ID,
				esc_textarea( self::get( $post->ID ) )
			),
			'helps' => __( 'A chord chart in ChordPro: [G] before the word the chord falls on, and [mm:ss.xx] before a line or a chord to follow the music. Shown in the player’s Chords view.', 'riff-chords' ),
		);
		return $fields;
	}

	/**
	 * Saves the field.
	 *
	 * @param array $post       Attachment data.
	 * @param array $attachment Submitted fields.
	 * @return array
	 */
	public static function save( $post, $attachment ) {
		$id = (int) ( $post['ID'] ?? 0 );
		if ( ! $id || ! isset( $attachment[ self::FIELD ] ) || ! self::is_audio( $id ) || ! current_user_can( 'edit_post', $id ) ) {
			return $post;
		}
		self::put( $id, wp_unslash( (string) $attachment[ self::FIELD ] ) );
		return $post;
	}
}

// PHPCS keeps a phpcs:set for the files after this one, so the domain goes back to Riff's here.
// phpcs:set WordPress.WP.I18n text_domain[] riff
