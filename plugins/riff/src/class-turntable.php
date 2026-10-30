<?php
/**
 * The turntable in Now Playing, the site's choice under Settings › Media.
 *
 * @since 5.8.0
 * @package Riff
 */

namespace Riff;

defined( 'ABSPATH' ) || exit;

/**
 * Where Now Playing has the room, the record comes out of its sleeve onto a turntable, and a touch
 * screen on its side is the deck itself. A site that wants the cover on its own turns it off under
 * Settings › Media, where WordPress keeps how media is shown, or with the `riff_turntable` filter.
 * Off, Now Playing is the cover, and a phone on its side or a folding phone gets the cover beside
 * the controls. The setting is a site option, so on a network each site keeps its own.
 */
final class Turntable {

	/**
	 * The site option: true while the turntable shows. Absent, it shows.
	 *
	 * @since 5.8.0
	 */
	public const OPTION = 'riff_turntable';

	/**
	 * Hooks the setting and its field.
	 *
	 * @since 5.8.0
	 */
	public static function register(): void {
		add_action( 'init', array( self::class, 'setting' ) );
		add_action( 'admin_init', array( self::class, 'field' ) );
	}

	/**
	 * The setting, on Settings › Media and in the REST settings route.
	 *
	 * @since 5.8.0
	 */
	public static function setting(): void {
		register_setting(
			'media',
			self::OPTION,
			array(
				'type'              => 'boolean',
				'description'       => __( 'Whether Now Playing shows the record and the turntable.', 'riff' ),
				'default'           => true,
				'sanitize_callback' => 'rest_sanitize_boolean',
				'show_in_rest'      => true,
			)
		);
	}

	/**
	 * The checkbox under Settings › Media.
	 *
	 * @since 5.8.0
	 */
	public static function field(): void {
		add_settings_field(
			self::OPTION,
			__( 'Now Playing', 'riff' ),
			static function (): void {
				?>
				<label for="riff_turntable">
					<input name="riff_turntable" type="checkbox" id="riff_turntable" value="1" <?php checked( self::on() ); ?>>
					<?php esc_html_e( 'Take the record out onto a turntable while an album plays', 'riff' ); ?>
				</label>
				<?php
			},
			'media',
			'default'
		);
	}

	/**
	 * Whether Now Playing shows the turntable.
	 *
	 * @since 5.8.0
	 *
	 * @return bool
	 */
	public static function on(): bool {
		/**
		 * Filters whether Now Playing shows the record and the turntable. Off, it shows the cover on
		 * its own, and a touch screen on its side shows the cover beside the controls.
		 *
		 * @since 5.8.0
		 *
		 * @param bool $on Whether it shows, from Settings › Media. Default true.
		 */
		return (bool) apply_filters( 'riff_turntable', rest_sanitize_boolean( get_option( self::OPTION, true ) ) );
	}

	/**
	 * Tells the player when the turntable is off.
	 *
	 * @since 5.8.0
	 *
	 * @param array $data The player's data.
	 * @return array
	 */
	public static function player_data( $data ) {
		if ( is_array( $data ) && ! self::on() ) {
			$data['turntable'] = false;
		}
		return $data;
	}
}
