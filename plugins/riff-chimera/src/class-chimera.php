<?php
/**
 * CHIMERA singing the song, as a panel beside the page.
 *
 * @package Riff\Chimera
 */

namespace Riff\Chimera;

// Riff Chimera is its own plugin with its own text domain; phpcs.xml.dist holds Riff's to `riff`.
// phpcs:set WordPress.WP.I18n text_domain[] riff-chimera

defined( 'ABSPATH' ) || exit;

/**
 * The plugin.
 *
 * CHIMERA (github.com/jamesondh/chimera-vocal-synth, MIT) is a physical model of a human voice: lungs,
 * folds and a vocal tract simulated in real time, with no recordings in it. Riff Chimera has it sing
 * the melody Riff Sing keeps for a track, along with the recording.
 *
 * The melody is Riff Sing's, not a second copy: it is read in the browser from Riff Sing's
 * `riff_sing_melody` and `riff_sing_midi` fields on the media REST route, so a visitor hears a
 * melody only for a file that route already shows them, and the view's button shows only for a
 * track Riff Sing marked `melody` (its `riff_track` filter). That is why Riff Sing is a required
 * plugin. Riff Chimera stores nothing of its own.
 *
 * Everything else happens in the browser, and only once the view is opened: CHIMERA's engine (a
 * WebAssembly module), its AudioWorklet and its pronouncing dictionary are fetched from this
 * plugin's own folder, the voice starts at the listener's press, and nothing is sent anywhere.
 * Everything it does with Riff goes through Riff's documented surface: `riff_register_view()` on the
 * `riff_register` action, the `riff_before_player` action, and the `riff.view`, `riff.pause`
 * and `riff.ended` actions with `window.riff` in the player.
 */
final class Chimera {

	/**
	 * The view's id.
	 */
	public const VIEW = 'chimera';

	/**
	 * A face in profile with a sound coming from its mouth, the view's icon.
	 */
	private const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9.5 19.25V16.5H7.75A1.75 1.75 0 0 1 6 14.75V12.5L4.75 12L6 9.25A5.25 5.25 0 0 1 11.25 4.75H11.5A4.75 4.75 0 0 1 14 13.6V19.25"/><path d="M17 8.75C17.8 9.6 17.8 11.4 17 12.25M19.25 7C20.75 8.75 20.75 12.25 19.25 14"/></svg>';

	/**
	 * Hooks the view and the scripts.
	 */
	public static function register(): void {
		add_action( 'riff_register', array( self::class, 'view' ) );
		add_action( 'riff_before_player', array( self::class, 'enqueue' ) );
	}

	/**
	 * The Chimera view, a panel beside the page, where About and Up next open, so CHIMERA sings on
	 * while the listener browses and opens Now Playing, its heads as large as the panel is wide. Its
	 * button in the bar comes after Sing's, as it sings the same melody.
	 */
	public static function view(): void {
		riff_register_view(
			self::VIEW,
			array(
				'label' => __( 'Chimera', 'riff-chimera' ),
				'icon'  => self::ICON,
				'order' => 34,
				'place' => 'side',
			)
		);
	}

	/**
	 * The words the panel shows, translated here because the script is not a module.
	 *
	 * @return array
	 */
	private static function strings(): array {
		return array(
			'idle'     => __( 'Play something for CHIMERA to sing along with.', 'riff-chimera' ),
			'none'     => __( 'No melody for this track, so there is nothing for CHIMERA to sing.', 'riff-chimera' ),
			'broken'   => __( 'This track\'s melody couldn\'t be read.', 'riff-chimera' ),
			'error'    => __( 'The melody could not load.', 'riff-chimera' ),
			'loading'  => __( 'Waking CHIMERA up…', 'riff-chimera' ),
			'failed'   => __( 'CHIMERA couldn\'t start in this browser.', 'riff-chimera' ),
			'stalled'  => __( 'CHIMERA stopped singing because its engine failed. Press Sing along to start it again.', 'riff-chimera' ),
			'intro'    => __( 'CHIMERA is a voice made of nothing but physics: lungs, vocal folds and a throat and mouth simulated as it sings. It sings this track\'s melody along with the recording.', 'riff-chimera' ),
			'private'  => __( 'It runs in your browser. Nothing is recorded or sent.', 'riff-chimera' ),
			'start'    => __( 'Sing along', 'riff-chimera' ),
			'stop'     => __( 'Stop', 'riff-chimera' ),
			'level'    => __( 'Voice', 'riff-chimera' ),
			'alone'    => __( 'To hear the voice alone, turn the player\'s volume down: the voice has its own.', 'riff-chimera' ),
			'singing'  => __( 'CHIMERA is singing along.', 'riff-chimera' ),
			'waiting'  => __( 'CHIMERA sings when the music plays.', 'riff-chimera' ),
			'stopped'  => __( 'CHIMERA stopped singing.', 'riff-chimera' ),
			/* translators: %s: the language the melody's words are in, as its chart names it, such as French. */
			'language' => __( 'CHIMERA reads English and Korean, and these words are in %s, so it sings every note on "ah".', 'riff-chimera' ),
			'script'   => __( 'CHIMERA reads English and Korean, and these words are written in another script, so it sings every note on "ah".', 'riff-chimera' ),
			'credit'   => __( 'The voice is CHIMERA, by Jameson Hodge.', 'riff-chimera' ),
			'head'     => __( 'CHIMERA\'s head in cutaway, its tongue, jaw, lips and soft palate moving as it sings.', 'riff-chimera' ),
			/* translators: %s: 1 or 2, for a duet's singer the chart gives no name. */
			'singer'   => __( 'Singer %s', 'riff-chimera' ),
			'solo'     => __( 'Solo', 'riff-chimera' ),
			/* translators: %s: a singer's name, such as Singer 1. */
			'soloName' => __( 'Hear %s alone', 'riff-chimera' ),
			/* translators: %s: how many voices CHIMERA sings at once, such as 2. */
			'more'     => __( 'This melody has more singers than CHIMERA sings at once here, so the first %s are sung.', 'riff-chimera' ),
		);
	}

	/**
	 * Loads the scripts on pages where Riff's player renders, and nowhere else. CHIMERA itself is
	 * not among them: chimera.js fetches it the first time the view opens.
	 */
	public static function enqueue(): void {
		wp_enqueue_script( 'riff-chimera-melody', RIFF_CHIMERA_URL . 'assets/melody.js', array(), RIFF_CHIMERA_VERSION, true );
		wp_enqueue_script( 'riff-chimera-midi', RIFF_CHIMERA_URL . 'assets/midi.js', array(), RIFF_CHIMERA_VERSION, true );
		wp_enqueue_script( 'riff-chimera-voice', RIFF_CHIMERA_URL . 'assets/voice.js', array(), RIFF_CHIMERA_VERSION, true );
		wp_enqueue_script( 'riff-chimera', RIFF_CHIMERA_URL . 'assets/chimera.js', array( 'riff-chimera-melody', 'riff-chimera-midi', 'riff-chimera-voice', 'wp-a11y' ), RIFF_CHIMERA_VERSION, true );
		$file = static fn( string $name ): string => esc_url_raw( add_query_arg( 'ver', RIFF_CHIMERA_VERSION, RIFF_CHIMERA_URL . 'assets/chimera/' . $name ) );
		wp_add_inline_script(
			'riff-chimera',
			'window.riffChimera = ' . wp_json_encode(
				array(
					'media'   => esc_url_raw( rest_url( 'wp/v2/media/' ) ),
					// CHIMERA's own build, fetched from here when the view first opens (assets/chimera/SOURCE.txt).
					'bundle'  => $file( 'chimera.js' ),
					'wasm'    => $file( 'chimera.wasm' ),
					'worklet' => $file( 'processor.js' ),
					'dict'    => $file( 'cmudict.txt' ),
					'source'  => 'https://github.com/jamesondh/chimera-vocal-synth',
				)
				+ self::strings()
				// Signed in, the media route answers for the account only with its nonce, as for Riff Sing.
				+ ( is_user_logged_in() ? array( 'nonce' => wp_create_nonce( 'wp_rest' ) ) : array() ),
				JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE
			) . ';',
			'before'
		);
		// Riff's design tokens, such as --riff-fg-2, come from its riff-tokens stylesheet, not copies.
		wp_register_style( 'riff-chimera', false, array( 'riff-tokens' ), RIFF_CHIMERA_VERSION );
		wp_enqueue_style( 'riff-chimera' );
		wp_add_inline_style(
			'riff-chimera',
			// The heads are the panel's point: a head is drawn as wide as the panel lets it, upright as a
			// head is (7:10), no taller than a little over half the screen so the words and the controls
			// stay in sight beneath it. A duet's two face each other side by side, and stack where the
			// panel is too narrow for two of a size to see. Then the words, the controls, the status and
			// the notes, scrolling with the panel. A head's canvas is redrawn at its size and the
			// screen's pixel ratio, the head fitted to it, by CHIMERA's own drawing. The selectors hold
			// in the player (#riff) and in the Listen app (.riff-app), whichever holds the panel.
			':is(#riff,.riff-app) .riff-chimera{container-type:inline-size;display:flex;flex-direction:column;gap:12px;color:var(--riff-fg)}'
			. ':is(#riff,.riff-app) .riff-chimera-stage{display:flex;flex-direction:column;gap:12px}'
			. ':is(#riff,.riff-app) .riff-chimera-heads{display:grid;grid-template-columns:minmax(0,1fr);gap:16px 8px}'
			. '@container (min-width:320px){:is(#riff,.riff-app) .riff-chimera.is-duet .riff-chimera-heads{grid-template-columns:repeat(2,minmax(0,1fr))}}'
			. ':is(#riff,.riff-app) .riff-chimera-singer{display:flex;flex-direction:column;gap:8px;min-width:0}'
			. ':is(#riff,.riff-app) .riff-chimera-head{align-self:center;width:min(100%,calc(min(56vh,560px) * 0.7));aspect-ratio:7/10;border-radius:8px;overflow:hidden;background:#000}'
			. ':is(#riff,.riff-app) .riff-chimera-head canvas{display:block;width:100%;height:100%}'
			. '@media (forced-colors:active){:is(#riff,.riff-app) .riff-chimera-head{border:1px solid CanvasText}}'
			. ':is(#riff,.riff-app) .riff-chimera-line{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px}'
			. ':is(#riff,.riff-app) .riff-chimera-name{color:var(--riff-fg);font-size:14px;font-weight:600}'
			. ':is(#riff,.riff-app) .riff-chimera-solo[aria-pressed="true"]{background:var(--riff-accent);box-shadow:none;color:var(--riff-bg)}'
			. ':is(#riff,.riff-app) .riff-chimera p{margin:0}'
			. ':is(#riff,.riff-app) .riff-chimera-words{flex:1 1 100%;min-height:1.5em;font-size:16px;font-weight:600;line-height:1.5;color:var(--riff-fg-2);overflow-wrap:anywhere}'
			. ':is(#riff,.riff-app) .riff-chimera-syllable.is-sung{color:var(--riff-fg)}'
			. ':is(#riff,.riff-app) .riff-chimera-controls{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px}'
			. ':is(#riff,.riff-app) .riff-chimera-button{min-height:44px;padding:8px 16px;border:0;border-radius:999px;background:none;box-shadow:inset 0 0 0 1px var(--riff-fg-3);color:var(--riff-fg);font:inherit;font-size:14px;font-weight:600;cursor:pointer}'
			. ':is(#riff,.riff-app) .riff-chimera-button:hover{box-shadow:inset 0 0 0 1px var(--riff-fg)}'
			. ':is(#riff,.riff-app) .riff-chimera-button.is-primary{background:var(--riff-accent);box-shadow:none;color:var(--riff-bg)}'
			. ':is(#riff,.riff-app) .riff-chimera-button[hidden]{display:none}'
			. ':is(#riff,.riff-app) .riff-chimera-button:focus-visible,:is(#riff,.riff-app) .riff-chimera-field input:focus-visible,:is(#riff,.riff-app) .riff-chimera-note a:focus-visible{outline:2px solid var(--riff-accent);outline-offset:2px}'
			. ':is(#riff,.riff-app) .riff-chimera-field{display:flex;flex:1 1 100%;align-items:center;gap:8px;min-height:44px;color:var(--riff-fg-2);font-size:14px}'
			. ':is(#riff,.riff-app) .riff-chimera-field input{flex:1;min-width:0;max-width:12rem;margin:0;accent-color:var(--riff-accent)}'
			. ':is(#riff,.riff-app) .riff-chimera-status{min-height:1.4em;color:var(--riff-fg);font-size:14px}'
			. ':is(#riff,.riff-app) .riff-chimera-note{color:var(--riff-fg-2);font-size:13px;line-height:1.5}'
			. ':is(#riff,.riff-app) .riff-chimera-note a{color:inherit}'
			. ':is(#riff,.riff-app) .riff-chimera-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px 12px;text-align:center}'
			. ':is(#riff,.riff-app) .riff-chimera-empty svg{width:40px;height:40px;color:var(--riff-fg-3)}'
			. ':is(#riff,.riff-app) .riff-chimera-message{max-width:24em;margin:0;color:var(--riff-fg);font-size:15px;font-weight:600;line-height:1.4}'
		);
	}
}

// PHPCS keeps a phpcs:set for the files after this one, so the domain goes back to Riff's here.
// phpcs:set WordPress.WP.I18n text_domain[] riff
